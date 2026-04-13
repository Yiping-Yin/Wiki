import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nextDir = path.join(root, process.env.LOOM_DIST_DIR || '.next');
const routesManifestPath = path.join(nextDir, 'routes-manifest.json');
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

const manifestJson = JSON.stringify({
  version: 3,
  caseSensitive: false,
  basePath: '',
  rewrites: {
    beforeFiles: [],
    afterFiles: [],
    fallback: [],
  },
  redirects: [
    {
      source: '/:path+/',
      destination: '/:path+',
      permanent: true,
      internal: true,
      regex: '^(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))\\/$',
    },
  ],
  headers: [],
});

function ensureRoutesManifest() {
  mkdirSync(nextDir, { recursive: true });
  if (existsSync(routesManifestPath)) {
    try {
      if (statSync(routesManifestPath).size > 0) return;
    } catch {}
  }
  writeFileSync(routesManifestPath, manifestJson);
}

const child = spawn(process.execPath, [nextBin, 'dev', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});

const interval = setInterval(ensureRoutesManifest, 250);
ensureRoutesManifest();

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on('SIGINT', forwardSignal);
process.on('SIGTERM', forwardSignal);

child.on('exit', (code, signal) => {
  clearInterval(interval);
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
