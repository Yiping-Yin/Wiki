import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * @typedef {object} StageRuntimeBundleOptions
 * @property {string} [repoRoot]
 * @property {string} [homeOverride]
 */

function runtimeBaseDir(homePath) {
  return path.join(homePath, 'Library', 'Application Support', 'Loom', 'runtime');
}

async function writeActivationRecordAtomic(runtimeBase, activationRecord) {
  const activationPath = path.join(runtimeBase, 'current.json');
  const tempActivationPath = path.join(runtimeBase, 'current.json.tmp');
  await fs.writeFile(
    tempActivationPath,
    JSON.stringify(activationRecord, null, 2),
    'utf8',
  );
  await fs.rename(tempActivationPath, activationPath);
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directoryHasMatchingEntry(dirPath, pattern) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && pattern.test(entry.name));
  } catch {
    return false;
  }
}

async function validateStagedRuntime(targetRoot) {
  const requiredPaths = [
    path.join(targetRoot, 'standalone', 'server.js'),
    path.join(targetRoot, 'standalone', '.next-build', 'static'),
    path.join(targetRoot, 'standalone', 'public'),
    path.join(targetRoot, 'standalone', 'public', 'pagefind', 'pagefind.js'),
    path.join(targetRoot, 'standalone', 'public', 'pagefind', 'pagefind-entry.json'),
  ];

  for (const requiredPath of requiredPaths) {
    if (!await pathExists(requiredPath)) {
      throw new Error(`Incomplete staged runtime payload: missing ${requiredPath}`);
    }
  }

  const pagefindRoot = path.join(targetRoot, 'standalone', 'public', 'pagefind');
  const hasFragmentData = await directoryHasMatchingEntry(
    path.join(pagefindRoot, 'fragment'),
    /\.pf_fragment$/,
  );
  if (!hasFragmentData) {
    throw new Error(`Incomplete staged runtime payload: missing pagefind fragment data in ${pagefindRoot}`);
  }

  const hasIndexData = await directoryHasMatchingEntry(
    path.join(pagefindRoot, 'index'),
    /\.pf_index$/,
  );
  if (!hasIndexData) {
    throw new Error(`Incomplete staged runtime payload: missing pagefind index data in ${pagefindRoot}`);
  }
}

async function acquireInstallLock(runtimeBase) {
  const lockPath = path.join(runtimeBase, '.install-lock');
  const ownerLine = `${process.pid}@${new Date().toISOString()}`;
  try {
    // wx = exclusive create. Fails with EEXIST if another process holds the lock.
    await fs.writeFile(lockPath, ownerLine, { encoding: 'utf8', flag: 'wx' });
    return lockPath;
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      // Check for stale lock (> 10 minutes old — well past any reasonable stage run).
      try {
        const stats = await fs.stat(lockPath);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs > 10 * 60 * 1000) {
          const staleOwner = await fs.readFile(lockPath, 'utf8').catch(() => '<unreadable>');
          await fs.rm(lockPath, { force: true });
          process.stderr.write(
            `stage-loom-runtime: removed stale install lock (age ${Math.round(ageMs / 1000)}s, prior owner: ${staleOwner})\n`,
          );
          return acquireInstallLock(runtimeBase);
        }
      } catch {}
      const existingOwner = await fs.readFile(lockPath, 'utf8').catch(() => '<unreadable>');
      throw new Error(
        `Another stage/install is in progress (lock held by ${existingOwner}). ` +
        `If you're sure no other install is running, remove ${lockPath} and retry.`,
      );
    }
    throw error;
  }
}

async function releaseInstallLock(lockPath) {
  if (!lockPath) return;
  await fs.rm(lockPath, { force: true }).catch(() => {});
}

/**
 * @param {StageRuntimeBundleOptions} [options]
 */
export async function stageRuntimeBundle({ repoRoot = process.cwd(), homeOverride } = {}) {
  const homePath = homeOverride ?? homedir();
  const buildRoot = path.join(repoRoot, '.next-build');
  const buildId = (await fs.readFile(path.join(buildRoot, 'BUILD_ID'), 'utf8')).trim();
  const runtimeBase = runtimeBaseDir(homePath);
  const targetRoot = path.join(runtimeBase, buildId);
  const stagingRoot = path.join(runtimeBase, `${buildId}.staging-${process.pid}-${Date.now()}`);
  const standaloneRoot = path.join(stagingRoot, 'standalone');

  await fs.mkdir(runtimeBase, { recursive: true });

  const lockPath = await acquireInstallLock(runtimeBase);

  try {
    await fs.mkdir(standaloneRoot, { recursive: true });
    await fs.cp(path.join(buildRoot, 'standalone'), standaloneRoot, { recursive: true });
    await fs.cp(
      path.join(buildRoot, 'static'),
      path.join(standaloneRoot, '.next-build', 'static'),
      { recursive: true },
    );
    await fs.cp(
      path.join(repoRoot, 'public'),
      path.join(standaloneRoot, 'public'),
      { recursive: true },
    );

    await validateStagedRuntime(stagingRoot);

    await fs.rm(targetRoot, { recursive: true, force: true });
    await fs.rename(stagingRoot, targetRoot);
    await writeActivationRecordAtomic(runtimeBase, { buildId, runtimeRoot: targetRoot });
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true });
    throw error;
  } finally {
    await releaseInstallLock(lockPath);
  }

  return targetRoot;
}
