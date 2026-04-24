import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mirrorStoreModuleUrl = pathToFileURL(path.join(repoRoot, 'lib/loom-mirror-store.ts')).href;

type StorageStub = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type MirrorWindow = EventTarget & {
  __loomNativeStore?: Record<string, unknown>;
  localStorage: StorageStub;
};

function installWindow(initialStorage: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialStorage));
  const win = new EventTarget() as MirrorWindow;
  win.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
  Object.assign(globalThis, { window: win });
  return { win, store };
}

function removeWindow() {
  delete (globalThis as { window?: unknown }).window;
}

test('readLoomMirror prefers native-injected state over localStorage', async () => {
  const { readLoomMirror } = await import(mirrorStoreModuleUrl);
  const { win } = installWindow({
    'loom.pursuits.v1': JSON.stringify([{ id: 'legacy', question: 'Legacy' }]),
  });
  win.__loomNativeStore = {
    'loom.pursuits.v1': [{ id: 'native', question: 'Native' }],
  };

  const value = readLoomMirror(
    'loom.pursuits.v1',
    (raw: unknown) => raw as Array<{ id: string; question: string }>,
    [],
  );

  assert.deepEqual(value, [{ id: 'native', question: 'Native' }]);
  removeWindow();
});

test('readLoomMirror falls back to localStorage in plain-browser mode', async () => {
  const { readLoomMirror } = await import(mirrorStoreModuleUrl);
  installWindow({
    'loom.panels.v1': JSON.stringify([{ id: 'panel:1', title: 'Panel' }]),
  });

  const value = readLoomMirror(
    'loom.panels.v1',
    (raw: unknown) => raw as Array<{ id: string; title: string }>,
    [],
  );

  assert.deepEqual(value, [{ id: 'panel:1', title: 'Panel' }]);
  removeWindow();
});

test('readLoomMirror ignores stale localStorage when native mode is active but native data is absent', async () => {
  const { readLoomMirror } = await import(mirrorStoreModuleUrl);
  const { win } = installWindow({
    'loom.panels.v1': JSON.stringify([{ id: 'stale', title: 'Stale panel' }]),
  });
  Object.assign(win, {
    webkit: { messageHandlers: { loomNavigate: { postMessage() {} } } },
  });

  const value = readLoomMirror(
    'loom.panels.v1',
    (raw: unknown) => raw as Array<{ id: string; title: string }>,
    [],
  );

  assert.deepEqual(value, []);
  removeWindow();
});

test('readLoomMirror treats non-enumerable WebKit handlers as native mode', async () => {
  const { readLoomMirror } = await import(mirrorStoreModuleUrl);
  const { win } = installWindow({
    'loom.panels.v1': JSON.stringify([{ id: 'stale', title: 'Stale panel' }]),
  });
  const messageHandlers = {};
  Object.defineProperty(messageHandlers, 'loomNavigate', {
    value: { postMessage() {} },
    enumerable: false,
    configurable: true,
  });
  Object.assign(win, {
    webkit: { messageHandlers },
  });

  const value = readLoomMirror(
    'loom.panels.v1',
    (raw: unknown) => raw as Array<{ id: string; title: string }>,
    [],
  );

  assert.deepEqual(value, []);
  removeWindow();
});

test('subscribeLoomMirror listens to the custom event and matching storage updates', async () => {
  const { subscribeLoomMirror } = await import(mirrorStoreModuleUrl);
  const { win } = installWindow();
  let refreshes = 0;
  const dispose = subscribeLoomMirror('loom.soan.v1', 'loom-soan-updated', () => {
    refreshes += 1;
  });
  const matchingStorageEvent = Object.assign(new Event('storage'), {
    key: 'loom.soan.v1',
  });
  const otherStorageEvent = Object.assign(new Event('storage'), {
    key: 'other',
  });

  win.dispatchEvent(new Event('loom-soan-updated'));
  win.dispatchEvent(matchingStorageEvent);
  win.dispatchEvent(otherStorageEvent);

  dispose();
  win.dispatchEvent(new Event('loom-soan-updated'));

  assert.equal(refreshes, 2);
  removeWindow();
});

test('subscribeLoomMirror ignores storage events in native mode', async () => {
  const { subscribeLoomMirror } = await import(mirrorStoreModuleUrl);
  const { win } = installWindow();
  Object.assign(win, {
    webkit: { messageHandlers: { loomNavigate: { postMessage() {} } } },
  });

  let refreshes = 0;
  const dispose = subscribeLoomMirror('loom.soan.v1', 'loom-soan-updated', () => {
    refreshes += 1;
  });

  const matchingStorageEvent = Object.assign(new Event('storage'), {
    key: 'loom.soan.v1',
  });

  win.dispatchEvent(matchingStorageEvent);
  win.dispatchEvent(new Event('loom-soan-updated'));

  dispose();
  assert.equal(refreshes, 1);
  removeWindow();
});
