'use client';
/**
 * Client-side cowork AI helpers. Phase 5 of architecture inversion.
 * Builds prompts, calls `askAI` (which dispatches via the Swift bridge
 * to whichever provider the user picked in Settings), parses + sanitizes
 * responses. Replaces the server-side `/api/coworks/[id]/*` routes
 * one-by-one so the cowork surface respects user provider choice rather
 * than hardcoded server-side CLI.
 */

import { askAI } from './ai-bridge';
import type { Cowork, ScratchBlock, TidiedBlock } from './cowork-types';

export type LibraryRef = {
  id: string;
  title: string;
  categorySlug: string;
  subcategory: string;
};

export type Suggestion = {
  docId: string;
  title: string;
  categorySlug: string;
  subcategory: string;
  reason: string;
};

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) throw new Error('no JSON');
  return JSON.parse(trimmed.slice(first, last + 1));
}

function buildSuggestPrompt(
  target: string,
  description: string,
  existingTitles: string[],
  library: LibraryRef[],
): string {
  const indexLines = library
    .map((d) => `- ${d.id} :: ${d.title} (${d.categorySlug}${d.subcategory ? ' / ' + d.subcategory : ''})`)
    .join('\n');
  return `You recommend relevant library documents for a student's rehearsal workspace.

REHEARSAL TARGET: ${target}
${description ? 'DESCRIPTION: ' + description : ''}

STUDENT HAS ALREADY ATTACHED:
${existingTitles.length > 0 ? existingTitles.map((t) => '- ' + t).join('\n') : '(nothing yet)'}

LIBRARY INDEX (you may only recommend items from this list):
${indexLines}

TASK: Pick up to 5 library docs that are most likely relevant to this rehearsal target but NOT already attached. Favor cross-collection connections (material from other courses that covers the same technique, or general knowledge that supports the specific task).

OUTPUT FORMAT (strict JSON, no prose, no backticks):
{
  "suggestions": [
    { "docId": "<id from library index>", "reason": "<one short sentence>" }
  ]
}

Rules:
- Only use docIds that appear in the library index above.
- If fewer than 5 good matches exist, return fewer. Do not invent.
- Keep each reason under 120 characters.
- Do not suggest items already attached.`;
}

type SuggestInput = {
  target: string;
  description: string;
  attached: { title: string; ref: string }[];
  library: LibraryRef[];
};

/**
 * Request up to 5 library-doc suggestions for a cowork rehearsal. The
 * caller owns the library index — a cheap keyword-hit pre-filter keeps
 * the prompt size sane. Matches the prompt the retired
 * `/api/coworks/[id]/suggest` route emitted so output shape is identical.
 */
export async function suggestCoworkDocs(input: SuggestInput): Promise<Suggestion[]> {
  const attachedRefs = new Set(input.attached.map((m) => m.ref));
  const libraryFiltered = input.library.filter((d) => !attachedRefs.has(d.id));

  const words = `${input.target} ${input.description}`
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 4);
  const scored = libraryFiltered
    .map((d) => {
      const hay = `${d.title} ${d.subcategory} ${d.categorySlug}`.toLowerCase();
      const hits = words.filter((w) => hay.includes(w)).length;
      return { d, hits };
    })
    .sort((a, b) => b.hits - a.hits);
  const trimmed = scored.slice(0, 80).map((s) => s.d);

  const prompt = buildSuggestPrompt(
    input.target,
    input.description,
    input.attached.map((m) => m.title),
    trimmed,
  );

  const raw = await askAI(prompt, { maxTokens: 1024 });
  let parsed: { suggestions?: Array<{ docId?: unknown; reason?: unknown }> };
  try {
    parsed = extractJson(raw) as { suggestions?: Array<{ docId?: unknown; reason?: unknown }> };
  } catch {
    return [];
  }

  const libraryById = new Map(input.library.map((d) => [d.id, d]));
  const out: Suggestion[] = [];
  for (const item of parsed.suggestions ?? []) {
    const docId = typeof item.docId === 'string' ? item.docId : '';
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    if (!docId || !reason) continue;
    const entry = libraryById.get(docId);
    if (!entry) continue;
    if (attachedRefs.has(docId)) continue;
    out.push({
      docId: entry.id,
      title: entry.title,
      categorySlug: entry.categorySlug,
      subcategory: entry.subcategory,
      reason: reason.slice(0, 240),
    });
  }
  return out.slice(0, 5);
}

