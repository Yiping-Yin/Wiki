/**
 * GET /api/source-upload?name=<filename>
 *
 * Streams an uploaded file from knowledge/uploads/. Path-traversal safe:
 * the resolved path must remain inside the uploads dir.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

const UPLOAD_DIR = path.join(process.cwd(), 'knowledge', 'uploads');

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md':  'text/markdown; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.json': 'application/json',
  '.ipynb': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name');
  if (!name) return new Response('missing name', { status: 400 });
  const safeName = name.replace(/[/\\]/g, '_').replace(/^\.+/, '');
  const abs = path.resolve(UPLOAD_DIR, safeName);
  if (!abs.startsWith(UPLOAD_DIR)) return new Response('forbidden', { status: 403 });

  try {
    const data = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    return new Response(new Uint8Array(data), {
      headers: {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': 'private, max-age=600',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
