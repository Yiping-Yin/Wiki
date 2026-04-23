/**
 * Direct HTTPS transport to Anthropic's Messages API.
 *
 * App-Store-friendly transport: no subprocess, no bundled binaries. The Swift
 * layer is the primary AI surface (see Loom/Sources/AIProviderSettingsView);
 * this module exists for the Next.js side that still needs server-side
 * Anthropic calls (e.g. cowork routes). Credential source is ANTHROPIC_API_KEY.
 */

const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;
const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type AnthropicRunOptions = {
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  onChunk?: (chunk: string) => void;
  apiKey?: string;
};

export class AnthropicHttpError extends Error {
  readonly status: number;
  readonly recoverable: boolean;
  constructor(message: string, status: number, recoverable: boolean) {
    super(message);
    this.name = 'AnthropicHttpError';
    this.status = status;
    this.recoverable = recoverable;
  }
}

export function isAnthropicConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env.ANTHROPIC_API_KEY?.trim());
}

export async function runAnthropicHttp(
  prompt: string,
  opts: AnthropicRunOptions = {},
): Promise<string> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new AnthropicHttpError(
      'ANTHROPIC_API_KEY not set. Add it in Settings or via env.',
      0,
      false,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: opts.model ?? DEFAULT_MODEL,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        stream: Boolean(opts.onChunk),
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const bodyText = await safeReadText(response);
      throw new AnthropicHttpError(
        `Anthropic API ${response.status}: ${bodyText.slice(0, 400)}`,
        response.status,
        response.status >= 500 || response.status === 429,
      );
    }

    if (opts.onChunk && response.body) {
      return await consumeSseStream(response.body, opts.onChunk);
    }

    const payload = (await response.json()) as AnthropicMessageResponse;
    return extractTextFromMessage(payload);
  } catch (error) {
    if (error instanceof AnthropicHttpError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new AnthropicHttpError(
        `Anthropic API timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
        0,
        true,
      );
    }
    throw new AnthropicHttpError(
      `Anthropic API network error: ${error instanceof Error ? error.message : String(error)}`,
      0,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

type AnthropicMessageResponse = {
  content?: Array<{ type: string; text?: string }>;
};

function extractTextFromMessage(payload: AnthropicMessageResponse): string {
  const blocks = payload.content ?? [];
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text);
    }
  }
  return parts.join('');
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onChunk: (chunk: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { events, remaining } = drainSseEvents(buffer);
      buffer = remaining;
      for (const event of events) {
        const text = extractDeltaText(event);
        if (text) {
          full += text;
          try { onChunk(text); } catch {}
        }
      }
    }
    buffer += decoder.decode();
    const { events } = drainSseEvents(buffer + '\n\n');
    for (const event of events) {
      const text = extractDeltaText(event);
      if (text) {
        full += text;
        try { onChunk(text); } catch {}
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }

  return full;
}

function drainSseEvents(buffer: string): { events: string[]; remaining: string } {
  const events: string[] = [];
  let index = 0;
  while (true) {
    const boundary = buffer.indexOf('\n\n', index);
    if (boundary < 0) break;
    events.push(buffer.slice(index, boundary));
    index = boundary + 2;
  }
  return { events, remaining: buffer.slice(index) };
}

function extractDeltaText(event: string): string | null {
  const dataLine = event
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('data:'));
  if (!dataLine) return null;
  const json = dataLine.slice(5).trim();
  if (!json || json === '[DONE]') return null;
  try {
    const parsed = JSON.parse(json) as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      return parsed.delta.text ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export const __testing = {
  drainSseEvents,
  extractDeltaText,
  extractTextFromMessage,
  consumeSseStream,
};
