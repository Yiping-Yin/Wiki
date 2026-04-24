#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const macosRoot = path.join(repoRoot, 'macos-app', 'Loom');
const archivePath = process.env.LOOM_ARCHIVE_PATH
  ? path.resolve(process.env.LOOM_ARCHIVE_PATH)
  : path.join(repoRoot, '.app-store', 'archives', 'Loom.xcarchive');
const isStoreArchive = process.argv.includes('--store');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 1}`);
  }
}

function requireStoreSigningConfig() {
  const teamId = process.env.LOOM_APPLE_TEAM_ID;
  if (!teamId) {
    throw new Error(
      [
        'LOOM_APPLE_TEAM_ID is required for App Store archive signing.',
        'Use npm run app:archive for a local ad hoc archive validation.',
        'Use LOOM_APPLE_TEAM_ID=<team id> LOOM_ALLOW_PROVISIONING_UPDATES=1 npm run app:archive:store for distribution signing.',
      ].join('\n'),
    );
  }
  return teamId;
}

function archiveArgs() {
  const args = [
    '-project',
    'Loom.xcodeproj',
    '-scheme',
    'Loom',
    '-configuration',
    'Release',
    '-destination',
    'platform=macOS',
    '-archivePath',
    archivePath,
    '-quiet',
    'archive',
  ];

  if (isStoreArchive) {
    const teamId = requireStoreSigningConfig();
    if (process.env.LOOM_ALLOW_PROVISIONING_UPDATES === '1') {
      args.push('-allowProvisioningUpdates');
    }
    args.push(`DEVELOPMENT_TEAM=${teamId}`);
    args.push('CODE_SIGN_STYLE=Automatic');
    args.push(`CODE_SIGN_IDENTITY=${process.env.LOOM_CODE_SIGN_IDENTITY ?? 'Apple Distribution'}`);
  } else {
    args.push('CODE_SIGN_IDENTITY=-');
  }

  return args;
}

function inspectArchive() {
  const appPath = path.join(archivePath, 'Products', 'Applications', 'Loom.app');
  if (!fs.existsSync(appPath)) {
    throw new Error(`Archive did not contain Products/Applications/Loom.app: ${archivePath}`);
  }

  run('/usr/bin/plutil', ['-p', path.join(appPath, 'Contents', 'Info.plist')]);
  run('/usr/bin/codesign', ['-dvvv', '--entitlements', ':-', appPath]);

  console.log(`Archive: ${archivePath.replace(homedir(), '~')}`);
  console.log(`App: ${appPath.replace(homedir(), '~')}`);
}

function main() {
  fs.rmSync(archivePath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });

  run('xcodegen', ['generate'], { cwd: macosRoot });
  run('xcodebuild', archiveArgs(), { cwd: macosRoot });
  inspectArchive();

  if (!isStoreArchive) {
    console.log('Signing mode: local validation archive (ad hoc).');
    console.log('For App Store distribution, rerun app:archive:store with LOOM_APPLE_TEAM_ID.');
  } else {
    console.log('Signing mode: App Store distribution archive.');
    console.log('Next: npm run app:export:store');
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
