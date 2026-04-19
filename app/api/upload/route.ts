/**
 * POST /api/upload  (multipart/form-data with file + optional category)
 *
 * Without category: saves to knowledge/uploads/<safe-name> (flat uploads).
 * With category: saves to Knowledge system/<category>/<name>, re-runs ingest,
 * and returns the knowledge doc href. This is the "drag to blackboard" flow.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { CONTENT_ROOT, EXECUTION_ROOT, KNOWLEDGE_ROOT } from '../../../lib/server-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_DIR = path.join(CONTENT_ROOT, 'knowledge', 'uploads');
const ALLOWED = new Set(['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt', '.md', '.csv', '.tsv', '.json', '.ipynb', '.xlsx', '.xls']);
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

function safeName(name: string): string {
  return name.replace(/[/\\]/g, '_').replace(/^\.+/, '').slice(0, 200);
}

function slugify(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'file';
}

export async function POST(req: Request) {
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return Response.json({ error: 'invalid form' }, { status: 400 }); }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'no file' }, { status: 400 });
  }

  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.has(ext)) {
    return Response.json({ error: `unsupported file type: ${ext}` }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: `file too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 400 });
  }

  const category = formData.get('category');
  const categoryName = typeof category === 'string' ? category.trim() : '';

  if (categoryName) {
    // Map category label back to directory path
    // "UNSW · COMM 3030" → "UNSW/COMM 3030", "C++" → "C++"
    if (/\.\./.test(categoryName)) {
      return new Response('Invalid category', { status: 400 });
    }
    const dirName = categoryName.includes(' · ')
      ? categoryName.replace(' · ', path.sep)
      : categoryName;
    const catDir = path.join(KNOWLEDGE_ROOT, dirName);
    if (!catDir.startsWith(KNOWLEDGE_ROOT)) {
      return new Response('Invalid category path', { status: 400 });
    }
    await fs.mkdir(catDir, { recursive: true });

    const safe = safeName(file.name);
    let finalName = safe;
    let counter = 1;
    while (true) {
      try {
        await fs.access(path.join(catDir, finalName));
        const stem = safe.replace(/\.[^.]+$/, '');
        finalName = `${stem}-${counter}${ext}`;
        counter++;
      } catch { break; }
    }

    const buf = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(catDir, finalName), buf);

    // Re-run ingest so the nav updates
    try {
      await new Promise<void>((resolve, reject) => {
        execFile('npx', ['tsx', 'scripts/ingest-knowledge.ts'],
          { cwd: EXECUTION_ROOT, timeout: 30000 },
          (err) => err ? reject(err) : resolve());
      });
    } catch {}

    const catSlug = slugify(categoryName);
    return Response.json({
      id: slugify(safe),
      slug: slugify(safe),
      name: finalName,
      size: file.size,
      href: `/knowledge/${catSlug}`,
      category: categoryName,
    });
  }

  // Default: flat uploads directory
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const safe = safeName(file.name);
  const slug = slugify(safe);
  let finalName = safe;
  let counter = 1;
  while (true) {
    try {
      await fs.access(path.join(UPLOAD_DIR, finalName));
      const stem = safe.replace(/\.[^.]+$/, '');
      finalName = `${stem}-${counter}${ext}`;
      counter++;
    } catch { break; }
  }

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, finalName), buf);

  return Response.json({
    id: slug,
    slug,
    name: finalName,
    size: file.size,
    href: `/uploads/${encodeURIComponent(finalName)}`,
  });
}

export async function GET() {
  // List uploads (used by /uploads page)
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const entries = await fs.readdir(UPLOAD_DIR);
    const items = await Promise.all(
      entries.filter((n) => !n.startsWith('.')).map(async (name) => {
        const stat = await fs.stat(path.join(UPLOAD_DIR, name));
        return {
          name,
          size: stat.size,
          mtime: stat.mtime.getTime(),
          ext: path.extname(name).toLowerCase(),
          href: `/uploads/${encodeURIComponent(name)}`,
        };
      }),
    );
    items.sort((a, b) => b.mtime - a.mtime);
    return Response.json({ items });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
