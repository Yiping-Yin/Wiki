import assert from 'node:assert/strict';
import test from 'node:test';

import { isNativeMode } from '../lib/is-native-mode';

const globalAny = globalThis as unknown as { window?: unknown };

function withWindow(value: unknown, body: () => void) {
  const prev = globalAny.window;
  globalAny.window = value;
  try {
    body();
  } finally {
    if (prev === undefined) delete globalAny.window;
    else globalAny.window = prev;
  }
}

test('isNativeMode returns false when there is no window (SSR)', () => {
  withWindow(undefined, () => {
    assert.equal(isNativeMode(), false);
  });
});

test('isNativeMode returns false in a plain browser (no webkit)', () => {
  withWindow({ location: { protocol: 'https:' } }, () => {
    assert.equal(isNativeMode(), false);
  });
});

test('isNativeMode returns false when webkit has no messageHandlers', () => {
  withWindow({ location: { protocol: 'https:' }, webkit: {} }, () => {
    assert.equal(isNativeMode(), false);
  });
});

test('isNativeMode returns false when messageHandlers is empty', () => {
  withWindow({ location: { protocol: 'https:' }, webkit: { messageHandlers: {} } }, () => {
    assert.equal(isNativeMode(), false);
  });
});

test('isNativeMode returns true when at least one Loom handler is present', () => {
  withWindow({ location: { protocol: 'https:' }, webkit: { messageHandlers: { loomAI: {} } } }, () => {
    assert.equal(isNativeMode(), true);
  });
});

test('isNativeMode returns true when WebKit exposes non-enumerable handlers', () => {
  const messageHandlers = {};
  Object.defineProperty(messageHandlers, 'loomChooseFolder', {
    value: {},
    enumerable: false,
    configurable: true,
  });

  withWindow({ location: { protocol: 'https:' }, webkit: { messageHandlers } }, () => {
    assert.equal(isNativeMode(), true);
  });
});

test('isNativeMode returns true on loom protocol even if WebKit handlers are not enumerable in page context', () => {
  withWindow({ location: { protocol: 'loom:' }, webkit: {} }, () => {
    assert.equal(isNativeMode(), true);
  });
});
