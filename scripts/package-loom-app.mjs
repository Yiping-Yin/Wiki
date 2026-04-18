import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const home = homedir();
const derivedDataRoot = path.join(home, 'Library/Developer/Xcode/DerivedData');

export function resolveOutputRoot(scriptUrl = import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(scriptUrl)), '..');
  return path.join(root, 'output');
}

const outputRoot = resolveOutputRoot();
const zipPath = path.join(outputRoot, 'Loom-replacement.zip');

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
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('Loom-')) continue;
    const target = path.join(derivedDataRoot, entry.name, 'Build/Products/Debug/Loom.app');
    if (await exists(target)) {
      const stat = await fs.stat(target);
      candidates.push({ target, mtimeMs: stat.mtimeMs });
    }
  }

  if (candidates.length === 0) {
    throw new Error('Could not find built Loom.app in DerivedData.');
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].target;
}

async function main() {
  const appPath = await findBuiltApp();
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.rm(zipPath, { force: true });

  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath], {
    stdio: 'inherit',
  });

  const readme = [
    'Loom replacement package',
    '',
    `Bundle source: ${appPath}`,
    `Archive: ${zipPath}`,
    '',
    'To replace the installed app:',
    '1. Quit Loom.app',
    '2. Delete /Applications/Loom.app',
    '3. Unzip Loom-replacement.zip',
    '4. Move Loom.app into /Applications',
  ].join('\n');

  await fs.writeFile(path.join(outputRoot, 'INSTALL-LOOM.txt'), readme, 'utf8');
  console.log(zipPath);
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
