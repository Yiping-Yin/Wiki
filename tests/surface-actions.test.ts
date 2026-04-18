import assert from 'node:assert/strict';
import test from 'node:test';

import { openLoomOverlay, replaceLoomOverlay } from '../lib/ai/surface-actions';

class FakeWindow extends EventTarget {
  private frameQueue: Array<() => void> = [];

  requestAnimationFrame(callback: FrameRequestCallback) {
    this.frameQueue.push(() => callback(0));
    return this.frameQueue.length;
  }

  flushFrame() {
    const callbacks = this.frameQueue.splice(0);
    callbacks.forEach((callback) => callback());
  }
}

const fakeWindow = new FakeWindow();

Object.assign(globalThis, {
  window: fakeWindow,
});

test('openLoomOverlay dispatches open immediately and toggle on the next frame', () => {
  const events: string[] = [];
  const onOpen = (event: Event) => {
    events.push(`open:${(event as CustomEvent).detail.id}`);
  };
  const onToggle = (event: Event) => {
    events.push(`toggle:${(event as CustomEvent).detail.id}`);
  };

  fakeWindow.addEventListener('loom:overlay:open', onOpen);
  fakeWindow.addEventListener('loom:overlay:toggle', onToggle);

  openLoomOverlay({ id: 'examiner' });
  assert.deepEqual(events, ['open:examiner']);

  fakeWindow.flushFrame();
  assert.deepEqual(events, ['open:examiner', 'toggle:examiner']);

  fakeWindow.removeEventListener('loom:overlay:open', onOpen);
  fakeWindow.removeEventListener('loom:overlay:toggle', onToggle);
});

test('replaceLoomOverlay closes the current overlay before opening the next one', () => {
  const events: string[] = [];
  const onOpen = (event: Event) => {
    events.push(`open:${(event as CustomEvent).detail.id}`);
  };
  const onToggle = (event: Event) => {
    events.push(`toggle:${(event as CustomEvent).detail.id}`);
  };

  fakeWindow.addEventListener('loom:overlay:open', onOpen);
  fakeWindow.addEventListener('loom:overlay:toggle', onToggle);

  replaceLoomOverlay({ id: 'examiner' });
  assert.deepEqual(events, ['open:__none__']);

  fakeWindow.flushFrame();
  assert.deepEqual(events, ['open:__none__', 'open:examiner']);

  fakeWindow.flushFrame();
  assert.deepEqual(events, ['open:__none__', 'open:examiner', 'toggle:examiner']);

  fakeWindow.removeEventListener('loom:overlay:open', onOpen);
  fakeWindow.removeEventListener('loom:overlay:toggle', onToggle);
});
