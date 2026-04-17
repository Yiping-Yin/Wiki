import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeskFocusTargetPresenter } from '../lib/shared/desk-presenters';
import type { LearningTarget } from '../lib/learning-targets';
import type { LearningTargetState } from '../lib/learning-target-state';

function makeTarget(overrides: Partial<LearningTarget> = {}): LearningTarget {
  return {
    id: 'target:a',
    kind: 'panel',
    title: 'Target',
    preview: 'Preview',
    touchedAt: 100,
    action: 'refresh',
    priority: 10,
    priorityReasons: ['Panel has gone cold'],
    href: '/knowledge/example',
    sourceHref: '/knowledge/example',
    docId: 'doc:a',
    reason: 'Needs review',
    changeToken: 'panel:doc:a:100',
    revisionCount: 1,
    openTensionCount: 0,
    statusKey: 'settled',
    ...overrides,
  };
}

test('buildDeskFocusTargetPresenter assembles the shared focus presenter content', () => {
  const target = makeTarget();
  const state: LearningTargetState = {
    [target.id]: {
      doneAt: 1,
      doneForTouchedAt: 50,
    },
  };

  const presenter = buildDeskFocusTargetPresenter({
    target,
    learningTargetState: state,
    meta: 'today · 3 ready',
    eyebrow: 'Current return',
  });

  assert.deepEqual(presenter, {
    eyebrow: 'Current return',
    title: 'Target',
    meta: 'today · 3 ready',
    summary: 'Preview',
    detail: 'Why now · Returned after a new change appeared · Panel has gone cold',
  });
});
