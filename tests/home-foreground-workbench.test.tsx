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

test('home support lists share a single row primitive', () => {
  const helpersSource = fs.readFileSync(path.join(repoRoot, 'components/home/HomeWorkbenchSections.tsx'), 'utf8');

  assert.match(helpersSource, /function HomeSupportRow/);
  assert.match(helpersSource, /<HomeSupportRow[\s\S]*href=\{item\.href\}/);
  assert.match(helpersSource, /<HomeSupportRow[\s\S]*meta=\{item\.resolvedLabel\}/);
  assert.match(helpersSource, /<HomeSupportRow[\s\S]*actionLabel=\{actionLabel\}/);
});

test('home foreground content is assembled before render and passed as one object', () => {
  const homeSource = fs.readFileSync(path.join(repoRoot, 'app/HomeClient.tsx'), 'utf8');
  const helpersSource = fs.readFileSync(path.join(repoRoot, 'components/home/HomeWorkbenchSections.tsx'), 'utf8');
  const modelSource = fs.readFileSync(path.join(repoRoot, 'components/home/homeWorkbenchModel.ts'), 'utf8');
  const actionSource = fs.readFileSync(path.join(repoRoot, 'lib/shared/desk-actions.ts'), 'utf8');

  assert.match(helpersSource, /export type HomeForegroundContent/);
  assert.match(homeSource, /const foreground = useMemo<HomeForegroundContent>\(/);
  assert.match(modelSource, /buildHomeForegroundActions/);
  assert.match(homeSource, /const foregroundActions = useMemo\(/);
  assert.match(actionSource, /assembleDeskFocusTargetActions/);
  assert.match(homeSource, /assembleDeskFocusTargetActions/);
  assert.match(homeSource, /<HomeForegroundObject \{\.\.\.foreground\} \/>/);
  assert.doesNotMatch(homeSource, /<HomeForegroundObject[\s\S]*actions=\{/);
});

test('home support sections share a header primitive', () => {
  const helpersSource = fs.readFileSync(path.join(repoRoot, 'components/home/HomeWorkbenchSections.tsx'), 'utf8');
  const headerMatches = helpersSource.match(/<div className="loom-home-support-section__header">/g) ?? [];

  assert.match(helpersSource, /function HomeSupportHeader/);
  assert.match(helpersSource, /<HomeSupportHeader[\s\S]*eyebrow=\{eyebrow\}/);
  assert.equal(headerMatches.length, 1);
});

test('home client delegates docs loading to a dedicated hook', () => {
  const homeSource = fs.readFileSync(path.join(repoRoot, 'app/HomeClient.tsx'), 'utf8');

  assert.match(homeSource, /useHomeWorkbenchData/);
  assert.doesNotMatch(homeSource, /let indexCache:/);
  assert.doesNotMatch(homeSource, /useState<HomeIndexDoc\[]>/);
  assert.doesNotMatch(homeSource, /const load = async \(\) =>/);
});

test('home and today share the desk derive module', () => {
  const homeSource = fs.readFileSync(path.join(repoRoot, 'app/HomeClient.tsx'), 'utf8');
  const todaySource = fs.readFileSync(path.join(repoRoot, 'app/today/TodayClient.tsx'), 'utf8');
  const deskSource = fs.readFileSync(path.join(repoRoot, 'lib/shared/desk-derive.ts'), 'utf8');

  assert.match(deskSource, /deriveDeskLearningState/);
  assert.match(deskSource, /deriveDeskQueue/);
  assert.match(deskSource, /deriveDeskResolvedOutcomeItems/);
  assert.match(homeSource, /deriveDeskLearningState/);
  assert.match(homeSource, /deriveDeskQueue/);
  assert.match(todaySource, /deriveDeskLearningState/);
  assert.match(todaySource, /deriveDeskQueue/);
});

test('home and today share the desk action assembly helper', () => {
  const homeSource = fs.readFileSync(path.join(repoRoot, 'app/HomeClient.tsx'), 'utf8');
  const todaySource = fs.readFileSync(path.join(repoRoot, 'app/today/TodayClient.tsx'), 'utf8');
  const deskActionsSource = fs.readFileSync(path.join(repoRoot, 'lib/shared/desk-actions.ts'), 'utf8');

  assert.match(deskActionsSource, /assembleDeskFocusTargetActions/);
  assert.match(homeSource, /assembleDeskFocusTargetActions/);
  assert.match(todaySource, /assembleDeskFocusTargetActions/);
});
