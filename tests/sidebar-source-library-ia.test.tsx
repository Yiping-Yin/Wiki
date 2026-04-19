import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('Sidebar consumes the runtime sourceLibraryGroups payload directly', () => {
  const sidebarSource = fs.readFileSync(path.join(repoRoot, 'components/Sidebar.tsx'), 'utf8');
  const hookSource = fs.readFileSync(path.join(repoRoot, 'lib/use-knowledge-nav.ts'), 'utf8');

  assert.match(sidebarSource, /const \{ sourceLibraryGroups \} = useKnowledgeNav\(\);/);
  assert.match(sidebarSource, /<Section title="The Atlas"/);
  assert.match(sidebarSource, /sourceLibraryGroups\.map\(\(group\) => \(/);
  assert.match(sidebarSource, /<SourceLibraryGroupRow\s+key=\{group\.id\}\s+group=\{group\}/s);
  assert.match(sidebarSource, /<Section title="LLM Wiki"/);
  assert.match(sidebarSource, /const categorySignature = group\.categories\.map\(\(category\) => category\.slug\)\.join\('\|'\);/);
  assert.match(sidebarSource, /const defaultExpanded = active \|\| group\.categories\.length <= 3;/);
  assert.match(sidebarSource, /const \[expanded, setExpanded\] = useState\(defaultExpanded\);/);
  assert.match(sidebarSource, /useEffect\(\(\) => \{\s*setExpanded\(defaultExpanded\);\s*\}, \[defaultExpanded, categorySignature\]\)/s);
  assert.doesNotMatch(sidebarSource, /buildSourceLibraryGroups/);
  assert.doesNotMatch(sidebarSource, /knowledgeCategories/);
  assert.doesNotMatch(sidebarSource, /category\.label\.match/);
  assert.doesNotMatch(sidebarSource, /label\.toLowerCase\(\)/);

  assert.match(hookSource, /sourceLibraryGroups:\s*payload\?\.sourceLibraryGroups\s*\?\?\s*\[\]/);
  assert.match(hookSource, /const r = await fetch\('\/api\/knowledge-nav', \{ cache: 'no-store' \}\);/);
  assert.doesNotMatch(hookSource, /buildSourceLibraryGroups/);
  assert.doesNotMatch(hookSource, /category\.label\.match/);
  assert.doesNotMatch(hookSource, /label\.toLowerCase\(\)/);
});

test('QuickSwitcher builds search groups from runtime sourceLibraryGroups', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'components/QuickSwitcher.tsx'), 'utf8');

  assert.match(source, /const \{ sourceLibraryGroups \} = useKnowledgeNav\(\);/);
  assert.match(source, /sourceLibraryGroups\.flatMap\(\(group\) => group\.categories\.map/);
  assert.match(source, /sourceLibraryGroups\.flatMap\(\(group\) => group\.categories\.flatMap/);
  assert.match(source, /renderGroup\('Source Library', grouped\.collections\)/);
  assert.match(source, /renderGroup\('Source Sections', grouped\.sourceSections\)/);
  assert.match(source, /renderGroup\('LLM Wiki', grouped\.wikiDocs\)/);
  assert.doesNotMatch(source, /knowledgeCategories/);
  assert.doesNotMatch(source, /buildSourceLibraryGroups/);
  assert.doesNotMatch(source, /category\.label\.match/);
  assert.doesNotMatch(source, /label\.toLowerCase\(\)/);
});
