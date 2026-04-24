/**
 * Client-side port of the selection-edit protocol (tighten / rewrite / expand).
 *
 * Previously these ran on the Next.js server at /api/selection-edit/*, which
 * enforced word-count bounds and citation-verbatim validation. Under the
 * architecture inversion, when the Swift AI bridge is present we call
 * Anthropic directly and validate in the browser with the same discipline.
 * The server routes are kept as an HTTP fallback for environments without
 * the Swift bridge (dev server, tests) and will be deleted in Phase 5.
 *
 * These checks are the "protocols over prompts" guarantee — the AI is never
 * trusted to self-enforce word count or citation. The code enforces, and a
 * failing output is refused, not silently accepted.
 */

import { askAI } from './ai-bridge';

export type Citation = { span: string; from: string };

export type EditResult =
  | { ok: true; text: string; citations?: Citation[] }
  | { ok: false; reason: string };

type Verb = 'tighten' | 'rewrite' | 'expand';

type InputBase = {
  text: string;
  context?: string;
};

type RewriteInput = InputBase & { instruction: string };

// MARK: Pure helpers (exported for testing)

const WORD_SPLIT = /\s+/g;

export function wordCount(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(WORD_SPLIT).length;
}

export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) throw new Error('no JSON');
  return JSON.parse(trimmed.slice(first, last + 1));
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isVerbatimSubstring(needle: string, haystack: string): boolean {
  const n = normalizeForMatch(needle);
  if (!n) return false;
  return normalizeForMatch(haystack).includes(n);
}

// MARK: Prompt builders — must match the server for parity during transition

function tightenPrompt(text: string): string {
  return `You are tightening one passage of a student's own writing.

HARD CONTRACT (enforced by code):
- Output word count must be 30%-80% of input word count.
- Preserve EVERY claim, fact, reference, and conclusion in the input.
- Do not add new content. Do not change voice or tone.
- Remove filler words, redundancy, hedging — not substance.

INPUT PASSAGE:
${text}

OUTPUT (strict JSON, no prose, no backticks):
{"content": "<tightened passage>"}
`;
}

function rewritePrompt(text: string, instruction: string, context: string): string {
  return `You are rewriting one passage of a student's own writing per their instruction.

USER INSTRUCTION:
${instruction}

HARD CONTRACT (enforced by code — violations are rejected, not corrected):
- Output word count must be 0.5x to 2.0x the INPUT word count.
- Every new claim you add must be supported by a verbatim span in CONTEXT or INPUT.
- In the "citations" array, include one entry per new claim. Each has:
    "span": a verbatim substring of YOUR output content
    "from": a verbatim substring of CONTEXT or INPUT supporting the span
- Do not add claims you cannot cite.

INPUT PASSAGE:
${text}

CONTEXT (what you may draw from):
${context || '(none)'}

OUTPUT (strict JSON, no prose, no backticks):
{"content": "<rewritten passage>", "citations": [{"span": "...", "from": "..."}]}
`;
}

function expandPrompt(text: string, context: string): string {
  return `You are expanding one passage of a student's writing by drawing detail from surrounding context.

HARD CONTRACT (enforced by code):
- Output word count must be 1.3x to 2.0x the INPUT word count.
- Every new claim you add must be supported by a verbatim span in CONTEXT or INPUT.
- In the "citations" array, include one entry per new claim. Each citation has:
    "span": a verbatim substring of YOUR output content
    "from": a verbatim substring of CONTEXT or INPUT that supports the span
- Do not add claims you cannot cite.
- Preserve voice and tone. Do not change the meaning of existing claims.

INPUT PASSAGE:
${text}

CONTEXT (what you may draw from):
${context || '(none)'}

OUTPUT (strict JSON, no prose, no backticks):
{"content": "<expanded passage>", "citations": [{"span": "...", "from": "..."}]}
`;
}

// MARK: Shared validation

