import assert from 'node:assert/strict';
import test from 'node:test';

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
}

class ThrowingStorage {
  getItem() {
    throw new Error('storage unavailable');
  }

  setItem() {
    throw new Error('storage unavailable');
  }

  removeItem() {
    throw new Error('storage unavailable');
  }

  clear() {}
}

const fakeWindow = new FakeWindow();

Object.assign(globalThis, {
  window: fakeWindow,
  localStorage: fakeWindow.localStorage,
});

let AI_CLI_STORAGE_KEY: typeof import('../lib/ai-cli').AI_CLI_STORAGE_KEY;
let AI_CLI_MIGRATION_KEY: typeof import('../lib/ai-cli').AI_CLI_MIGRATION_KEY;
let readAiCliPreference: typeof import('../lib/ai-cli').readAiCliPreference;
let writeAiCliPreference: typeof import('../lib/ai-cli').writeAiCliPreference;

test.before(async () => {
  const aiCli = await import('../lib/ai-cli');
  AI_CLI_STORAGE_KEY = aiCli.AI_CLI_STORAGE_KEY;
  AI_CLI_MIGRATION_KEY = aiCli.AI_CLI_MIGRATION_KEY;
  readAiCliPreference = aiCli.readAiCliPreference;
  writeAiCliPreference = aiCli.writeAiCliPreference;
});

test.beforeEach(() => {
  fakeWindow.localStorage.clear();
  Object.assign(globalThis, {
    window: fakeWindow,
    localStorage: fakeWindow.localStorage,
  });
});

test('readAiCliPreference migrates legacy claude selection to codex once', () => {
  fakeWindow.localStorage.setItem(AI_CLI_STORAGE_KEY, 'claude');

  const cli = readAiCliPreference();

  assert.equal(cli, 'codex');
  assert.equal(fakeWindow.localStorage.getItem(AI_CLI_STORAGE_KEY), 'codex');
  assert.equal(fakeWindow.localStorage.getItem(AI_CLI_MIGRATION_KEY), '1');
});

test('readAiCliPreference defaults to codex when storage is unavailable', () => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { localStorage?: unknown }).localStorage;

  assert.equal(readAiCliPreference(), 'codex');
});

test('readAiCliPreference normalizes malformed stored values to codex', () => {
  fakeWindow.localStorage.setItem(AI_CLI_STORAGE_KEY, 'banana');

  assert.equal(readAiCliPreference(), 'codex');
});

test('writeAiCliPreference marks migration complete when switching runtimes', () => {
  fakeWindow.localStorage.setItem(AI_CLI_STORAGE_KEY, 'claude');
  readAiCliPreference();
  fakeWindow.localStorage.removeItem(AI_CLI_MIGRATION_KEY);

  writeAiCliPreference('claude');

  assert.equal(fakeWindow.localStorage.getItem(AI_CLI_MIGRATION_KEY), '1');
});

test('writeAiCliPreference dispatches the runtime change event', () => {
  let detail: { cli: string } | null = null;
  window.addEventListener('loom:ai-cli-change', (event) => {
    detail = (event as CustomEvent<{ cli: string }>).detail;
  }, { once: true });

  writeAiCliPreference('codex');

  assert.deepEqual(detail, { cli: 'codex' });
});

test('writeAiCliPreference still allows switching back to claude after migration', () => {
  fakeWindow.localStorage.setItem(AI_CLI_STORAGE_KEY, 'claude');
  readAiCliPreference();

  writeAiCliPreference('claude');

  assert.equal(readAiCliPreference(), 'claude');
});
