/**
 * Read-only proxy for the user's source knowledge directory.
 * Allows the browser to load PDFs/text from /Users/yinyiping/Desktop/Knowledge system
 * without ever modifying the originals.
 *
 * Path traversal is prevented: requests must resolve to a path under SRC.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

const SRC = '/Users/yinyiping/Desktop/Knowledge system';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md':  'text/markdown; charset=utf-8',
  '.mdx': 'text/markdown; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get('p');
  if (!p) return new Response('missing p', { status: 400 });

  const abs = path.resolve(p);
  if (!abs.startsWith(SRC)) return new Response('forbidden', { status: 403 });

  try {
    const data = await fs.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    const mime = MIME[ext] ?? 'application/octet-stream';
    return new Response(new Uint8Array(data), {
      headers: {
        'content-type': mime,
        'cache-control': 'private, max-age=3600',
        'content-disposition': `inline; filename="${encodeURIComponent(path.basename(abs))}"`,
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
