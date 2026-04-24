#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultArchivePath = path.join(repoRoot, '.app-store', 'archives', 'Loom.xcarchive');
const defaultExportPath = path.join(repoRoot, '.app-store', 'exports', 'app-store-connect');
const defaultExportOptionsPlist = path.join(repoRoot, 'macos-app', 'Loom', 'ExportOptions-AppStore.plist');

const archivePath = process.env.LOOM_ARCHIVE_PATH
  ? path.resolve(process.env.LOOM_ARCHIVE_PATH)
  : defaultArchivePath;
const exportPath = process.env.LOOM_EXPORT_PATH
  ? path.resolve(process.env.LOOM_EXPORT_PATH)
  : defaultExportPath;
const exportOptionsPlist = process.env.LOOM_EXPORT_OPTIONS_PLIST
  ? path.resolve(process.env.LOOM_EXPORT_OPTIONS_PLIST)
  : defaultExportOptionsPlist;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status ?? 1}`);
  }
}

function requireInputs() {
  if (!process.env.LOOM_APPLE_TEAM_ID) {
    throw new Error(
      [
        'LOOM_APPLE_TEAM_ID is required for App Store export.',
        'First create a distribution archive with LOOM_APPLE_TEAM_ID=<team id> npm run app:archive:store.',
      ].join('\n'),
    );
  }

  if (!fs.existsSync(archivePath)) {
    throw new Error(`Archive is missing: ${archivePath}. Run npm run app:archive:store first.`);
  }

  if (!fs.existsSync(exportOptionsPlist)) {
    throw new Error(`Export options plist is missing: ${exportOptionsPlist}`);
  }
}

function main() {
  requireInputs();
  fs.rmSync(exportPath, { recursive: true, force: true });
  fs.mkdirSync(exportPath, { recursive: true });

  const args = [
    '-exportArchive',
    '-archivePath',
    archivePath,
    '-exportPath',
    exportPath,
    '-exportOptionsPlist',
    exportOptionsPlist,
  ];

  if (process.env.LOOM_ALLOW_PROVISIONING_UPDATES === '1') {
    args.push('-allowProvisioningUpdates');
  }

  run('xcodebuild', args);
  console.log(`Export: ${exportPath}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
