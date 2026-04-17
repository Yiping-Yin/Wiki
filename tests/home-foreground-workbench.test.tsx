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

test('home workbench keeps the foreground object and queue layer out of generic card wrappers', () => {
  const homeSource = fs.readFileSync(path.join(repoRoot, 'app/HomeClient.tsx'), 'utf8');
  const helpersSource = fs.readFileSync(path.join(repoRoot, 'components/home/HomeWorkbenchSections.tsx'), 'utf8');
  const introSource = fs.readFileSync(path.join(repoRoot, 'components/QuietSceneIntro.tsx'), 'utf8');
  const css = fs.readFileSync(path.join(repoRoot, 'app/globals.css'), 'utf8');

  assert.doesNotMatch(homeSource, /LearningTargetQueueState/);
  assert.match(helpersSource, /HomeQueueStateList/);
  assert.doesNotMatch(helpersSource, /QuietGuideCard/);
  assert.match(introSource, /export type QuietSceneAction/);
  assert.match(helpersSource, /import type \{[^}]*QuietSceneAction[^}]*\} from '\.\.\/QuietSceneIntro'/);
  assert.doesNotMatch(helpersSource, /type HomeAction =/);
  assert.match(css, /\.loom-home-foreground\b/);
  assert.match(css, /\.loom-home-support-row__action\b/);
});
