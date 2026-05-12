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
import { knowledgeUploadRoot } from '../../../../lib/paths';

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

function safeName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/^\.+/, '').slice(0, 200);
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
    const uploadDir = knowledgeUploadRoot();
    await fs.mkdir(uploadDir, { recursive: true });
    const safeStem = safeName(trimmed);
    let finalName = `${safeStem}.md`;
    let counter = 1;
    while (true) {
      try {
        await fs.access(path.join(uploadDir, finalName));
        finalName = `${safeStem}-${counter}.md`;
        counter++;
      } catch { break; }
    }
    await fs.writeFile(path.join(uploadDir, finalName), `${LOOM_CAPTURE_DOC_MARKER}\n# ${trimmed}\n`);

    const slug = slugify(trimmed);
    return Response.json({
      slug,
      href: `/uploads/${encodeURIComponent(finalName)}`,
      name: trimmed,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
