/**
 * GET /api/doc-body?id=<id>
 *
 * Returns { id, title, body } for any doc id.
 *   - "wiki/<slug>"  → reads app/wiki/<slug>/page.mdx (stripped of MDX boilerplate)
 *   - "know/<id>"    → reads public/knowledge/docs/<id>.json
 *   - "upload/<name>"→ reads knowledge/uploads/<name> (text only)
 *
 * Used by ChatPanel @-mentions to inject doc context.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

const KNOW_DIR = path.join(process.cwd(), 'public', 'knowledge', 'docs');
const WIKI_DIR = path.join(process.cwd(), 'app', 'wiki');
const UPLOAD_DIR = path.join(process.cwd(), 'knowledge', 'uploads');

function stripMDX(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/export\s+const[^;]+;/g, ' ')
    .replace(/import[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });

  try {
    if (id.startsWith('wiki/')) {
      const slug = id.slice('wiki/'.length).replace(/[^a-zA-Z0-9_\-]/g, '');
      const raw = await fs.readFile(path.join(WIKI_DIR, slug, 'page.mdx'), 'utf-8');
      const title = (raw.match(/^#\s+(.+)$/m)?.[1] ?? slug).trim();
      return Response.json({ id, title, body: stripMDX(raw).slice(0, 6000) });
    }
    if (id.startsWith('know/')) {
      const docId = id.slice('know/'.length).replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '');
      const j = JSON.parse(await fs.readFile(path.join(KNOW_DIR, `${docId}.json`), 'utf-8'));
      return Response.json({ id, title: j.title, body: (j.body ?? '').slice(0, 6000) });
    }
    if (id.startsWith('upload/')) {
      const name = decodeURIComponent(id.slice('upload/'.length));
      if (name.includes('/') || name.includes('..')) return Response.json({ error: 'forbidden' }, { status: 403 });
      const abs = path.resolve(UPLOAD_DIR, name);
      if (!abs.startsWith(UPLOAD_DIR)) return Response.json({ error: 'forbidden' }, { status: 403 });
      const ext = path.extname(name).toLowerCase();
      if (['.txt', '.md', '.csv', '.tsv', '.json', '.ipynb'].includes(ext)) {
        const body = (await fs.readFile(abs, 'utf-8')).slice(0, 6000);
        return Response.json({ id, title: name, body });
      }
      return Response.json({ id, title: name, body: '(binary file — open the original)' });
    }
    return Response.json({ error: 'unknown id format' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 404 });
  }
}
