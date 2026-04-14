'use client';
/**
 * Shared SSE reader for all AI streaming endpoints.
 * Single source of truth — all components that consume /api/chat SSE
 * must use this instead of inline parsing.
 *
 * Includes a 60-second inactivity timeout: if no data arrives for 60s,
 * the stream is aborted and the accumulated text is returned.
 */

const INACTIVITY_TIMEOUT_MS = 60_000;

/**
 * Read an SSE stream from /api/chat and return the full accumulated text.
 * Throws on network errors. Returns '' if no delta chunks were received.
 */
export async function readSseToString(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = '';
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resetTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      try { reader.cancel(); } catch {}
    }, INACTIVITY_TIMEOUT_MS);
  };

  // Cancel reader if external signal fires
  if (signal) {
    signal.addEventListener('abort', () => {
      if (timer) clearTimeout(timer);
      try { reader.cancel(); } catch {}
    }, { once: true });
  }

  try {
    resetTimer();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetTimer();
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') return result;
          try {
            const obj = JSON.parse(payload);
            if (typeof obj.delta === 'string') result += obj.delta;
            if (typeof obj.error === 'string') throw new Error(obj.error);
          } catch (e) {
            if (e instanceof SyntaxError) continue; // non-JSON line
            throw e;
          }
        }
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
  return result;
}
