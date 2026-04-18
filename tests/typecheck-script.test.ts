import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

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

  assert.match(source, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(source, /withNextBuildLock\(root, async \(\) => \{/);
  assert.match(source, /removeDuplicateArtifacts\(path\.join\(root, '\.next-build'\)\)/);
});
