import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const repoRoot = path.resolve(__dirname, '..');

function repoImport(modulePath: string) {
  const absolutePath = path.join(repoRoot, modulePath);
  const href = pathToFileURL(absolutePath).href;
  return import(`${href}?t=${Date.now()}-${Math.random()}`);
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('useKnowledgeNav ignores stale in-flight results after refresh', async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const require = createRequire(__filename);
  const React = require('react') as {
    useState: typeof import('react').useState;
    useEffect: typeof import('react').useEffect;
  };
  const originalUseState = React.useState;
  const originalUseEffect = React.useEffect;
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const pendingResponses: Array<ReturnType<typeof deferred<Response>>> = [];
  let currentState: unknown;

  const windowStub = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const listenersForType = listeners.get(type) ?? new Set<(event: Event) => void>();
      listenersForType.add(typeof listener === 'function' ? listener : listener.handleEvent.bind(listener));
      listeners.set(type, listenersForType);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const listenersForType = listeners.get(type);
      if (!listenersForType) return;
      const callback = typeof listener === 'function' ? listener : listener.handleEvent.bind(listener);
      listenersForType.forEach((registered) => {
        if (registered === callback) listenersForType.delete(registered);
      });
      if (listenersForType.size === 0) listeners.delete(type);
    },
    dispatchEvent(event: Event) {
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  };
  globalThis.window = windowStub as unknown as typeof globalThis.window;

  React.useState = ((initial: unknown) => {
    currentState = initial;
    const setState = (next: unknown) => {
      currentState = next;
    };
    return [currentState, setState];
  }) as typeof React.useState;
  React.useEffect = ((effect: () => void | (() => void)) => {
    effect();
  }) as typeof React.useEffect;

  globalThis.fetch = (async () => {
    const response = deferred<Response>();
    pendingResponses.push(response);
    return response.promise;
  }) as typeof fetch;

  try {
    const nav = await repoImport('lib/use-knowledge-nav.ts');
    nav.invalidateKnowledgeNavCache();

    nav.useKnowledgeNav();
    const refreshPromise = nav.refreshKnowledgeNav();

    assert.equal(pendingResponses.length, 2);

    pendingResponses[1].resolve(
      new Response(
        JSON.stringify({
          knowledgeCategories: [],
          knowledgeTotal: 0,
          sourceLibraryGroups: [{ id: 'fresh', label: 'Fresh', categories: [] }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    const fresh = await refreshPromise;
    await flushMicrotasks();

    assert.equal(fresh.sourceLibraryGroups[0].id, 'fresh');
    assert.equal((currentState as { sourceLibraryGroups: Array<{ id: string }> }).sourceLibraryGroups[0].id, 'fresh');

    pendingResponses[0].resolve(
      new Response(
        JSON.stringify({
          knowledgeCategories: [],
          knowledgeTotal: 0,
          sourceLibraryGroups: [{ id: 'stale', label: 'Stale', categories: [] }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    await flushMicrotasks();

    assert.equal((currentState as { sourceLibraryGroups: Array<{ id: string }> }).sourceLibraryGroups[0].id, 'fresh');
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
    React.useState = originalUseState;
    React.useEffect = originalUseEffect;
    const nav = await repoImport('lib/use-knowledge-nav.ts');
    nav.invalidateKnowledgeNavCache();
  }
});

test('useKnowledgeNav refreshes updated payloads after invalidation', async () => {
  const previousFetch = globalThis.fetch;
  const payloads = [
    {
      knowledgeCategories: [],
      knowledgeTotal: 0,
      sourceLibraryGroups: [{ id: 'alpha', label: 'Alpha', categories: [] }],
    },
    {
      knowledgeCategories: [],
      knowledgeTotal: 0,
      sourceLibraryGroups: [{ id: 'beta', label: 'Beta', categories: [] }],
    },
  ];
  const cacheModes: Array<RequestCache | undefined> = [];
  let callCount = 0;

  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    cacheModes.push(init?.cache);
    const payload = payloads[Math.min(callCount, payloads.length - 1)];
    callCount += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  try {
    const nav = await repoImport('lib/use-knowledge-nav.ts');
    nav.invalidateKnowledgeNavCache();

    const first = await nav.refreshKnowledgeNav();
    const second = await nav.refreshKnowledgeNav();

    assert.equal(callCount, 2);
    assert.deepEqual(cacheModes, ['no-store', 'no-store']);
    assert.equal(first.sourceLibraryGroups[0].id, 'alpha');
    assert.equal(second.sourceLibraryGroups[0].id, 'beta');
  } finally {
    globalThis.fetch = previousFetch;
    const nav = await repoImport('lib/use-knowledge-nav.ts');
    nav.invalidateKnowledgeNavCache();
  }
});

test('useKnowledgeNav preserves the last known nav when refresh fails', async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const require = createRequire(__filename);
  const React = require('react') as {
    useState: typeof import('react').useState;
    useEffect: typeof import('react').useEffect;
  };
  const originalUseState = React.useState;
  const originalUseEffect = React.useEffect;
  const listeners = new Map<string, Set<(event: Event) => void>>();
  let currentState: unknown;
  let refreshDispatches = 0;

  const windowStub = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const listenersForType = listeners.get(type) ?? new Set<(event: Event) => void>();
      listenersForType.add(typeof listener === 'function' ? listener : listener.handleEvent.bind(listener));
      listeners.set(type, listenersForType);
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const listenersForType = listeners.get(type);
      if (!listenersForType) return;
      const callback = typeof listener === 'function' ? listener : listener.handleEvent.bind(listener);
      listenersForType.forEach((registered) => {
        if (registered === callback) listenersForType.delete(registered);
      });
      if (listenersForType.size === 0) listeners.delete(type);
    },
    dispatchEvent(event: Event) {
      if (event.type === 'knowledge-nav:refresh') refreshDispatches += 1;
      listeners.get(event.type)?.forEach((listener) => listener(event));
      return true;
    },
  };
  globalThis.window = windowStub as unknown as typeof globalThis.window;

  React.useState = ((initial: unknown) => {
    currentState = initial;
    const setState = (next: unknown) => {
      currentState = next;
    };
    return [currentState, setState];
  }) as typeof React.useState;
  React.useEffect = ((effect: () => void | (() => void)) => {
    effect();
  }) as typeof React.useEffect;

  const responses = [
    new Response(
      JSON.stringify({
        knowledgeCategories: [],
        knowledgeTotal: 0,
        sourceLibraryGroups: [{ id: 'alpha', label: 'Alpha', categories: [] }],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    ),
    new Response(JSON.stringify({ error: 'transient' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    }),
  ];

  globalThis.fetch = (async () => {
    const response = responses.shift();
    if (!response) {
      throw new Error('Unexpected fetch');
    }
    return response;
  }) as typeof fetch;

  try {
    const nav = await repoImport('lib/use-knowledge-nav.ts');
    nav.invalidateKnowledgeNavCache();

    const seeded = await nav.refreshKnowledgeNav();
    await flushMicrotasks();
    assert.equal(seeded.sourceLibraryGroups[0].id, 'alpha');
    refreshDispatches = 0;

    nav.useKnowledgeNav();

    assert.equal((currentState as { sourceLibraryGroups: Array<{ id: string }> }).sourceLibraryGroups[0].id, 'alpha');

    const refreshed = await nav.refreshKnowledgeNav();
    await flushMicrotasks();

    assert.equal(refreshed.sourceLibraryGroups[0].id, 'alpha');
    assert.equal((currentState as { sourceLibraryGroups: Array<{ id: string }> }).sourceLibraryGroups[0].id, 'alpha');
    assert.equal(refreshDispatches, 0);
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
    React.useState = originalUseState;
    React.useEffect = originalUseEffect;
    const nav = await repoImport('lib/use-knowledge-nav.ts');
    nav.invalidateKnowledgeNavCache();
  }
});

// Sidebar source-level structural tests retired 2026-04-22 — the web
// Sidebar component is now a permanent null shell (see
// components/Sidebar.tsx). `useKnowledgeNav` is still consumed by the
// native SwiftUI sidebar via the knowledge-nav payload, so the three
// hook-level tests above continue to exercise the live contract.
// The retained hook path that used to be asserted against Sidebar.tsx
// (sourceLibraryGroups from the runtime payload, preservation on failure,
// refresh cache semantics) remains covered by those tests.

// QuickSwitcher test retired 2026-04-21 — web Shuttle replaced by native
// SwiftUI ShuttleView which loads .next-export/search-index.json directly
// instead of consuming sourceLibraryGroups from the web nav hook. See
// macos-app/Loom/Sources/ShuttleView.swift.
