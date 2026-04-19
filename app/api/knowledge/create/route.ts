/**
 * POST /api/knowledge/create
 * Body: { name: "C++" }
 *
 * Creates a new category directory in the Knowledge system,
 * re-runs ingest, and returns the new category's slug + href.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { LOOM_CAPTURE_DOC_MARKER } from '../../../../lib/knowledge-doc-state';
import { EXECUTION_ROOT, KNOWLEDGE_ROOT } from '../../../../lib/server-config';
import { runKnowledgeIngest } from '../../../../lib/knowledge-ingest';

export const runtime = 'nodejs';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'topic';
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }

    const trimmed = name.trim();
    if (/[\/\\]|\.\./.test(trimmed)) {
      return Response.json({ error: 'Invalid category name' }, { status: 400 });
    }
    const dirPath = path.join(KNOWLEDGE_ROOT, trimmed);

    // Create directory with a placeholder so ingest registers it
    await fs.mkdir(dirPath, { recursive: true });
    const readmePath = path.join(dirPath, `${trimmed}.md`);
    try { await fs.access(readmePath); } catch {
      await fs.writeFile(readmePath, `${LOOM_CAPTURE_DOC_MARKER}\n# ${trimmed}\n`);
    }

    // Re-run ingest to update navigation
    await runKnowledgeIngest({ cwd: EXECUTION_ROOT });

    const slug = slugify(trimmed);
    return Response.json({
      slug,
      href: `/knowledge/${slug}/${slug}`,
      name: trimmed,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
