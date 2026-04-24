#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const expectedBundleId = 'com.yinyiping.loom';
const appSandboxEntitlementPattern = /<key>com\.apple\.security\.app-sandbox<\/key>\s*<true\/>/;

export function installedAppCandidates({ homeOverride } = {}) {
  const home = homeOverride ?? homedir();
  return [
    path.join(home, 'Applications', 'Loom.app'),
    '/Applications/Loom.app',
  ];
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function findInstalledApp({ appPath, homeOverride } = {}) {
  const explicit = appPath ?? process.env.LOOM_APP_PATH;
  if (explicit) {
    if (!(await exists(explicit))) {
      throw new Error(`LOOM_APP_PATH does not exist: ${explicit}`);
    }
    return explicit;
  }

  const found = [];
  for (const candidate of installedAppCandidates({ homeOverride })) {
    if (await exists(candidate)) {
      const stat = await fs.stat(candidate);
      found.push({ path: candidate, mtimeMs: stat.mtimeMs });
    }
  }
  if (found.length === 0) {
    throw new Error('No installed Loom.app found in ~/Applications or /Applications.');
  }
  found.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return found[0].path;
}

function runTool(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function readPlistValue(plistPath, key) {
  return runTool('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plistPath]).trim();
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new Error(`${label} is missing: ${filePath}`);
  }
  if (stat.size === 0) {
    throw new Error(`${label} is empty: ${filePath}`);
  }
  return stat;
}

async function countFiles(root) {
  let total = 0;
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      total += await countFiles(child);
    } else if (entry.isFile()) {
      total += 1;
    }
  }
  return total;
}

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} does not include ${needle}`);
  }
}

export async function runInstalledAppSmoke(options = {}) {
  const appPath = await findInstalledApp(options);
  const contents = path.join(appPath, 'Contents');
  const infoPlist = path.join(contents, 'Info.plist');
  const executable = path.join(contents, 'MacOS', 'Loom');
  const resources = path.join(contents, 'Resources');
  const webRoot = path.join(resources, 'web');

  await assertFile(infoPlist, 'Info.plist');
  await assertFile(executable, 'Loom executable');
  await assertFile(path.join(resources, 'PrivacyInfo.xcprivacy'), 'PrivacyInfo.xcprivacy');
  await assertFile(path.join(webRoot, 'index.html'), 'static export index');
  await assertFile(path.join(webRoot, 'desk.html'), 'static export desk route');
  await assertFile(path.join(webRoot, 'knowledge.html'), 'static export knowledge route');
  await assertFile(path.join(webRoot, 'search-index.json'), 'static search index');

  const bundleId = readPlistValue(infoPlist, 'CFBundleIdentifier');
  if (bundleId !== expectedBundleId) {
    throw new Error(`Expected CFBundleIdentifier ${expectedBundleId}, got ${bundleId}`);
  }

  const displayName = readPlistValue(infoPlist, 'CFBundleDisplayName');
  if (displayName !== 'Loom') {
    throw new Error(`Expected CFBundleDisplayName Loom, got ${displayName}`);
  }

  const indexHtml = await fs.readFile(path.join(webRoot, 'index.html'), 'utf8');
  assertIncludes(indexHtml, '/_next/static/', 'static export index');

  const fileCount = await countFiles(webRoot);
  if (fileCount < 50) {
    throw new Error(`Static web bundle looks too small: ${fileCount} file(s) in ${webRoot}`);
  }

  if (process.env.LOOM_SMOKE_SKIP_CODESIGN !== '1') {
    const entitlements = runTool('/usr/bin/codesign', ['-d', '--entitlements', ':-', appPath]);
    assertIncludes(entitlements, 'com.apple.security.app-sandbox', 'codesign entitlements');
    if (!appSandboxEntitlementPattern.test(entitlements)) {
      throw new Error('codesign entitlements do not enable the app sandbox');
    }
  }

  return {
    appPath,
    bundleId,
    fileCount,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runInstalledAppSmoke()
    .then((result) => {
      console.log(`installed app smoke ok: ${result.appPath}`);
      console.log(`bundle id: ${result.bundleId}`);
      console.log(`static web files: ${result.fileCount}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