function validateCitationVerbatim(
  text: string,
  citations: Citation[],
  combinedSource: string,
): string | null {
  for (const c of citations) {
    if (!c.span || !c.from) continue;
    if (!isVerbatimSubstring(c.span, text)) {
      return `fabricated citation span: "${c.span.slice(0, 60)}"`;
    }
    if (!isVerbatimSubstring(c.from, combinedSource)) {
      return `fabricated citation source: "${c.from.slice(0, 60)}"`;
    }
  }
  return null;
}

function parseContentAndCitations(raw: string): { content: string; citations: Citation[] } {
  const parsed = extractJson(raw) as { content?: string; citations?: unknown };
  const content = typeof parsed?.content === 'string' ? parsed.content.trim() : '';
  const citations: Citation[] = Array.isArray(parsed?.citations)
    ? parsed.citations
        .filter((c): c is Citation =>
          typeof c === 'object' &&
          c !== null &&
          typeof (c as { span?: unknown }).span === 'string' &&
          typeof (c as { from?: unknown }).from === 'string',
        )
        .map((c) => ({ span: c.span.trim(), from: c.from.trim() }))
    : [];
  return { content, citations };
}

// MARK: Public API

export async function tightenSelection(input: InputBase): Promise<EditResult> {
  return await runEdit('tighten', input);
}

export async function rewriteSelection(input: RewriteInput): Promise<EditResult> {
  if (!input.instruction?.trim()) {
    return { ok: false, reason: 'instruction required' };
  }
  return await runEdit('rewrite', input);
}

export async function expandSelection(input: InputBase): Promise<EditResult> {
  return await runEdit('expand', input);
}

async function runEdit(verb: Verb, input: InputBase | RewriteInput): Promise<EditResult> {
  const text = (input.text ?? '').trim();
  const context = (input.context ?? '').trim();
  if (!text) return { ok: false, reason: 'text required' };
  const origWc = wordCount(text);
  if (origWc < 4) {
    return { ok: false, reason: `selection too short to ${verb}` };
  }

  const prompt = (() => {
    switch (verb) {
      case 'tighten': return tightenPrompt(text);
      case 'rewrite': return rewritePrompt(text, (input as RewriteInput).instruction.trim(), context);
      case 'expand': return expandPrompt(text, context);
    }
  })();

  let raw: string;
  try {
    raw = await askAI(prompt);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  let parsed: { content: string; citations: Citation[] };
  try {
    parsed = parseContentAndCitations(raw);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }

  if (!parsed.content) {
    return { ok: false, reason: 'AI returned no content' };
  }

  const newWc = wordCount(parsed.content);

  if (verb === 'tighten') {
    const minWc = Math.max(1, Math.floor(origWc * 0.3));
    const maxWc = Math.max(2, Math.floor(origWc * 0.8));
    if (newWc < minWc || newWc > maxWc) {
      return { ok: false, reason: `word count ${newWc} outside [${minWc}, ${maxWc}]` };
    }
    return { ok: true, text: parsed.content };
  }

  // rewrite / expand share citation discipline
  const minWc = verb === 'rewrite'
    ? Math.max(1, Math.floor(origWc * 0.5))
    : Math.max(1, Math.floor(origWc * 1.3));
  const maxWc = verb === 'rewrite'
    ? Math.max(minWc + 1, Math.floor(origWc * 2.0))
    : Math.max(minWc + 1, Math.floor(origWc * 2.0));
  if (newWc < minWc || newWc > maxWc) {
    return { ok: false, reason: `word count ${newWc} outside [${minWc}, ${maxWc}]` };
  }

  const combinedSource = `${text}\n${context}`;
  const citationError = validateCitationVerbatim(parsed.content, parsed.citations, combinedSource);
  if (citationError) return { ok: false, reason: citationError };

  if (verb === 'rewrite' && newWc >= origWc * 1.3 && parsed.citations.length === 0) {
    return { ok: false, reason: 'growth provided no citations' };
  }

  return { ok: true, text: parsed.content, citations: parsed.citations };
}
