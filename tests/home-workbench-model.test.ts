import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHomeForegroundActions,
  buildHomeForegroundDraft,
  buildHomeGuideMeta,
  buildHomeRecentThreads,
  parseHomeSearchIndexPayload,
  type HomeIndexDoc,
} from '../components/home/homeWorkbenchModel';

test('parseHomeSearchIndexPayload reads stored fields and document ids', () => {
  const docs = parseHomeSearchIndexPayload({
    index: {
      storedFields: {
        a: { title: 'RoPE', href: '/wiki/rope', category: 'Architecture' },
        b: { title: 'Ignored' },
      },
      documentIds: {
        a: 'doc-rope',
      },
    },
  });

  assert.deepEqual(docs, [
    {
      id: 'doc-rope',
      title: 'RoPE',
      href: '/wiki/rope',
      category: 'Architecture',
    },
  ] satisfies HomeIndexDoc[]);
});

test('buildHomeRecentThreads de-duplicates history and prefers indexed metadata', () => {
  const docsById = new Map<string, HomeIndexDoc>([
    ['rope', { id: 'rope', title: 'RoPE', href: '/wiki/rope', category: 'Architecture' }],
  ]);

  const recent = buildHomeRecentThreads(
    [
      { id: 'rope', title: 'Old Rope', href: '/old-rope', viewedAt: 300 },
      { id: 'rope', title: 'Duplicate Rope', href: '/dupe', viewedAt: 200 },
      { id: 'alibi', title: 'ALiBi', href: '/wiki/alibi', viewedAt: 100 },
    ],
    docsById,
    4,
  );

  assert.deepEqual(recent, [
    { id: 'rope', title: 'RoPE', href: '/wiki/rope', category: 'Architecture' },
    { id: 'alibi', title: 'ALiBi', href: '/wiki/alibi', category: '' },
  ]);
});

test('buildHomeGuideMeta summarizes recent, resolved, and queue counts', () => {
  assert.equal(buildHomeGuideMeta({ recentCount: 0, resolvedCount: 0, queueCount: 0 }), 'Desk is quiet');
  assert.equal(
    buildHomeGuideMeta({ recentCount: 2, resolvedCount: 1, queueCount: 3 }),
    '2 recent threads · 1 resolved · 3 in queue',
  );
});

test('buildHomeForegroundDraft assembles focus and empty states', () => {
  const focused = buildHomeForegroundDraft({
    guideMeta: '2 recent threads · 1 resolved',
    focusTitle: 'RoPE',
    focusSummary: 'Rotary embeddings encode position by rotation.',
    whyNowDetail: 'Why now · Returned after a new change appeared · Panel is ready to verify',
  });

  assert.deepEqual(focused, {
    eyebrow: 'Current return',
    title: 'RoPE',
    meta: '2 recent threads · 1 resolved',
    summary: 'Rotary embeddings encode position by rotation.',
    detail: 'Why now · Returned after a new change appeared · Panel is ready to verify',
  });

  const empty = buildHomeForegroundDraft({
    guideMeta: 'Desk is quiet',
    focusTitle: null,
    focusSummary: null,
    whyNowDetail: null,
  });

  assert.deepEqual(empty, {
    eyebrow: 'Quiet surface',
    title: 'Nothing urgent is asking for attention.',
    meta: 'Desk is quiet',
    summary: 'Open the Shuttle to move anywhere, or enter the Atlas from the Sidebar. Once a source changes, the return appears here.',
    detail: 'The empty state is still a desk: enough structure to begin, without pretending work already exists.',
  });
});

test('buildHomeForegroundActions assembles focused and empty action drafts', () => {
  assert.deepEqual(
    buildHomeForegroundActions({
      hasFocusTarget: true,
      primaryLabel: 'Ask',
      secondaryLabel: 'Open source',
    }),
    [
      { kind: 'focus-primary', label: 'Ask', primary: true },
      { kind: 'focus-secondary', label: 'Open source' },
      { kind: 'open-shuttle', label: 'Open Shuttle' },
    ],
  );

  assert.deepEqual(
    buildHomeForegroundActions({
      hasFocusTarget: false,
      primaryLabel: null,
      secondaryLabel: null,
    }),
    [
      { kind: 'open-shuttle', label: 'Open Shuttle', primary: true },
      { kind: 'open-atlas', label: 'Open Atlas' },
      { kind: 'open-today', label: 'Open Today' },
    ],
  );
});
