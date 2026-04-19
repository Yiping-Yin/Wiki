import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('ChatFocus resets pinned clarification history when a new answer lands', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'components/ChatFocus.tsx'), 'utf8');

  assert.match(source, /resolvePinnedPassAfterTurnChange/);
  assert.match(
    source,
    /setSelectedPassIndex\(\(current\) => resolvePinnedPassAfterTurnChange\(current, previousTurnCountRef\.current, turns\.length\)\)/,
  );
});
