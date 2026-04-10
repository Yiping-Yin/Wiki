/**
 * POST /api/knowledge/create
 * Body: { name: "C++" }
 *
 * Creates a new category directory in the Knowledge system,
 * re-runs ingest, and returns the new category's slug + href.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

export const runtime = 'nodejs';

const KNOWLEDGE_ROOT = '/Users/yinyiping/Desktop/Knowledge system';

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
    const dirPath = path.join(KNOWLEDGE_ROOT, trimmed);

    // Create directory if it doesn't exist
    await fs.mkdir(dirPath, { recursive: true });

    // Re-run ingest to update navigation
    const projectRoot = process.cwd();
    await new Promise<void>((resolve, reject) => {
      execFile(
        'npx', ['tsx', 'scripts/ingest-knowledge.ts'],
        { cwd: projectRoot, timeout: 30000 },
        (err) => err ? reject(err) : resolve(),
      );
    });

    const slug = slugify(trimmed);
    return Response.json({
      slug,
      href: `/knowledge/${slug}`,
      name: trimmed,
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