// MARK: — Tidy

type TextInputBlock = { id: string; content: string };
type AiOutputBlock = { id: string; content: string };

const WORD_SPLIT = /\s+/g;
function wordCount(s: string): number {
  const trimmed = s.trim();
  if (!trimmed) return 0;
  return trimmed.split(WORD_SPLIT).length;
}

function wordCountBounds(n: number): { min: number; max: number } {
  return {
    min: Math.max(1, Math.min(n - 3, Math.floor(n * 0.7))),
    max: Math.max(n + 5, Math.ceil(n * 1.3)),
  };
}

function buildTidyPrompt(cowork: Cowork, textBlocks: TextInputBlock[]): string {
  const materials = cowork.materials.map((m) => ({
    id: m.id,
    title: m.title,
    source:
      m.kind === 'library'
        ? `${m.meta?.categorySlug ?? ''}${m.meta?.subcategory ? ' / ' + m.meta.subcategory : ''}`
        : 'external URL',
  }));

  return `You are a conservative editor cleaning a student's rough rehearsal scratch into a tidy draft.

HARD CONTRACT (enforced by code, not just this prompt):
- You will receive a JSON "scratch" array of text blocks, each with id + content.
- You must return a JSON "tidied" array with the SAME LENGTH and the SAME IDS in the SAME ORDER.
- Each tidied block must stay close to its original word count (roughly 0.7× to 1.3×).
- You MAY: fix grammar, fix spelling, smooth awkward phrasing, add missing transitions that stay inside one block, lightly format with paragraph breaks if needed inside the block.
- You MUST NOT: reorder blocks, merge blocks, split blocks, add new facts/opinions/definitions, change the student's conclusions, change the student's voice, or invent transitions that move content between blocks.

PROMINENT SECTION HEADINGS — prefer generously:
- When a block clearly introduces a new topic / section (distinct from neighboring blocks), prepend a Markdown heading line to that block.
- Use "# " for top-level section, "## " for subsection, "### " for fine-grained.
- Headings are 1-5 words, concrete, derived ONLY from the student's own wording.
- Do not add a heading when the block is a continuation of the previous topic.
- Heading counts toward the block's word count budget.

REHEARSAL TARGET: ${cowork.title}
${cowork.description ? 'TARGET DESCRIPTION: ' + cowork.description : ''}

MATERIALS (for your context only — do not modify, they will be inserted between blocks by code):
${materials.length > 0 ? materials.map((m) => `  - id=${m.id}  "${m.title}" (${m.source})`).join('\n') : '  (none)'}

SCRATCH TEXT BLOCKS (JSON):
${JSON.stringify({ blocks: textBlocks }, null, 2)}

OUTPUT (strict JSON, no prose, no backticks):
{"tidied": [{"id": "...", "content": "..."}, ...]}
`;
}

function assembleTidyMarkdown(cowork: Cowork, tidiedBlocks: TidiedBlock[]): string {
  const tidiedById = new Map(tidiedBlocks.map((t) => [t.id, t]));
  const materialById = new Map(cowork.materials.map((m) => [m.id, m]));
  const parts: string[] = [];
  for (const block of cowork.scratch) {
    if (block.kind === 'text') {
      const tidied = tidiedById.get(block.id);
      const content = tidied?.content ?? block.content;
      if (content.trim()) parts.push(content.trim());
    } else if (block.kind === 'image') {
      parts.push(`![${block.alt ?? 'image'}](${block.dataUrl})`);
    } else {
      const material = materialById.get(block.materialId);
      if (!material) continue;
      if (material.kind === 'url') {
        parts.push(`[${material.title}](${material.ref})`);
      } else {
        const href = material.meta?.href ?? '';
        parts.push(href ? `[${material.title}](${href})` : `[${material.title}]`);
      }
    }
  }
  return parts.join('\n\n');
}

