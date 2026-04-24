/**
 * Read-only proxy for the user's source knowledge directory.
 * Allows the browser to load PDFs/text from the configured content root
 * without ever modifying the originals.
 *
 * Path traversal is prevented: requests must resolve to a path under SRC.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from '../../../lib/server-config';
import { resolveContentRoot } from '../../../lib/runtime-roots';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isWithinDir(root: string, target: string) {
  const rel = path.relative(root, target);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

const MIME: Record<string, string> = {
  // Documents
  '.pdf':  'application/pdf',
  '.txt':  'text/plain; charset=utf-8',
  '.md':   'text/markdown; charset=utf-8',
  '.mdx':  'text/markdown; charset=utf-8',
  '.rtf':  'application/rtf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc':  'application/msword',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt':  'application/vnd.ms-powerpoint',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls':  'application/vnd.ms-excel',
  // Data / code
  '.csv':   'text/csv; charset=utf-8',
  '.tsv':   'text/tab-separated-values; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.jsonl': 'application/x-ndjson; charset=utf-8',
  '.ipynb': 'application/x-ipynb+json; charset=utf-8',
  '.yaml':  'text/yaml; charset=utf-8',
  '.yml':   'text/yaml; charset=utf-8',
  '.xml':   'application/xml; charset=utf-8',
  '.html':  'text/html; charset=utf-8',
  '.htm':   'text/html; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.js':    'text/javascript; charset=utf-8',
  '.ts':    'text/typescript; charset=utf-8',
  '.py':    'text/x-python; charset=utf-8',
  '.r':     'text/x-r; charset=utf-8',
  '.sh':    'application/x-sh; charset=utf-8',
  // Images
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.svg':  'image/svg+xml',
  '.bmp':  'image/bmp',
  '.tiff': 'image/tiff',
  '.heic': 'image/heic',
  '.avif': 'image/avif',
  // Audio / video — browsers stream natively when content-type is right
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.m4a':  'audio/mp4',
  '.ogg':  'audio/ogg',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
};

function sourceRoot() {
  return resolveContentRoot({ fallbackContentRoot: CONTENT_ROOT });
}

function resolveSourcePath(root: string, sourcePath: string) {
  return path.resolve(root, sourcePath);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const p = searchParams.get('p');
  if (!p) return new Response('missing p', { status: 400 });

  const root = sourceRoot();
  const abs = resolveSourcePath(root, p);
  if (!isWithinDir(root, abs)) return new Response('forbidden', { status: 403 });

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
