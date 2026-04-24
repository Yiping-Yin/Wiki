#!/usr/bin/env node
/**
 * Produce a Next.js static export into `.next-export-out/` while hiding
 * route folders that can't be statically exported — notably `app/api/*`
 * which are force-dynamic by design.
 *
 * Phase 1 of the architecture inversion uses this output as the payload
 * served via the `loom://` URL scheme (see LoomURLSchemeHandler.swift).
 * Phase 3 will eventually delete `app/api/*` entirely once every route has
 * a Swift replacement; until then, this script shelves + restores the
 * folder around each export build.
 *
 * Usage:
 *   node scripts/build-static-export.mjs
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { removeDuplicateArtifacts, withNextBuildLock } from './next-build-lock.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shelfRoot = path.join(repoRoot, '.next-export-shelf');

/**
 * Relative paths that can't live in the tree during a static export.
 * Each entry is moved to `<path>.during-export-shelved` for the duration
 * of `next build` and restored in `finally`, even on crash.
 */
const SHELVED = [
  'app/api',
  // Dynamic routes whose params come from user data — can't be enumerated
  // at build time. Will be handled via SPA catch-all + client-side routing
  // in a later Phase 1 iteration. Shelving them lets the rest of the app
  // export cleanly right now.
  'app/uploads/[name]',
  'app/knowledge/[category]',
  // /pursuit/[id], /panel/[id] and their legacy plural aliases are
  // dynamic segments whose ids come from user data. Product links target
  // these canonical paths, but Next.js `output: 'export'` cannot emit
  // unbounded ids. The native bundle loader keeps a flat shell fallback
  // for static export while live routes remain id-addressed.
  'app/panel/[id]',
  'app/pursuit/[id]',
  'app/panels/[id]',
  'app/pursuits/[id]',
];

function shelvedPathFor(rel) {
  return path.join(shelfRoot, rel.replace(/[\/]/g, '__'));
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function restoreStaleShelvedPaths() {
  for (const rel of SHELVED) {
    const original = path.join(repoRoot, rel);
    const shelved = shelvedPathFor(rel);
    const hasOriginal = await pathExists(original);
    const hasShelved = await pathExists(shelved);

    if (!hasShelved || hasOriginal) continue;

    await fs.mkdir(path.dirname(original), { recursive: true });
    await fs.rename(shelved, original);
    console.warn(`[build-static-export] restored stale shelf entry: ${rel}`);
  }
}

async function moveIfExists(from, to) {
  try {
    await fs.access(from);
  } catch {
    return false;
  }
  await fs.rename(from, to);
  return true;
}

async function shelve() {
  const restoreOps = [];
  await fs.mkdir(shelfRoot, { recursive: true });
  for (const rel of SHELVED) {
    const from = path.join(repoRoot, rel);
    const to = shelvedPathFor(rel);
    if (await moveIfExists(from, to)) {
      restoreOps.push({ from: to, to: from });
    }
  }
  return restoreOps;
}

async function restore(restoreOps) {
  for (const op of restoreOps) {
    try {
      await fs.mkdir(path.dirname(op.to), { recursive: true });
      await fs.rename(op.from, op.to);
    } catch (err) {
      console.error(`[build-static-export] WARNING: failed to restore ${op.to}: ${err.message}`);
    }
  }
}

function runNextBuild() {
  const result = spawnSync('npx', ['next', 'build'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LOOM_NEXT_OUTPUT: 'export',
      LOOM_DIST_DIR: '.next-export',
      LOOM_NEXT_BUILD_LOCK_HELD: '1',
    },
    stdio: 'inherit',
  });
  return result.status;
}

async function runStaticExport() {
  await removeDuplicateArtifacts(path.join(repoRoot, '.next'));
  await removeDuplicateArtifacts(path.join(repoRoot, '.next-export'));
  await restoreStaleShelvedPaths();
  const restoreOps = await shelve();
  let exitStatus = 1;
  try {
    exitStatus = runNextBuild() ?? 1;
  } finally {
    await restore(restoreOps);
  }

  if (exitStatus !== 0) {
    process.exit(exitStatus);
  }

  await removeDuplicateArtifacts(path.join(repoRoot, '.next'));
  await removeDuplicateArtifacts(path.join(repoRoot, '.next-export'));
  console.log('\n[build-static-export] success. Output in ./.next-export');
}

async function main() {
  await withNextBuildLock(repoRoot, runStaticExport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
