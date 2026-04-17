import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('HomeClient uses the shared quiet intro and removes the side status panel', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'app/HomeClient.tsx'), 'utf8');

  assert.match(source, /\bQuietScene\b/);
  assert.match(source, /QuietSceneIntro/);
  assert.doesNotMatch(source, /DeskStatusCard/);
  assert.doesNotMatch(source, /gridTemplateColumns[\s\S]*compact\s*\?/);
});

test('quiet scene supports a home tone and dedicated workbench width classes', () => {
  const quietSceneSource = fs.readFileSync(path.join(repoRoot, 'components/QuietScene.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

  assert.match(quietSceneSource, /\bQuietSceneTone\b[\s\S]*['"]home['"]/);
  assert.match(css, /--home-workbench-width/);
  assert.match(css, /\.loom-home-workbench__column\b/);
  assert.match(css, /\.loom-home-support-stack\b/);
});
