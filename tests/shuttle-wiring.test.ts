import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('quick switcher subscribes to the shuttle open event', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'components/QuickSwitcher.tsx'), 'utf8');

  assert.match(source, /import \{ SHUTTLE_OPEN_EVENT \} from '\.\.\/lib\/shuttle';/);
  assert.match(source, /window\.addEventListener\(SHUTTLE_OPEN_EVENT, onOpen\)/);
  assert.match(source, /window\.removeEventListener\(SHUTTLE_OPEN_EVENT, onOpen\)/);
});
