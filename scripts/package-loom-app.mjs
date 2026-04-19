import { promises as fs } from 'node:fs';
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stageRuntimeBundle } from './stage-loom-runtime.mjs';

/**
 * @typedef {object} FindBuiltAppOptions
 * @property {string} [derivedDataRoot]
 * @property {string} [preferredConfiguration]
 */

/**
 * @typedef {object} StageRuntimeForPackagingOptions
 * @property {string} [repoRoot]
 * @property {string} [homeOverride]
 */

/**
 * @typedef {object} PackageLoomAppOptions
 * @property {string} appPath
 * @property {string} runtimeRoot
 * @property {string} [outputRoot]
 * @property {string} contentRoot
 */

const home = homedir();
const derivedDataRoot = path.join(home, 'Library/Developer/Xcode/DerivedData');

export function resolveOutputRoot(scriptUrl = import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(scriptUrl)), '..');
  return path.join(root, 'output');
}

const outputRoot = resolveOutputRoot();

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

/**
 * @param {FindBuiltAppOptions} [options]
 */
export async function findBuiltApp({ derivedDataRoot: searchRoot = derivedDataRoot, preferredConfiguration = 'Release' } = {}) {
  const entries = await listDirSafe(searchRoot);
  const configurations = [preferredConfiguration, 'Release', 'Debug']
    .filter((value, index, array) => Boolean(value) && array.indexOf(value) === index);

  for (const configuration of configurations) {
    const candidates = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('Loom-')) continue;
      const target = path.join(searchRoot, entry.name, 'Build', 'Products', configuration, 'Loom.app');
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

function createRuntimePackagePayload({ runtimeRoot, contentRoot, outputDir }) {
  const buildId = path.basename(runtimeRoot);
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'loom-runtime-package-'));
  const libraryRoot = path.join(tempRoot, 'Library');
  const appSupportRoot = path.join(libraryRoot, 'Application Support', 'Loom');
  const packagedRuntimeRoot = path.join(appSupportRoot, 'runtime', buildId);

  mkdirSync(path.dirname(packagedRuntimeRoot), { recursive: true });
  cpSync(runtimeRoot, packagedRuntimeRoot, { recursive: true });
  writeFileSync(
    path.join(appSupportRoot, 'runtime', 'current.json'),
    JSON.stringify({
      buildId,
    }, null, 2),
    'utf8',
  );
  writeFileSync(
    path.join(appSupportRoot, 'content-root.json'),
    JSON.stringify({ contentRoot }, null, 2),
    'utf8',
  );

  return { libraryRoot, tempRoot };
}

/**
 * @param {StageRuntimeForPackagingOptions} [options]
 */
export async function stageRuntimeForPackaging({ repoRoot, homeOverride } = {}) {
  const tempHomeRoot = mkdtempSync(path.join(tmpdir(), 'loom-package-home-'));

  try {
    const runtimeRoot = await stageRuntimeBundle({ repoRoot, homeOverride: tempHomeRoot });
    return {
      runtimeRoot,
      cleanup: async () => {
        await fs.rm(tempHomeRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await fs.rm(tempHomeRoot, { recursive: true, force: true });
    throw error;
  }
}

/**
 * @param {PackageLoomAppOptions} options
 */
export function packageLoomApp({ appPath, runtimeRoot, outputRoot: outputDir = outputRoot, contentRoot } = {}) {
  const appArchivePath = path.join(outputDir, 'Loom-replacement.zip');
  const runtimeArchivePath = path.join(outputDir, 'Loom-runtime.zip');
  const { libraryRoot, tempRoot } = createRuntimePackagePayload({ runtimeRoot, contentRoot, outputDir });

  mkdirSync(outputDir, { recursive: true });
  rmSync(appArchivePath, { force: true });
  rmSync(runtimeArchivePath, { force: true });

  execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, appArchivePath], {
    stdio: 'inherit',
  });
  try {
    execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', libraryRoot, runtimeArchivePath], {
      stdio: 'inherit',
    });
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  const readme = [
    'Loom replacement package',
    '',
    `Bundle source: ${appPath}`,
    `Runtime source: ${runtimeRoot}`,
    `Archive: ${appArchivePath}`,
    `Runtime archive: ${runtimeArchivePath}`,
    '',
    'To replace the installed app:',
    '1. Quit Loom.app',
    '2. Delete /Applications/Loom.app',
    '3. Unzip Loom-replacement.zip',
    '4. Move Loom.app into /Applications',
    '5. Unzip Loom-runtime.zip into your home directory so it recreates Library/Application Support/Loom',
    '6. Confirm Library/Application Support/Loom/runtime/current.json and content-root.json are present',
  ].join('\n');

  writeFileSync(path.join(outputDir, 'INSTALL-LOOM.txt'), readme, 'utf8');
  return { appArchivePath, runtimeArchivePath };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const appPath = await findBuiltApp();
  const stagedRuntime = await stageRuntimeForPackaging({ repoRoot: root });

  try {
    const { appArchivePath } = packageLoomApp({
      appPath,
      runtimeRoot: stagedRuntime.runtimeRoot,
      outputRoot,
      contentRoot: root,
    });
    console.log(appArchivePath);
  } finally {
    await stagedRuntime.cleanup();
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
