import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveDeskLearningState,
  deriveDeskQueue,
  deriveDeskResolvedOutcomeItems,
  hasDeskQueue,
} from '../lib/shared/desk-derive';
import type { LearningTarget, LearningTargetAction } from '../lib/learning-targets';
import type { LearningTargetState } from '../lib/learning-target-state';
import type {
  CompletedWorkSession,
  WorkSession,
  WorkSessionOutcome,
  WorkSessionResolutionKind,
} from '../lib/work-session';

function makeTarget(overrides: Partial<LearningTarget> = {}): LearningTarget {
  return {
    id: 'target:a',
    kind: 'panel',
    title: 'Target',
    preview: 'Preview',
    touchedAt: 100,
    action: 'refresh' as LearningTargetAction,
    priority: 10,
    priorityReasons: ['test'],
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

function makeOutcome(target: LearningTarget, handledAt: number, handledForChangeToken = target.changeToken): WorkSessionOutcome {
  return {
    handledAt,
    targetId: target.id,
    kind: target.kind,
    handledForTouchedAt: target.touchedAt,
    handledForChangeToken,
    revisionCount: target.revisionCount,
    openTensionCount: target.openTensionCount,
    statusKey: target.statusKey,
    resolvedLabel: 'handled',
    resolutionKind: 'handled' satisfies WorkSessionResolutionKind,
    targetSnapshot: target,
  };
}

test('deriveDeskLearningState returns visible and work targets plus resolved session', () => {
  const focusTarget = makeTarget({
    id: 'target:focus',
    docId: 'doc:focus',
    changeToken: 'panel:focus:2',
    action: 'refresh',
    priority: 15,
  });
  const captureTarget = makeTarget({
    id: 'target:capture',
    docId: 'doc:capture',
    changeToken: 'panel:capture:1',
    action: 'capture',
    priority: 5,
  });

  const session: WorkSession = {
    startedAt: 1,
    targetIds: [focusTarget.id],
    outcomes: [],
    plannedResolutions: {},
  };

  const state = deriveDeskLearningState({
    baseTargets: [captureTarget, focusTarget],
    learningTargetState: {} satisfies LearningTargetState,
    lastCompletedSession: null,
    session,
  });

  assert.deepEqual(state.rawTargets.map((target) => target.id), [captureTarget.id, focusTarget.id]);
  assert.deepEqual(state.visibleTargets.map((target) => target.id), [focusTarget.id, captureTarget.id]);
  assert.deepEqual(state.workTargets.map((target) => target.id), [focusTarget.id]);
  assert.equal(state.resolvedSession.currentTarget?.id, focusTarget.id);
});

test('deriveDeskQueue honors excluded ids and hasDeskQueue reflects bucket presence', () => {
  const pinnedTarget = makeTarget({ id: 'target:pinned', docId: 'doc:pinned' });
  const hiddenTarget = makeTarget({ id: 'target:hidden', docId: 'doc:hidden' });
  const learningTargetState: LearningTargetState = {
    [pinnedTarget.id]: { pinnedAt: 1 },
    [hiddenTarget.id]: {
      hiddenOnDay: '2026-04-18',
      hiddenForTouchedAt: hiddenTarget.touchedAt,
    },
  };

  const queue = deriveDeskQueue({
    rawTargets: [pinnedTarget, hiddenTarget],
    learningTargetState,
    excludeIds: new Set([pinnedTarget.id]),
  });

  assert.equal(hasDeskQueue(queue), true);
  assert.deepEqual(queue.pinned, []);
  assert.deepEqual(queue.hiddenToday.map((item) => item.target.id), [hiddenTarget.id]);
});

test('deriveDeskResolvedOutcomeItems limits the newest outcomes', () => {
  const first = makeTarget({ id: 'target:first', docId: 'doc:first' });
  const second = makeTarget({ id: 'target:second', docId: 'doc:second' });

  const completed: CompletedWorkSession = {
    startedAt: 1,
    endedAt: 2,
    recap: 'done',
    outcomes: [
      makeOutcome(first, 10, 'panel:first:old'),
      makeOutcome(second, 20, 'panel:second:old'),
    ],
  };

  const items = deriveDeskResolvedOutcomeItems(completed, 1);

  assert.deepEqual(items.map((item) => item.targetId), [second.id]);
});
