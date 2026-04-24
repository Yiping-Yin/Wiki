#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const macosRoot = path.join(repoRoot, 'macos-app', 'Loom');
const mode = process.argv[2] ?? 'auto';

const successMessages = {
  auto: '✓ Loom.app installed',
  user: '✓ Loom.app installed to ~/Applications',
  system: '✓ Loom.app installed to /Applications',
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const error = new Error(`${command} ${args.join(' ')} exited ${result.status ?? 1}`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}

function nodeScript(relativePath, args = []) {
  run(process.execPath, [relativePath, ...args], { cwd: repoRoot });
}

function removeStaleNamedProjects() {
  for (const entry of fs.readdirSync(macosRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^Loom .+\.xcodeproj$/.test(entry.name)) continue;
    fs.rmSync(path.join(macosRoot, entry.name), { recursive: true, force: true });
  }
}

function buildReleaseApp() {
  run('npm', ['run', 'build']);
  nodeScript('scripts/build-static-export.mjs');

  removeStaleNamedProjects();
  run('xcodegen', ['generate'], { cwd: macosRoot });
  run('xcodebuild', [
    '-project',
    'Loom.xcodeproj',
    '-scheme',
    'Loom',
    '-configuration',
    'Release',
    'build',
  ], { cwd: macosRoot });
}

let exitCode = 0;

try {
  buildReleaseApp();
  nodeScript('scripts/install-loom-app.mjs', [mode]);
  console.log(successMessages[mode] ?? successMessages.auto);
} catch (error) {
  exitCode = error?.exitCode ?? 1;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  try {
    nodeScript('scripts/clean-loom-app-bundles.mjs');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (exitCode === 0) {
      exitCode = error?.exitCode ?? 1;
    }
  }
}

process.exit(exitCode);
