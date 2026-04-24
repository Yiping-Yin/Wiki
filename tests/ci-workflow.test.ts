import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('CI includes a dedicated macOS app build job', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, '.github', 'workflows', 'ci.yml'),
    'utf8',
  );

  assert.match(source, /macos-app-smoke:/);
  assert.match(source, /runs-on:\s*macos-latest/);
  assert.match(source, /npm run test:contracts/);
  assert.match(source, /brew install xcodegen/);
  assert.match(source, /npm run app:check-project/);
  assert.match(source, /npm run app:user/);
  assert.match(source, /npm run app:smoke/);
  assert.doesNotMatch(source, /CODEX_BIN:\s*\.\/scripts\/fake-codex-cli\.mjs/);
});
