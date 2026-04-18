/**
 * POST /api/structure  { id: string }
 *
 * Takes the OCR'd text of a knowledge doc and asks the selected local CLI
 * to produce a structured Markdown rewrite — headings, key
 * formulas as $$..$$, code blocks, callouts, lists. Result cached to disk.
 *
 * No API key required — uses the user's local CLI login.
 *
 * Cache: public/knowledge/structures/<id>.json
 *   { id, title, markdown, generatedAt }
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { invokeLocalRuntime } from '../../../lib/ai-runtime/invoke';
import { pickCli } from '../../../lib/claude-cli';
import { legacyPublicCachePath, runtimeCacheDir, runtimeCachePath } from '../../../lib/generated-cache';
import { readKnowledgeDocBody } from '../../../lib/knowledge-doc-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function safeId(id: string): string | null {
  if (!/^[a-z0-9_\-\u4e00-\u9fa5]+$/.test(id)) return null;
  return id;
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const id: string = body.id;
  const safe = id ? safeId(id) : null;
  if (!safe) return Response.json({ error: 'invalid id' }, { status: 400 });
  const cli = pickCli(body);

  const cachePaths = [runtimeCachePath('structures', safe), legacyPublicCachePath('structures', safe)];
  for (const cachePath of cachePaths) {
    if (!existsSync(cachePath)) continue;
    try {
      return Response.json({ ...JSON.parse(await fs.readFile(cachePath, 'utf-8')), cached: true });
    } catch {}
  }

  let docBody = '';
  let title = safe;
  const j = await readKnowledgeDocBody(safe);
  if (!j) {
    return Response.json({ error: 'doc not found' }, { status: 404 });
  }
  docBody = j.body ?? '';
  title = j.title ?? safe;

  if (docBody.trim().length < 100) {
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
${docBody.slice(0, 18000)}
"""

# Begin Markdown output now
`;

  const result = await invokeLocalRuntime({
    preferred: cli,
    prompt,
    timeoutMs: 240000,
  });

  if (result.runtime === null) {
    return Response.json({ error: result.userMessage }, { status: 500 });
  }

  const cleaned = result.text.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

  if (cleaned.length < 50) {
    return Response.json({ error: 'CLI returned too little content' }, { status: 500 });
  }

  const structured = {
    id: safe,
    title,
    markdown: cleaned,
    generatedAt: new Date().toISOString(),
  };
  const cachePath = runtimeCachePath('structures', safe);
  await fs.mkdir(runtimeCacheDir('structures'), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(structured, null, 2));
  return Response.json({
    ...structured,
    cached: false,
    runtime: result.runtime,
    fellBack: result.fellBack,
    notice: result.notice,
  });
}
