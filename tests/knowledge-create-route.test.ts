import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('knowledge create route returns the first document href, not the collection landing page', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'app/api/knowledge/create/route.ts'),
    'utf8',
  );

  assert.match(source, /href:\s*`\/knowledge\/\$\{slug\}\/\$\{slug\}`/);
});
