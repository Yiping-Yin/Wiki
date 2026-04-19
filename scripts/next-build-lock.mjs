import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STALE_MS = 10 * 60 * 1000;
const DEFAULT_POLL_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function removeDuplicateArtifacts(dir) {
  if (!existsSync(dir)) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.name.includes(' 2')) {
      try {
        await rm(fullPath, { recursive: true, force: true });
      } catch {}
      return;
    }
    if (entry.isDirectory()) {
      await removeDuplicateArtifacts(fullPath);
    }
  }));
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
        await rm(lockDir, { recursive: true, force: true });
      };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        await rm(lockDir, { recursive: true, force: true });
        continue;
      }
      if (error?.code !== 'EEXIST') throw error;

      try {
        const info = await stat(lockDir);
        if (Date.now() - info.mtimeMs > staleMs) {
          await rm(lockDir, { recursive: true, force: true });
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
