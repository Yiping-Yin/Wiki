import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

async function main() {
  const source = await findBuiltApp();
  if (mode === 'user') {
    await installTo(fallbackTarget, source);
    console.log(`Installed Loom.app to ${fallbackTarget}`);
    return;
  }

  if (mode === 'system') {
    await installTo(primaryTarget, source);
    console.log(`Installed Loom.app to ${primaryTarget}`);
    return;
  }

  try {
    await installTo(primaryTarget, source);
    console.log(`Installed Loom.app to ${primaryTarget}`);
    return;
  } catch (error) {
    if (!isPermissionFallbackError(error)) throw error;
  }

  await installTo(fallbackTarget, source);
  console.log(`Installed Loom.app to ${fallbackTarget}`);
  console.log('Primary /Applications target was not writable in this environment.');
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
