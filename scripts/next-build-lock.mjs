import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STALE_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 250;
const DUPLICATE_ARTIFACT_PATTERN = / \d+(?=($|\.))/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isStaleBuildArtifactName(name) {
  return name === '.DS_Store'
    || name.startsWith('._')
    || DUPLICATE_ARTIFACT_PATTERN.test(name);
}

export async function findStaleBuildArtifacts(dir, { limit = Infinity } = {}) {
  const stale = [];
  await findStaleBuildArtifactsInDir(dir, stale, limit);
  return stale;
}

async function findStaleBuildArtifactsInDir(dir, stale, limit) {
  if (!existsSync(dir) || stale.length >= limit) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isStaleBuildArtifactName(entry.name)) {
      stale.push(fullPath);
      if (stale.length >= limit) return;
      continue;
    }
    if (entry.isDirectory()) {
      await findStaleBuildArtifactsInDir(fullPath, stale, limit);
      if (stale.length >= limit) return;
    }
  }
}

export async function assertNoStaleBuildArtifacts(dir, label = dir) {
  const stale = await findStaleBuildArtifacts(dir, { limit: 10 });
  if (stale.length === 0) return;
  throw new Error(`stale macOS/Finder build artifacts remain in ${label}:\n${stale.join('\n')}`);
}

export async function removeDuplicateArtifacts(dir, { strict = true } = {}) {
  if (!existsSync(dir)) return;
  const failures = [];
  await removeDuplicateArtifactsInDir(dir, failures);
  if (strict && failures.length > 0) {
    const listed = failures
      .slice(0, 10)
      .map(({ target, error }) => `${target}: ${error?.message ?? String(error)}`)
      .join('\n');
    const more = failures.length > 10 ? `\n...and ${failures.length - 10} more` : '';
    throw new Error(`failed to remove stale macOS/Finder build artifacts:\n${listed}${more}`);
  }
}

async function removeDuplicateArtifactsInDir(dir, failures) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (isStaleBuildArtifactName(entry.name)) {
      try {
        await removePathWithRetry(fullPath);
      } catch (error) {
        failures.push({ target: fullPath, error });
      }
      return;
    }
    if (entry.isDirectory()) {
      await removeDuplicateArtifactsInDir(fullPath, failures);
    }
  }));
}

export async function removePathWithRetry(target, {
  recursive = true,
  force = true,
  attempts = 5,
  retryDelayMs = 100,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(target, {
        recursive,
        force,
        maxRetries: 2,
        retryDelay: retryDelayMs,
      });
      return;
    } catch (error) {
      if (force && error?.code === 'ENOENT') return;
      const canRetry = error?.code === 'ENOTEMPTY' || error?.code === 'EBUSY' || error?.code === 'EPERM';
      if (!canRetry || attempt === attempts - 1) throw error;
      await sleep(retryDelayMs * (attempt + 1));
    }
  }
}

async function acquireBuildLock(root, { staleMs = DEFAULT_STALE_MS, pollMs = DEFAULT_POLL_MS } = {}) {
  if (process.env.LOOM_NEXT_BUILD_LOCK_HELD === '1') {
    return async () => {};
  }

  const lockDir = path.join(root, '.next-build.lock');
  const ownerFile = path.join(lockDir, 'owner.json');

  while (true) {
    try {
      await mkdir(lockDir, { recursive: true });
      await writeFile(ownerFile, JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now(),
      }), { flag: 'wx' });
      return async () => {
        try {
          await removePathWithRetry(lockDir);
        } catch (error) {
          if (error?.code === 'ENOENT' || error?.code === 'ENOTEMPTY') return;
          throw error;
        }
      };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        await removePathWithRetry(lockDir);
        continue;
      }
      if (error?.code !== 'EEXIST') throw error;

      try {
        const info = await stat(lockDir);
        if (Date.now() - info.mtimeMs > staleMs) {
          await removePathWithRetry(lockDir);
          continue;
        }
      } catch {
        continue;
      }

      await sleep(pollMs);
    }
  }
}

export async function withNextBuildLock(root, fn) {
  const release = await acquireBuildLock(root);
  try {
    return await fn();
  } finally {
    await release();
  }
}
