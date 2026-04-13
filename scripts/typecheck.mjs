import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const npmCli = path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const tscCli = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');

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

const requiredArtifacts = [
  path.join(root, '.next-build', 'server', 'middleware-manifest.json'),
  path.join(root, '.next-build', 'types', 'package.json'),
];

if (!requiredArtifacts.every((file) => existsSync(file))) {
  console.log('typecheck: build artifacts missing, running `npm run build` first...');
  await run(process.execPath, [npmCli, 'run', 'build']);
}

await run(process.execPath, [tscCli, '--noEmit']);
