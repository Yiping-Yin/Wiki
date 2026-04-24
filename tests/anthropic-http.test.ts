import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AnthropicHttpError,
  __testing,
  isAnthropicConfigured,
  runAnthropicHttp,
} from '../lib/anthropic-http';

const { drainSseEvents, extractDeltaText, extractTextFromMessage, consumeSseStream } = __testing;

test('isAnthropicConfigured reads ANTHROPIC_API_KEY', () => {
  assert.equal(isAnthropicConfigured({}), false);
  assert.equal(isAnthropicConfigured({ ANTHROPIC_API_KEY: '' }), false);
  assert.equal(isAnthropicConfigured({ ANTHROPIC_API_KEY: '   ' }), false);
  assert.equal(isAnthropicConfigured({ ANTHROPIC_API_KEY: 'sk-abc' }), true);
});

test('drainSseEvents splits on blank-line event boundaries', () => {
  const buffer = 'event: a\ndata: {"x":1}\n\ndata: {"y":2}\n\npartial';
  const { events, remaining } = drainSseEvents(buffer);
  assert.deepEqual(events, ['event: a\ndata: {"x":1}', 'data: {"y":2}']);
  assert.equal(remaining, 'partial');
});

test('drainSseEvents returns empty remainder when buffer ends on boundary', () => {
  const { events, remaining } = drainSseEvents('data: a\n\ndata: b\n\n');
  assert.deepEqual(events, ['data: a', 'data: b']);
  assert.equal(remaining, '');
});

test('extractDeltaText returns text for content_block_delta', () => {
  const event = 'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}';
  assert.equal(extractDeltaText(event), 'hi');
});

test('extractDeltaText ignores non-text deltas and other event types', () => {
  assert.equal(extractDeltaText('event: message_start\ndata: {"type":"message_start"}'), null);
  assert.equal(
    extractDeltaText('data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{"}}'),
    null,
  );
  assert.equal(extractDeltaText('data: [DONE]'), null);
  assert.equal(extractDeltaText('data: not-json'), null);
  assert.equal(extractDeltaText(': comment only'), null);
});

test('extractTextFromMessage concatenates text blocks', () => {
  assert.equal(
    extractTextFromMessage({
      content: [
        { type: 'text', text: 'hello ' },
        { type: 'tool_use' },
        { type: 'text', text: 'world' },
      ],
    }),
    'hello world',
  );
  assert.equal(extractTextFromMessage({}), '');
  assert.equal(extractTextFromMessage({ content: [] }), '');
});

test('consumeSseStream surfaces incremental chunks and returns full text', async () => {
  const frames = [
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"al"}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"pha"}}\n\n',
    'event: message_stop\ndata: {"type":"message_stop"}\n\n',
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const frame of frames) controller.enqueue(enc.encode(frame));
      controller.close();
    },
  });

  const chunks: string[] = [];
  const full = await consumeSseStream(stream, (chunk) => chunks.push(chunk));
  assert.deepEqual(chunks, ['al', 'pha']);
  assert.equal(full, 'alpha');
});

test('runAnthropicHttp rejects when key missing', async () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(
      runAnthropicHttp('hi'),
      (err: unknown) => err instanceof AnthropicHttpError && err.status === 0 && err.recoverable === false,
    );
  } finally {
    if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev;
  }
});

test('runAnthropicHttp surfaces 429 as recoverable, 400 as non-recoverable', async () => {
  const originalFetch = globalThis.fetch;
  try {
    (globalThis as any).fetch = async () =>
      new Response('rate limited', { status: 429, headers: { 'content-type': 'text/plain' } });
    await assert.rejects(
      runAnthropicHttp('hi', { apiKey: 'sk-test' }),
      (err: unknown) => err instanceof AnthropicHttpError && err.status === 429 && err.recoverable === true,
    );

    (globalThis as any).fetch = async () =>
      new Response('bad request', { status: 400, headers: { 'content-type': 'text/plain' } });
    await assert.rejects(
      runAnthropicHttp('hi', { apiKey: 'sk-test' }),
      (err: unknown) => err instanceof AnthropicHttpError && err.status === 400 && err.recoverable === false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runAnthropicHttp returns joined text for non-streaming success', async () => {
  const originalFetch = globalThis.fetch;
  try {
    (globalThis as any).fetch = async () =>
      new Response(
        JSON.stringify({
          content: [
            { type: 'text', text: 'one ' },
            { type: 'text', text: 'two' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    const text = await runAnthropicHttp('hi', { apiKey: 'sk-test' });
    assert.equal(text, 'one two');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
