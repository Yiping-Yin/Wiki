import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRevisionActionSeed } from '../lib/panel/revision-actions';
import { panelTraceSignature } from '../lib/panel/sync-signatures';
import { createPendingSyncQueue } from '../lib/sync/pending-queue';
import {
  isThoughtPositionCrystallized,
  thoughtPositionKey,
} from '../lib/thought-containers';
import { buildWeavePreview } from '../lib/weave/preview';

test('buildRevisionActionSeed highlights newly added tensions', () => {
  const seed = buildRevisionActionSeed({
    revisions: [
      {
        at: 2,
        summary: 'New summary',
        centralClaim: 'New claim',
        keyDistinctions: ['New distinction'],
        openTensions: ['New tension'],
      },
      {
        at: 1,
        summary: 'Old summary',
        centralClaim: 'Old claim',
        keyDistinctions: [],
        openTensions: [],
      },
    ],
  } as any);

  assert.ok(seed);
  assert.match(seed!.seedDraft, /New tension/);
  assert.equal(seed!.seedLabel, 'Work the changed tension');
});

test('panelTraceSignature is stable regardless of trace order', () => {
  const a = [
    { id: 't2', kind: 'reading', parentId: null, source: { docId: 'doc:b' }, updatedAt: 2, events: [], crystallizedAt: 0 },
    { id: 't1', kind: 'reading', parentId: null, source: { docId: 'doc:a' }, updatedAt: 1, events: [{ kind: 'visit' }], crystallizedAt: 0 },
  ] as any;
  const b = [...a].reverse();

  assert.equal(panelTraceSignature(a), panelTraceSignature(b));
});

test('createPendingSyncQueue round-trips full and partial payloads', () => {
  class MemoryStorage {
    private data = new Map<string, string>();
    getItem(key: string) { return this.data.has(key) ? this.data.get(key)! : null; }
    setItem(key: string, value: string) { this.data.set(key, value); }
    removeItem(key: string) { this.data.delete(key); }
  }

  Object.assign(globalThis, {
    window: { localStorage: new MemoryStorage() },
  });

  const queue = createPendingSyncQueue('loom:test-sync');
  queue.save(['doc:a', 'doc:a', 'doc:b']);
  assert.deepEqual(queue.load(), ['doc:a', 'doc:b']);

  queue.save(null);
  assert.equal(queue.load(), null);

  queue.clear();
  assert.equal(queue.load(), undefined);
});

test('buildWeavePreview carries contract fields into directed previews', () => {
  const panels = [
    { docId: 'doc:a', title: 'A' },
    { docId: 'doc:b', title: 'B' },
  ];

  const preview = buildWeavePreview(panels as any, [{
    id: 'weave:a',
    fromPanelId: 'doc:a',
    toPanelId: 'doc:b',
    status: 'confirmed',
    kind: 'references',
    evidence: [{ snippet: 'A -> B', at: 1 }],
    claim: 'A points to B',
    whyItHolds: 'Evidence says so',
    openTensions: [],
    contractSource: 'confirmed',
    contractUpdatedAt: 10,
    revisions: [{ at: 10, claim: 'A points to B', whyItHolds: 'Evidence says so', openTensions: [] }],
    updatedAt: 10,
  }] as any);

  const outgoing = preview.get('doc:a')?.outgoing[0];
  assert.ok(outgoing);
  assert.equal(outgoing?.claim, 'A points to B');
  assert.equal(outgoing?.contractSource, 'confirmed');
  assert.equal(outgoing?.contractUpdatedAt, 10);
});

test('isThoughtPositionCrystallized matches crystallize events by thought container key', () => {
  const position = {
    anchorId: 'anchor:1',
    anchorBlockId: 'block:1',
    anchorBlockText: 'hello world',
    anchorCharStart: 0,
    anchorCharEnd: 5,
    target: 'doc:a',
  };

  const events = [
    {
      kind: 'thought-anchor',
      anchorId: 'anchor:1',
      anchorBlockId: 'block:1',
      anchorBlockText: 'hello world',
      anchorCharStart: 0,
      anchorCharEnd: 5,
    },
    {
      kind: 'crystallize',
      anchorId: 'anchor:1',
    },
  ] as any;

  assert.equal(isThoughtPositionCrystallized(events, position), true);
  assert.equal(
    thoughtPositionKey(position),
    thoughtPositionKey({
      ...position,
      anchorId: 'anchor:1',
    }),
  );
});
