import assert from 'node:assert/strict';
import test from 'node:test';

import { readSseToString } from '../lib/ai/sse-reader';
import { runAiText } from '../lib/ai/runtime';

function makeSseStream(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

test('runAiText surfaces SSE notice payloads without interrupting deltas', async () => {
  const originalFetch = global.fetch;
  const notices: string[] = [];
  const deltas: string[] = [];

  global.fetch = (async () => new Response(makeSseStream([
    `data: ${JSON.stringify({ notice: 'Codex CLI unavailable. Loom used Claude CLI for this request.' })}\n\n`,
    `data: ${JSON.stringify({ delta: 'Hello' })}\n\n`,
    'data: [DONE]\n\n',
  ]))) as typeof fetch;

  try {
    const result = await runAiText({
      stage: 'free-recompile',
      messages: [{ role: 'user', content: 'hi' }],
      cli: 'codex',
      onDelta: (delta) => deltas.push(delta),
      onNotice: (notice) => notices.push(notice),
    });

    assert.equal(result, 'Hello');
    assert.deepEqual(deltas, ['Hello']);
    assert.deepEqual(notices, ['Codex CLI unavailable. Loom used Claude CLI for this request.']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('readSseToString preserves notice callbacks while accumulating streamed text', async () => {
  const notices: string[] = [];
  const deltas: string[] = [];

  const result = await readSseToString(makeSseStream([
    `data: ${JSON.stringify({ notice: 'Fallback notice' })}\n\n`,
    `data: ${JSON.stringify({ delta: 'Hel' })}\n\n`,
    `data: ${JSON.stringify({ delta: 'lo' })}\n\n`,
    'data: [DONE]\n\n',
  ]), undefined, {
    onDelta: (delta) => deltas.push(delta),
    onNotice: (notice) => notices.push(notice),
  });

  assert.equal(result, 'Hello');
  assert.deepEqual(deltas, ['Hel', 'lo']);
  assert.deepEqual(notices, ['Fallback notice']);
});
