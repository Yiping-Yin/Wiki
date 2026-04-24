import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loomContentRootConfigPath } from '../../../lib/paths';
import { writeScanScope } from '../../../lib/scan-scope';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const raw = await fs.readFile(loomContentRootConfigPath(), 'utf-8');
    const parsed = JSON.parse(raw) as { contentRoot?: string };
    return NextResponse.json({ contentRoot: parsed.contentRoot ?? null });
  } catch {
    return NextResponse.json({ contentRoot: null });
  }
}

/**
 * Reject obvious code repositories as content-root. A developer running
 * Loom out of its own source tree can accidentally land here and then see
 * `app / lib / scripts / public` show up as "collections" — pure noise.
 */
async function detectCodeRepo(root: string): Promise<{ match: boolean; reason?: string }> {
  const pkgPath = path.join(root, 'package.json');
  try {
    const raw = await fs.readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { name?: string };
    if (typeof pkg.name === 'string' && /\bloom\b/i.test(pkg.name)) {
      return { match: true, reason: `package.json identifies this as "${pkg.name}"` };
    }
    const hasNodeModules = await fs.stat(path.join(root, 'node_modules')).then((s) => s.isDirectory()).catch(() => false);
    const hasNext = await fs.stat(path.join(root, '.next')).then((s) => s.isDirectory()).catch(() => false);
    if (hasNodeModules && hasNext) {
      return { match: true, reason: 'contains node_modules and .next — looks like a Next.js project' };
    }
  } catch {
    // No package.json — not a code repo by this signature.
  }
  return { match: false };
}

export async function POST(req: Request) {
  let body: { contentRoot?: string };
  try {
    body = (await req.json()) as { contentRoot?: string };
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const next = (body.contentRoot ?? '').trim();
  if (!next) {
    return NextResponse.json({ error: 'contentRoot required' }, { status: 400 });
  }
  try {
    const stat = await fs.stat(next);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'contentRoot must be a directory' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'contentRoot does not exist' }, { status: 400 });
  }

  const codeRepo = await detectCodeRepo(next);
  if (codeRepo.match) {
    return NextResponse.json({
      error: `Refusing to index ${next} — looks like a code repository (${codeRepo.reason}). Pick a folder that holds your actual notes or source files, not a project directory.`,
    }, { status: 400 });
  }

  const configPath = loomContentRootConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ contentRoot: next }, null, 2), 'utf-8');
  await writeScanScope({ included: [] });
  return NextResponse.json({ contentRoot: next });
}
