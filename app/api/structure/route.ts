/**
 * POST /api/structure  { id: string }
 *
 * Takes the OCR'd text of a knowledge doc and asks the LOCAL claude CLI
 * (`claude -p`) to produce a structured Markdown rewrite — headings, key
 * formulas as $$..$$, code blocks, callouts, lists. Result cached to disk.
 *
 * No API key required — uses the user's local Claude Code login.
 *
 * Cache: public/knowledge/structures/<id>.json
 *   { id, title, markdown, generatedAt }
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runClaude } from '../../../lib/claude-cli';

export const runtime = 'nodejs';
export const maxDuration = 300;

const STRUCT_DIR = path.join(process.cwd(), 'public', 'knowledge', 'structures');
const BODY_DIR = path.join(process.cwd(), 'public', 'knowledge', 'docs');

function safeId(id: string): string | null {
  if (!/^[a-z0-9_\-\u4e00-\u9fa5]+$/.test(id)) return null;
  return id;
}

export async function POST(req: Request) {
  let id: string;
  try { id = (await req.json()).id; }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const safe = id ? safeId(id) : null;
  if (!safe) return Response.json({ error: 'invalid id' }, { status: 400 });

  const cachePath = path.join(STRUCT_DIR, `${safe}.json`);
  if (existsSync(cachePath)) {
    try {
      return Response.json({ ...JSON.parse(await fs.readFile(cachePath, 'utf-8')), cached: true });
    } catch {}
  }

  const bodyPath = path.join(BODY_DIR, `${safe}.json`);
  let body = '';
  let title = safe;
  try {
    const j = JSON.parse(await fs.readFile(bodyPath, 'utf-8'));
    body = j.body ?? '';
    title = j.title ?? safe;
  } catch {
    return Response.json({ error: 'doc not found' }, { status: 404 });
  }

  if (body.trim().length < 100) {
    return Response.json({ error: 'doc has no extractable text' }, { status: 422 });
  }

  const prompt = `You are restructuring a document for a personal knowledge wiki. The text below comes from a PDF extraction and may contain OCR artefacts.

Your job: produce a clean, well-structured Markdown rewrite that captures the document's content faithfully. This will be rendered in a Notion-style reader.

# Output rules
- Output ONLY raw Markdown, no preamble, no code fences around the whole output.
- Use ## H2 for major sections, ### H3 for subsections.
- Render any equations as KaTeX block math $$ ... $$ (or inline $...$).
- Render code, formulas-as-text, or pseudocode as fenced \`\`\`lang ... \`\`\` blocks when appropriate.
- Use > blockquote for callouts (definitions, key insights, warnings).
- Use bullet and numbered lists generously to organize ideas.
- Bold key terms on first introduction.
- If the doc is a slide deck, organize by slide topic with H2 headings.
- If the doc is a paper, use sections: Abstract / Background / Method / Results / Discussion.
- If the doc is course notes, use the natural lecture topic structure.
- Drop noise: page numbers, headers, bibliographic boilerplate, license text.
- Aim for 600-2000 words of organized content.
- DO NOT invent content. Stay faithful to what is in the source.

# Document
Title: ${title}

Source text:
"""
${body.slice(0, 18000)}
"""

# Begin Markdown output now
`;

  try {
    const text = await runClaude(prompt, { timeoutMs: 240000 });
    const cleaned = text.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

    if (cleaned.length < 50) {
      return Response.json({ error: 'CLI returned too little content' }, { status: 500 });
    }

    const result = {
      id: safe,
      title,
      markdown: cleaned,
      generatedAt: new Date().toISOString(),
    };
    await fs.mkdir(STRUCT_DIR, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(result, null, 2));
    return Response.json({ ...result, cached: false });
  } catch (e: any) {
    return Response.json({ error: 'structuring failed: ' + e.message }, { status: 500 });
  }
}
