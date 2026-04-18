import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('ChatFocus renders an explicit provider waiting message while no chunks have arrived', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'components/ChatFocus.tsx'), 'utf8');

  assert.match(source, /Waiting on \{waitingProviderLabel\}/);
  assert.match(source, /effectiveCli === 'claude' \? 'Claude CLI' : 'Codex CLI'/);
});
