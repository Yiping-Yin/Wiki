import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDeskEmptyPresenter,
  buildDeskFocusTargetPresenter,
  buildDeskLearningTargetPresenter,
  buildDeskResolvedOutcomePresenter,
} from '../lib/shared/desk-presenters';
import type { LearningTarget, LearningTargetAction } from '../lib/learning-targets';
import type { LearningTargetState } from '../lib/learning-target-state';
import type { WorkSessionOutcome, WorkSessionResolutionKind } from '../lib/work-session';

function makeTarget(overrides: Partial<LearningTarget> = {}): LearningTarget {
  return {
    id: 'target:a',
    kind: 'panel',
    title: 'Target',
    preview: 'Preview',
    touchedAt: 100,
    action: 'refresh' as LearningTargetAction,
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

function makeOutcome(target: LearningTarget, handledAt: number): WorkSessionOutcome {
  return {
    handledAt,
    targetId: target.id,
    kind: target.kind,
    handledForTouchedAt: target.touchedAt,
    handledForChangeToken: target.changeToken,
    revisionCount: target.revisionCount,
    openTensionCount: target.openTensionCount,
    statusKey: target.statusKey,
    resolvedLabel: 'handled',
    resolutionKind: 'handled' satisfies WorkSessionResolutionKind,
    targetSnapshot: target,
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

test('buildDeskEmptyPresenter assembles shared empty presenter content', () => {
  assert.deepEqual(
    buildDeskEmptyPresenter({
      eyebrow: 'Today',
      title: 'Nothing is asking for attention yet.',
      summary: 'Enter a source from the Sidebar or open the Shuttle.',
      detail: 'Today stays quiet until a source actually changes.',
    }),
    {
      eyebrow: 'Today',
      title: 'Nothing is asking for attention yet.',
      summary: 'Enter a source from the Sidebar or open the Shuttle.',
      detail: 'Today stays quiet until a source actually changes.',
    },
  );
});

test('buildDeskLearningTargetPresenter assembles shared target row content', () => {
  const target = makeTarget({
    action: 'examine',
    priorityReasons: ['Panel is ready to verify'],
  });
  const state: LearningTargetState = {
    [target.id]: {
      pinnedAt: 1,
      doneAt: 2,
      doneForTouchedAt: 50,
    },
  };

  const presenter = buildDeskLearningTargetPresenter({
    target,
    learningTargetState: state,
    isPinned: true,
  });

  assert.deepEqual(presenter, {
    title: 'Target',
    summary: 'Preview',
    whyNow: 'Why now · Panel is ready to verify',
    returnLabel: 'Returned · Returned after a new change appeared',
    primaryActionLabel: 'Ask',
    secondaryActionLabel: 'Open source',
    pinLabel: 'Unpin',
  });
});

test('buildDeskResolvedOutcomePresenter assembles shared resolved outcome content', () => {
  const target = makeTarget({ title: 'RoPE' });
  const presenter = buildDeskResolvedOutcomePresenter(makeOutcome(target, 10));

  assert.deepEqual(presenter, {
    title: 'RoPE',
    meta: 'handled · handled · Resolved for this change',
    actionLabel: 'Reopen',
  });
});
