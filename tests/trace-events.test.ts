import assert from 'node:assert/strict';
import test from 'node:test';

class FakeWindow extends EventTarget {}

const fakeWindow = new FakeWindow();

Object.assign(globalThis, {
  window: fakeWindow,
  BroadcastChannel: undefined,
});

let TRACE_CHANGE_EVENT: typeof import('../lib/trace/events').TRACE_CHANGE_EVENT;
let emitTraceChange: typeof import('../lib/trace/events').emitTraceChange;

test.before(async () => {
  const eventsModule = await import('../lib/trace/events');
  TRACE_CHANGE_EVENT = eventsModule.TRACE_CHANGE_EVENT;
  emitTraceChange = eventsModule.emitTraceChange;
});

test('emitTraceChange dispatches a same-tab trace change event', () => {
  let detail: unknown = null;

  fakeWindow.addEventListener(TRACE_CHANGE_EVENT, (event) => {
    detail = (event as CustomEvent).detail;
  }, { once: true });

  emitTraceChange({
    docIds: ['doc:rope'],
    traceIds: ['trace:1'],
    reason: 'append-event',
  });

  assert.deepEqual(detail, {
    docIds: ['doc:rope'],
    traceIds: ['trace:1'],
    reason: 'append-event',
  });
});
