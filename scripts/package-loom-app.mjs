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
 * @property {string[]} [applicationRoots]
 */

/**
 * @typedef {object} StageRuntimeForPackagingOptions
 * @property {string} [repoRoot]
 * @property {string} [homeOverride]
 */

/**
 * @typedef {object} PackageLoomAppOptions
 * @property {string} appPath
 * @property {string | null} [runtimeRoot]
 * @property {string} [outputRoot]
 * @property {string} contentRoot
 * @property {(sourcePath: string, archivePath: string) => void} [archiveFile]
 */

const home = homedir();
const derivedDataRoot = path.join(home, 'Library/Developer/Xcode/DerivedData');

export function resolveOutputRoot(scriptUrl = import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(scriptUrl)), '..');
  return path.join(root, 'output');
}

const outputRoot = resolveOutputRoot();

export function createDittoArchiveArgs(sourcePath, archivePath) {
  return ['-c', '-k', '--norsrc', '--noextattr', '--keepParent', sourcePath, archivePath];
}

function archiveWithDitto(sourcePath, archivePath) {
  execFileSync('ditto', createDittoArchiveArgs(sourcePath, archivePath), {
    stdio: 'inherit',
  });
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

/**
 * @param {FindBuiltAppOptions} [options]
 */
export async function findInstalledApp({ applicationRoots = [path.join(home, 'Applications'), '/Applications'] } = {}) {
  const candidates = [];

  for (const root of applicationRoots) {
    const target = path.join(root, 'Loom.app');
    if (await exists(target)) {
      const stat = await fs.stat(target);
      candidates.push({ target, mtimeMs: stat.mtimeMs });
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return candidates[0].target;
  }

  throw new Error(`Could not find installed Loom.app in: ${applicationRoots.join(', ')}.`);
}

/**
 * @param {FindBuiltAppOptions} [options]
 */
export async function findPackageSourceApp(options = {}) {
  try {
    return await findBuiltApp(options);
  } catch (buildError) {
    try {
      return await findInstalledApp(options);
    } catch (installError) {
      const buildMessage = buildError instanceof Error ? buildError.message : String(buildError);
      const installMessage = installError instanceof Error ? installError.message : String(installError);
      throw new Error(`${buildMessage} ${installMessage}`);
    }
  }
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
export function packageLoomApp({
  appPath,
  runtimeRoot,
  outputRoot: outputDir = outputRoot,
  contentRoot,
  archiveFile = archiveWithDitto,
} = {}) {
  const appArchivePath = path.join(outputDir, 'Loom-replacement.zip');
  const runtimeArchivePath = path.join(outputDir, 'Loom-runtime.zip');

  mkdirSync(outputDir, { recursive: true });
  rmSync(appArchivePath, { force: true });
  rmSync(runtimeArchivePath, { force: true });

  archiveFile(appPath, appArchivePath);

  let packagedRuntimeArchivePath = null;
  if (runtimeRoot) {
    const { libraryRoot, tempRoot } = createRuntimePackagePayload({ runtimeRoot, contentRoot, outputDir });
    try {
      archiveFile(libraryRoot, runtimeArchivePath);
      packagedRuntimeArchivePath = runtimeArchivePath;
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  const readme = runtimeRoot ? [
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
  ] : [
    'Loom app package',
    '',
    `Bundle source: ${appPath}`,
    'Runtime source: not produced; Loom ships static web resources inside Loom.app/Contents/Resources/web',
    `Archive: ${appArchivePath}`,
    'Runtime archive: not produced',
    '',
    'To replace the installed app:',
    '1. Quit Loom.app',
    '2. Delete the existing Loom.app from /Applications or ~/Applications',
    '3. Unzip Loom-replacement.zip',
    '4. Move Loom.app into the chosen Applications folder',
    '5. Launch Loom.app and run npm run app:smoke if validating this package locally',
  ].join('\n');

  writeFileSync(path.join(outputDir, 'INSTALL-LOOM.txt'), readme, 'utf8');
  return { appArchivePath, runtimeArchivePath: packagedRuntimeArchivePath };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const appPath = await findPackageSourceApp();
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
