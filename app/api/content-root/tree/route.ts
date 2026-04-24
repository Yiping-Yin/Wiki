import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from '../../../../lib/server-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/content-root/tree?path=<relative>
 *
 * Lazy directory listing under content-root for the scan-scope picker.
 * Returns immediate children of the requested sub-path (or content-root
 * when `path` is blank). Only directories are returned — the picker is for
 * scope selection, not file browsing.
 *
 * Security: path is resolved against CONTENT_ROOT and must stay inside.
 */

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  '.DS_Store', 'Thumbs.db',
]);

function isWithin(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function countFilesShallow(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && !e.name.startsWith('.')).length;
  } catch {
    return 0;
  }
}

export async function GET(req: Request) {
  const rel = new URL(req.url).searchParams.get('path')?.trim() ?? '';
  const abs = rel ? path.resolve(CONTENT_ROOT, rel) : CONTENT_ROOT;
  if (!isWithin(CONTENT_ROOT, abs)) {
    return NextResponse.json({ error: 'path outside content-root' }, { status: 400 });
  }

  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'failed to list',
    }, { status: 404 });
  }

  const dirs = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name));

  const children = await Promise.all(
    dirs.map(async (e) => {
      const childAbs = path.join(abs, e.name);
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      const [fileCount, subdirs] = await Promise.all([
        countFilesShallow(childAbs),
        fs.readdir(childAbs, { withFileTypes: true }).then(
          (sub) => sub.filter((s) => s.isDirectory() && !s.name.startsWith('.') && !SKIP_DIRS.has(s.name)).length,
          () => 0,
        ),
      ]);
      return {
        name: e.name,
        relPath: childRel,
        fileCount,
        subdirCount: subdirs,
      };
    }),
  );

  children.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({
    path: rel,
    absPath: abs,
    children,
  });
}
