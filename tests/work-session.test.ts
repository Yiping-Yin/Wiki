import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveWorkSession,
  type WorkSession,
  type WorkSessionOutcome,
  type WorkSessionResolutionKind,
} from '../lib/work-session';
import type { LearningTarget } from '../lib/learning-targets';

function makeTarget(overrides: Partial<LearningTarget> = {}): LearningTarget {
  return {
    id: 'target:a',
    kind: 'panel',
    title: 'Target',
    preview: 'Preview',
    touchedAt: 100,
    action: 'refresh',
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

test('resolveWorkSession does not treat filtered targets as completed', () => {
  const handledTarget = makeTarget({ id: 'target:handled', docId: 'doc:handled', changeToken: 'panel:handled:1' });
  const hiddenPendingTarget = makeTarget({ id: 'target:hidden', docId: 'doc:hidden', changeToken: 'panel:hidden:1' });

  const session: WorkSession = {
    startedAt: 1,
    targetIds: [handledTarget.id, hiddenPendingTarget.id],
    outcomes: [makeOutcome(handledTarget, 10)],
    plannedResolutions: {},
  };

  const resolved = resolveWorkSession(session, []);

  assert.equal(resolved.active, true);
  assert.equal(resolved.finished, false);
  assert.equal(resolved.totalCount, 2);
  assert.equal(resolved.completedCount, 1);
  assert.equal(resolved.currentTarget, null);
  assert.equal(resolved.nextTarget, null);
  assert.deepEqual(resolved.remainingTargets, []);
});

test('resolveWorkSession advances to the next visible pending target', () => {
  const handledTarget = makeTarget({ id: 'target:handled', docId: 'doc:handled', changeToken: 'panel:handled:1' });
  const hiddenPendingTarget = makeTarget({ id: 'target:hidden', docId: 'doc:hidden', changeToken: 'panel:hidden:1' });
  const visiblePendingTarget = makeTarget({ id: 'target:visible', docId: 'doc:visible', changeToken: 'panel:visible:1' });

  const session: WorkSession = {
    startedAt: 1,
    targetIds: [handledTarget.id, hiddenPendingTarget.id, visiblePendingTarget.id],
    outcomes: [makeOutcome(handledTarget, 10)],
    plannedResolutions: {},
  };

  const resolved = resolveWorkSession(session, [visiblePendingTarget]);

  assert.equal(resolved.finished, false);
  assert.equal(resolved.completedCount, 1);
  assert.equal(resolved.currentTarget?.id, visiblePendingTarget.id);
  assert.equal(resolved.nextTarget, null);
  assert.deepEqual(resolved.remainingTargets.map((target) => target.id), [visiblePendingTarget.id]);
});
