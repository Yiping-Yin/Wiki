import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('chat route marks successful runtimes healthy to reconcile stale timeout probes', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'app/api/chat/route.ts'),
    'utf8',
  );

  assert.match(source, /markLocalRuntimeHealthy/);
  assert.match(source, /if \(result\.runtime === null\)/);
  assert.match(source, /else \{\s*markLocalRuntimeHealthy\(result\.runtime\);/s);
});