export type TidyResult = {
  markdown: string;
  tidiedBlocks: TidiedBlock[];
  fallbacks: number;
  note?: string;
};

export async function tidyCowork(cowork: Cowork): Promise<TidyResult> {
  const textBlocks: TextInputBlock[] = cowork.scratch
    .filter((b): b is Extract<ScratchBlock, { kind: 'text' }> => b.kind === 'text')
    .map((b) => ({ id: b.id, content: b.content }))
    .filter((b) => b.content.trim().length > 0);

  if (textBlocks.length === 0) {
    return {
      markdown: '',
      tidiedBlocks: [],
      fallbacks: 0,
      note: 'Scratch is empty — write something first.',
    };
  }

  const prompt = buildTidyPrompt(cowork, textBlocks);
  const raw = await askAI(prompt, { maxTokens: 4096 });

  let aiBlocks: AiOutputBlock[] | null = null;
  let parseError: string | null = null;
  try {
    const parsed = extractJson(raw) as { tidied?: AiOutputBlock[] };
    if (!parsed?.tidied || !Array.isArray(parsed.tidied)) {
      parseError = 'missing "tidied" array';
    } else {
      aiBlocks = parsed.tidied;
    }
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
  }

  const aiById = new Map<string, AiOutputBlock>();
  if (aiBlocks) {
    for (const ab of aiBlocks) {
      if (ab && typeof ab.id === 'string' && typeof ab.content === 'string') {
        aiById.set(ab.id, ab);
      }
    }
  }

  const structuralInvariantOk =
    !!aiBlocks &&
    aiBlocks.length === textBlocks.length &&
    aiBlocks.every((ab, i) => ab?.id === textBlocks[i]?.id);

  const tidiedBlocks: TidiedBlock[] = [];
  for (const input of textBlocks) {
    const aiBlock = aiById.get(input.id);
    const baseline: TidiedBlock = {
      id: input.id,
      content: input.content,
      originalContent: input.content,
      status: 'fallback',
      fallbackReason: parseError ?? 'pending',
    };
    if (!structuralInvariantOk) {
      baseline.fallbackReason = parseError ?? 'AI block order mismatch';
      tidiedBlocks.push(baseline);
      continue;
    }
    if (!aiBlock || typeof aiBlock.content !== 'string') {
      baseline.fallbackReason = 'AI missing block';
      tidiedBlocks.push(baseline);
      continue;
    }
    const origWc = wordCount(input.content);
    const newWc = wordCount(aiBlock.content);
    const bounds = wordCountBounds(origWc);
    if (newWc < bounds.min || newWc > bounds.max) {
      baseline.fallbackReason = `word count ${newWc} outside [${bounds.min}, ${bounds.max}]`;
      tidiedBlocks.push(baseline);
      continue;
    }
    tidiedBlocks.push({
      id: input.id,
      content: aiBlock.content.trim(),
      originalContent: input.content,
      status: 'ok',
    });
  }

  return {
    markdown: assembleTidyMarkdown(cowork, tidiedBlocks),
    tidiedBlocks,
    fallbacks: tidiedBlocks.filter((b) => b.status === 'fallback').length,
  };
}

// MARK: — Per-block tidy ops

function buildBlockTidyPrompt(cowork: Cowork, originalContent: string): string {
  const materials = cowork.materials.map((m) => ({
    id: m.id,
    title: m.title,
    source:
      m.kind === 'library'
        ? `${m.meta?.categorySlug ?? ''}${m.meta?.subcategory ? ' / ' + m.meta.subcategory : ''}`
        : 'external URL',
  }));

  return `You are cleaning ONE paragraph of a student's rehearsal scratch into a tidy version.

HARD CONTRACT (enforced by code, not just prompt):
- You edit ONLY this one block. You cannot add content from other blocks.
- Output must stay within ~0.7× to 1.3× the original word count.
- You MAY: fix grammar/spelling, smooth awkward phrasing, add in-block transitions.
- You MAY: prepend a Markdown heading ("# ", "## ", or "### ") 1-5 words long if this block clearly starts a new section. Use ONLY words / concepts from the student's text.
- You MUST NOT: add new facts, change conclusions, change voice, invent references.

REHEARSAL TARGET: ${cowork.title}
${cowork.description ? 'DESCRIPTION: ' + cowork.description : ''}

MATERIALS (context only, do not modify):
${materials.length > 0 ? materials.map((m) => `  - ${m.title} (${m.source})`).join('\n') : '  (none)'}

BLOCK TO TIDY:
${originalContent}

OUTPUT (strict JSON, no prose, no backticks):
{"content": "<tidied paragraph>"}
`;
}

