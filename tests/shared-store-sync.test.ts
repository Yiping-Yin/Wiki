import assert from 'node:assert/strict';
import test from 'node:test';

import type { LearningTarget } from '../lib/learning-targets';

class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

class FakeWindow extends EventTarget {
  localStorage = new MemoryStorage();
  sessionStorage = new MemoryStorage();
}

const fakeWindow = new FakeWindow();

Object.assign(globalThis, {
  window: fakeWindow,
  localStorage: fakeWindow.localStorage,
  sessionStorage: fakeWindow.sessionStorage,
  BroadcastChannel: undefined,
});

let learningTargetStateStore: typeof import('../lib/learning-target-state').learningTargetStateStore;
let resolveLearningTargetState: typeof import('../lib/learning-target-state').resolveLearningTargetState;
let workSessionStore: typeof import('../lib/work-session').workSessionStore;

function makeTarget(overrides: Partial<LearningTarget> = {}): LearningTarget {
  const suffix = Math.random().toString(36).slice(2);
  return {
    id: `target:${suffix}`,
    kind: 'panel',
    title: `Target ${suffix}`,
    preview: 'Preview',
    touchedAt: 100,
    action: 'refresh',
    priority: 10,
    priorityReasons: ['test'],
    href: '/knowledge/example',
    sourceHref: '/knowledge/example',
    docId: `doc:${suffix}`,
    reason: 'Needs review',
    changeToken: `panel:${suffix}:100`,
    revisionCount: 1,
    openTensionCount: 0,
    statusKey: 'settled',
    ...overrides,
  };
}

test.before(async () => {
  const learningTargetStateModule = await import('../lib/learning-target-state');
  const workSessionModule = await import('../lib/work-session');

  learningTargetStateStore = learningTargetStateModule.learningTargetStateStore;
  resolveLearningTargetState = learningTargetStateModule.resolveLearningTargetState;
  workSessionStore = workSessionModule.workSessionStore;
});

test.beforeEach(() => {
  fakeWindow.localStorage.clear();
  fakeWindow.sessionStorage.clear();
  workSessionStore.clear();
});

test('learningTargetStateStore notifies multiple subscribers in the same tab', () => {
  const target = makeTarget();
  let subscriberACalls = 0;
  let subscriberBCalls = 0;

  const unsubscribeA = learningTargetStateStore.subscribe(() => {
    subscriberACalls += 1;
  });
  const unsubscribeB = learningTargetStateStore.subscribe(() => {
    subscriberBCalls += 1;
  });

  learningTargetStateStore.markDone(target);

  const resolved = resolveLearningTargetState(target, learningTargetStateStore.getSnapshot());
  assert.equal(resolved.visible, false);
  assert.equal(resolved.bucket, 'done');
  assert.equal(subscriberACalls, 1);
  assert.equal(subscriberBCalls, 1);

  unsubscribeA();
  unsubscribeB();
});

test('workSessionStore notifies multiple subscribers and keeps one shared session snapshot', () => {
  const first = makeTarget({ id: 'target:first', docId: 'doc:first', changeToken: 'panel:first:1' });
  const second = makeTarget({ id: 'target:second', docId: 'doc:second', changeToken: 'panel:second:1' });
  let subscriberACalls = 0;
  let subscriberBCalls = 0;

  const unsubscribeA = workSessionStore.subscribe(() => {
    subscriberACalls += 1;
  });
  const unsubscribeB = workSessionStore.subscribe(() => {
    subscriberBCalls += 1;
  });

  workSessionStore.start([first, second]);
  workSessionStore.setResolutionKind(first, 'verified');
  workSessionStore.recordOutcome(first);

  const session = workSessionStore.getSessionSnapshot();
  assert.ok(session);
  assert.deepEqual(session?.targetIds, [first.id, second.id]);
  assert.equal(session?.outcomes.length, 1);
  assert.equal(session?.outcomes[0]?.targetId, first.id);
  assert.equal(session?.outcomes[0]?.resolutionKind, 'verified');
  assert.equal(subscriberACalls, 3);
  assert.equal(subscriberBCalls, 3);

  unsubscribeA();
  unsubscribeB();
});
