import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('root layout mounts rehearsal and examiner overlays directly', () => {
  const layoutSource = fs.readFileSync(path.join(repoRoot, 'app/layout.tsx'), 'utf8');

  assert.match(layoutSource, /import \{ RehearsalOverlay \} from '\.\.\/components\/RehearsalOverlay';/);
  assert.match(layoutSource, /import \{ ExaminerOverlay \} from '\.\.\/components\/ExaminerOverlay';/);
  assert.match(layoutSource, /<RehearsalOverlay \/>/);
  assert.match(layoutSource, /<ExaminerOverlay \/>/);
});

test('page-scoped chrome no longer owns rehearsal and examiner overlay mounts', () => {
  const chromeSource = fs.readFileSync(path.join(repoRoot, 'components/PageScopedChrome.tsx'), 'utf8');

  assert.doesNotMatch(chromeSource, /import \{ RehearsalOverlay \} from '\.\/RehearsalOverlay';/);
  assert.doesNotMatch(chromeSource, /import \{ ExaminerOverlay \} from '\.\/ExaminerOverlay';/);
  assert.doesNotMatch(chromeSource, /<RehearsalOverlay \/>/);
  assert.doesNotMatch(chromeSource, /<ExaminerOverlay \/>/);
});