function replaceTidiedBlock(
  cowork: Cowork,
  blockId: string,
  patch: Partial<TidiedBlock>,
  markUserEdited: boolean,
): Cowork['tidyDraft'] {
  const current = cowork.tidyDraft;
  if (!current) return current;
  const updatedBlocks = current.tidiedBlocks.map((b) =>
    b.id === blockId ? { ...b, ...patch } : b,
  );
  const markdown = assembleTidyMarkdown(cowork, updatedBlocks);
  return {
    markdown,
    tidiedBlocks: updatedBlocks,
    generatedAt: current.generatedAt,
    userEdited: markUserEdited ? true : current.userEdited,
  };
}

/** Save user's manual edit to a single tidied block. Returns the new draft. */
export function saveTidiedBlock(
  cowork: Cowork,
  blockId: string,
  content: string,
): Cowork['tidyDraft'] {
  return replaceTidiedBlock(
    cowork,
    blockId,
    { content, status: 'ok', fallbackReason: undefined },
    true,
  );
}

/** Revert one block to its scratch source and mark the draft as user-edited. */
export function revertTidiedBlock(
  cowork: Cowork,
  blockId: string,
): Cowork['tidyDraft'] {
  const scratchBlock = cowork.scratch.find(
    (b): b is Extract<ScratchBlock, { kind: 'text' }> => b.kind === 'text' && b.id === blockId,
  );
  if (!scratchBlock) return cowork.tidyDraft;
  return replaceTidiedBlock(
    cowork,
    blockId,
    { content: scratchBlock.content, status: 'user-reverted', fallbackReason: undefined },
    true,
  );
}

/** Ask AI to regenerate one tidied block. Returns the new draft. */
export async function regenerateTidiedBlock(
  cowork: Cowork,
  blockId: string,
): Promise<Cowork['tidyDraft']> {
  const scratchBlock = cowork.scratch.find(
    (b): b is Extract<ScratchBlock, { kind: 'text' }> => b.kind === 'text' && b.id === blockId,
  );
  if (!scratchBlock) return cowork.tidyDraft;

  const prompt = buildBlockTidyPrompt(cowork, scratchBlock.content);
  const raw = await askAI(prompt, { maxTokens: 1024 });

  let aiContent: string | null = null;
  let fallbackReason: string | null = null;
  try {
    const parsed = extractJson(raw) as { content?: string };
    if (typeof parsed?.content === 'string') aiContent = parsed.content;
    else fallbackReason = 'missing "content" field';
  } catch (err) {
    fallbackReason = err instanceof Error ? err.message : String(err);
  }

  if (aiContent) {
    const origWc = wordCount(scratchBlock.content);
    const newWc = wordCount(aiContent);
    const bounds = wordCountBounds(origWc);
    if (newWc < bounds.min || newWc > bounds.max) {
      fallbackReason = `word count ${newWc} outside [${bounds.min}, ${bounds.max}]`;
      aiContent = null;
    }
  }

  if (aiContent) {
    return replaceTidiedBlock(
      cowork,
      blockId,
      { content: aiContent.trim(), status: 'ok', fallbackReason: undefined },
      false,
    );
  }

  return replaceTidiedBlock(
    cowork,
    blockId,
    { content: scratchBlock.content, status: 'fallback', fallbackReason: fallbackReason ?? 'unknown' },
    false,
  );
}
