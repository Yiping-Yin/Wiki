import { promises as fs } from 'node:fs';
import path from 'node:path';
import { searchIndexPath } from '../../../lib/derived-index-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const candidates = [searchIndexPath(), path.join(process.cwd(), 'public', 'search-index.json')];

  for (const candidate of candidates) {
    try {
      const body = await fs.readFile(candidate, 'utf-8');
      return new Response(body, {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'public, max-age=300',
        },
      });
    } catch {}
  }

  return Response.json({ error: 'search index missing' }, { status: 503 });
}
