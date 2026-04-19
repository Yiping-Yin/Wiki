import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stageRuntimeBundle } from './stage-loom-runtime.mjs';

const home = homedir();
const derivedDataRoot = path.join(home, 'Library/Developer/Xcode/DerivedData');
const primaryTarget = '/Applications/Loom.app';
const fallbackTarget = path.join(home, 'Applications/Loom.app');
const mode = process.argv[2] ?? 'auto';
const preferredConfiguration = process.env.LOOM_APP_CONFIGURATION?.trim() || 'Release';

export function buildInstallFailure(code, stderr = '') {
  const message = stderr.trim() || `ditto exited ${code ?? 1}`;
  const error = new Error(message);
  const lower = message.toLowerCase();
  if (lower.includes('permission denied') || lower.includes('operation not permitted') || lower.includes('not permitted')) {
    error.code = 'EACCES';
  }
  return error;
}

export function isPermissionFallbackError(error) {
  const code = error && typeof error === 'object' ? error.code : '';
  if (code === 'EACCES' || code === 'EPERM') return true;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return message.includes('permission denied')
    || message.includes('operation not permitted')
    || message.includes('not permitted');
}

export async function installRuntimeMetadata({ repoRoot, homeOverride } = {}) {
  const appSupportRoot = path.join(homeOverride ?? home, 'Library', 'Application Support', 'Loom');
  await fs.mkdir(appSupportRoot, { recursive: true });
  await fs.writeFile(
    path.join(appSupportRoot, 'content-root.json'),
    JSON.stringify({ contentRoot: repoRoot }, null, 2),
    'utf8',
  );
}

function appSupportRootFor(homeOverride) {
  return path.join(homeOverride ?? home, 'Library', 'Application Support', 'Loom');
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function parseRuntimeRoot(activationText) {
  if (!activationText) return null;

  try {
    const parsed = JSON.parse(activationText);
    return typeof parsed.runtimeRoot === 'string' && parsed.runtimeRoot.trim()
      ? parsed.runtimeRoot
      : null;
  } catch {
    return null;
  }
}

async function snapshotRuntimeState(homeOverride) {
  const appSupportRoot = appSupportRootFor(homeOverride);
  const activationPath = path.join(appSupportRoot, 'runtime', 'current.json');
  const contentRootPath = path.join(appSupportRoot, 'content-root.json');
  const activationText = await readTextIfExists(activationPath);
  const contentRootText = await readTextIfExists(contentRootPath);

  return {
    activationPath,
    activationText,
    contentRootPath,
    contentRootText,
    previousRuntimeRoot: parseRuntimeRoot(activationText),
  };
}

async function restoreRuntimeState(snapshot, stagedRuntimeRoot) {
  if (snapshot.activationText === null) {
    await fs.rm(snapshot.activationPath, { force: true });
  } else {
    await fs.mkdir(path.dirname(snapshot.activationPath), { recursive: true });
    await fs.writeFile(snapshot.activationPath, snapshot.activationText, 'utf8');
  }

  if (snapshot.contentRootText === null) {
    await fs.rm(snapshot.contentRootPath, { force: true });
  } else {
    await fs.mkdir(path.dirname(snapshot.contentRootPath), { recursive: true });
    await fs.writeFile(snapshot.contentRootPath, snapshot.contentRootText, 'utf8');
  }

  if (stagedRuntimeRoot && stagedRuntimeRoot !== snapshot.previousRuntimeRoot) {
    await fs.rm(stagedRuntimeRoot, { recursive: true, force: true });
  }
}

async function listDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findBuiltApp() {
  const entries = await listDirSafe(derivedDataRoot);
  const configurations = [preferredConfiguration, 'Release', 'Debug']
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

  for (const configuration of configurations) {
    const candidates = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('Loom-')) continue;
      const target = path.join(derivedDataRoot, entry.name, `Build/Products/${configuration}/Loom.app`);
      if (await exists(target)) {
        const stat = await fs.stat(target);
        candidates.push({ target, mtimeMs: stat.mtimeMs });
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return candidates[0].target;
    }
  }

  throw new Error(`Could not find built Loom.app in DerivedData for configurations: ${configurations.join(', ')}.`);
}

async function installTo(target, source) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rm(target, { recursive: true, force: true });
  await new Promise((resolve, reject) => {
    let stderr = '';
    const child = spawn('/usr/bin/ditto', [source, target], {
      stdio: ['ignore', 'inherit', 'pipe'],
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(buildInstallFailure(code, stderr));
    });
    child.on('error', reject);
  });
}

export async function installLoomApp({
  mode: installMode = mode,
  repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  homeOverride,
  sourceAppPath,
  dependencies = {},
} = {}) {
  const resolveSource = dependencies.findBuiltApp ?? findBuiltApp;
  const copyApp = dependencies.installTo ?? installTo;
  const stageRuntime = dependencies.stageRuntimeBundle ?? stageRuntimeBundle;
  const persistMetadata = dependencies.installRuntimeMetadata ?? installRuntimeMetadata;
  const source = sourceAppPath ?? await resolveSource();
  const runtimeSnapshot = await snapshotRuntimeState(homeOverride);
  let stagedRuntimeRoot = null;

  const prepareInstall = async () => {
    stagedRuntimeRoot = await stageRuntime({ repoRoot, homeOverride });
    await persistMetadata({ repoRoot, homeOverride });
  };

  if (installMode === 'user') {
    await prepareInstall();
    try {
      await copyApp(fallbackTarget, source);
    } catch (error) {
      await restoreRuntimeState(runtimeSnapshot, stagedRuntimeRoot);
      throw error;
    }
    return { target: fallbackTarget, fallbackUsed: false };
  }

  if (installMode === 'system') {
    await prepareInstall();
    try {
      await copyApp(primaryTarget, source);
    } catch (error) {
      await restoreRuntimeState(runtimeSnapshot, stagedRuntimeRoot);
      throw error;
    }
    return { target: primaryTarget, fallbackUsed: false };
  }

  await prepareInstall();

  try {
    await copyApp(primaryTarget, source);
    return { target: primaryTarget, fallbackUsed: false };
  } catch (error) {
    if (!isPermissionFallbackError(error)) {
      await restoreRuntimeState(runtimeSnapshot, stagedRuntimeRoot);
      throw error;
    }
  }

  try {
    await copyApp(fallbackTarget, source);
  } catch (error) {
    await restoreRuntimeState(runtimeSnapshot, stagedRuntimeRoot);
    throw error;
  }
  return { target: fallbackTarget, fallbackUsed: true };
}

async function main() {
  const { target, fallbackUsed } = await installLoomApp();
  console.log(`Installed Loom.app to ${target}`);
  if (fallbackUsed) {
    console.log('Primary /Applications target was not writable in this environment.');
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
