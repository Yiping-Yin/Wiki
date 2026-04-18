import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { removeDuplicateArtifacts, withNextBuildLock } from './next-build-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tscCli = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const npmExecPath = process.env.npm_execpath && existsSync(process.env.npm_execpath)
  ? process.env.npm_execpath
  : null;

function run(cmd, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, ...extraEnv },
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited ${code ?? 1}`));
    });
    child.on('error', reject);
  });
}

function runCapture(cmd, args, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      stdio: ['inherit', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on('exit', (code) => {
      if (code === 0) resolve(output);
      else {
        const error = new Error(`${cmd} ${args.join(' ')} exited ${code ?? 1}`);
        error.output = output;
        reject(error);
      }
    });
    child.on('error', reject);
  });
}

function runNpmScript(scriptName, extraEnv = {}) {
  if (npmExecPath) {
    return run(process.execPath, [npmExecPath, 'run', scriptName], extraEnv);
  }
  return run('npm', ['run', scriptName], extraEnv);
}

const requiredArtifacts = [
  path.join(root, '.next-build', 'server', 'middleware-manifest.json'),
  path.join(root, '.next-build', 'types', 'package.json'),
];

await withNextBuildLock(root, async () => {
  await removeDuplicateArtifacts(path.join(root, '.next-build'));
  await removeDuplicateArtifacts(path.join(root, '.next-app-dev'));

  if (!requiredArtifacts.every((file) => existsSync(file))) {
    console.log('typecheck: build artifacts missing, running `npm run build` first...');
    await runNpmScript('build', { LOOM_NEXT_BUILD_LOCK_HELD: '1' });
  }

  try {
    await runCapture(process.execPath, [tscCli, '--noEmit']);
  } catch (error) {
    const output = String(error.output ?? '');
    const missingTypegen =
      output.includes('TS6053')
      && output.includes('.next-build/types/');

    if (!missingTypegen) throw error;

    console.log('typecheck: detected stale Next route types, rebuilding `npm run build` and retrying...');
    await runNpmScript('build', { LOOM_NEXT_BUILD_LOCK_HELD: '1' });
    await runCapture(process.execPath, [tscCli, '--noEmit']);
  }
});
