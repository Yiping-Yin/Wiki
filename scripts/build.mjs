import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { removeDuplicateArtifacts, removePathWithRetry, withNextBuildLock } from './next-build-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const pagefindScript = path.join(root, 'scripts', 'pagefind-if-html.mjs');

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

await withNextBuildLock(root, async () => {
  await removePathWithRetry(path.join(root, 'tsconfig.tsbuildinfo'), { recursive: false });
  await removePathWithRetry(path.join(root, '.next-build', 'types'));
  await removePathWithRetry(path.join(root, '.next-app-dev', 'types'));
  await removePathWithRetry(path.join(root, 'public', 'pagefind'));
  await removeDuplicateArtifacts(path.join(root, '.next'));
  await removeDuplicateArtifacts(path.join(root, '.next-build'));

  await run(process.execPath, [nextBin, 'build'], {
    LOOM_DIST_DIR: '.next-build',
    LOOM_NEXT_OUTPUT: 'standalone',
    LOOM_NEXT_BUILD_LOCK_HELD: '1',
  });

  await removeDuplicateArtifacts(path.join(root, '.next'));
  await removeDuplicateArtifacts(path.join(root, '.next-build'));
  await run(process.execPath, [pagefindScript, '.next-build/server/app', 'public/pagefind'], {
    LOOM_NEXT_BUILD_LOCK_HELD: '1',
  });
  await removeDuplicateArtifacts(path.join(root, '.next'));
  await removeDuplicateArtifacts(path.join(root, '.next-build'));
});
