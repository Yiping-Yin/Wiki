import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('typecheck script falls back to npm when npm_execpath is unavailable', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/typecheck.mjs'), 'utf8');

  assert.match(source, /const npmExecPath = process\.env\.npm_execpath && existsSync\(process\.env\.npm_execpath\)/);
  assert.match(
    source,
    /function runNpmScript\(scriptName, extraEnv = \{\}\) \{[\s\S]*if \(npmExecPath\) \{[\s\S]*return run\(process\.execPath, \[npmExecPath, 'run', scriptName\], extraEnv\);[\s\S]*\}[\s\S]*return run\('npm', \['run', scriptName\], extraEnv\);[\s\S]*\}/,
  );
});

test('typecheck script resolves repo root from the script path and serializes builds', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/typecheck.mjs'), 'utf8');
  const buildSource = fs.readFileSync(path.join(repoRoot, 'scripts/build.mjs'), 'utf8');
  const exportSource = fs.readFileSync(path.join(repoRoot, 'scripts/build-static-export.mjs'), 'utf8');

  assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(source, /withNextBuildLock\(root, async \(\) => \{/);
  assert.match(source, /removeDuplicateArtifacts\(path\.join\(root, '\.next'\)\)/);
  assert.match(source, /removeDuplicateArtifacts\(path\.join\(root, '\.next-build'\)\)/);
  assert.match(source, /output\.includes\('TS6053'\) \|\| output\.includes\('TS2307'\)/);
  assert.match(source, /output\.includes\('\.next-build\/types\/'\) \|\| output\.includes\('\.next\/types\/'\)/);
  assert.match(source, /await removeDuplicateArtifacts\(path\.join\(root, '\.next'\)\);[\s\S]*await run\('rm', \['-rf', path\.join\(root, '\.next', 'types'\)\]\);[\s\S]*await run\('rm', \['-rf', path\.join\(root, '\.next-build', 'types'\)\]\)/);
  assert.match(source, /run\('rm', \['-rf', path\.join\(root, '\.next', 'types'\)\]\)/);
  assert.match(source, /run\('rm', \['-rf', path\.join\(root, '\.next-build', 'types'\)\]\)/);
  assert.match(buildSource, /await removeDuplicateArtifacts\(path\.join\(root, '\.next'\)\);/);
  assert.match(buildSource, /await run\(process\.execPath, \[pagefindScript, '\.next-build\/server\/app', 'public\/pagefind'\],[\s\S]*\);\s*await removeDuplicateArtifacts\(path\.join\(root, '\.next'\)\);\s*await removeDuplicateArtifacts\(path\.join\(root, '\.next-build'\)\);/);
  assert.match(buildSource, /removePathWithRetry\(path\.join\(root, '\.next-build', 'types'\)\);/);
  assert.match(buildSource, /removePathWithRetry\(path\.join\(root, 'public', 'pagefind'\)\);/);
  assert.match(exportSource, /import \{ removeDuplicateArtifacts, withNextBuildLock \} from '\.\/next-build-lock\.mjs';/);
  assert.match(exportSource, /await removeDuplicateArtifacts\(path\.join\(repoRoot, '\.next'\)\);/);
  assert.match(exportSource, /await removeDuplicateArtifacts\(path\.join\(repoRoot, '\.next-export'\)\);/);
  assert.match(exportSource, /async function restoreStaleShelvedPaths\(\) \{/);
  assert.match(exportSource, /await restoreStaleShelvedPaths\(\);[\s\S]*const restoreOps = await shelve\(\);/);
  assert.match(exportSource, /await fs\.mkdir\(path\.dirname\(op\.to\), \{ recursive: true \}\);[\s\S]*await fs\.rename\(op\.from, op\.to\);/);
  assert.match(exportSource, /function runBuildSearchIndex\(\) \{/);
  assert.match(exportSource, /'tsx', 'scripts\/build-search-index\.ts'/);
  assert.match(exportSource, /async function copySearchIndexIntoExport\(\) \{/);
  assert.match(exportSource, /await copySearchIndexIntoExport\(\);/);
  assert.match(exportSource, /LOOM_NEXT_BUILD_LOCK_HELD: '1'/);
  assert.match(exportSource, /await withNextBuildLock\(repoRoot, runStaticExport\);/);
});

test('next build lock creates the lock directory recursively and retries missing owner writes', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts/next-build-lock.mjs'), 'utf8');

  assert.match(source, /await mkdir\(lockDir, \{ recursive: true \}\);/);
  assert.match(source, /if \(error\?\.code === 'ENOENT'\) \{/);
  assert.match(source, /await removePathWithRetry\(lockDir\);/);
  assert.match(source, /if \(error\?\.code === 'ENOENT' \|\| error\?\.code === 'ENOTEMPTY'\) return;/);
  assert.match(source, /export async function removePathWithRetry/);
  assert.match(source, /maxRetries: 2/);
  assert.match(source, /error\?\.code === 'ENOTEMPTY' \|\| error\?\.code === 'EBUSY' \|\| error\?\.code === 'EPERM'/);
  assert.match(source, /const DUPLICATE_ARTIFACT_PATTERN = \/ \\d\+\(\?=\(.+\)\)\//);
  assert.match(source, /DUPLICATE_ARTIFACT_PATTERN\.test\(entry\.name\)/);
});
