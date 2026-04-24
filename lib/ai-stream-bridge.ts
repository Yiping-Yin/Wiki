/**
 * Swift-bridge-only streaming client. Phase 3 / 5 of architecture
 * inversion — the HTTP SSE fallback at `/api/chat` was deleted along
 * with its non-streaming siblings. This module now only talks to
 * `AIStreamBridgeHandler` via `window.webkit.messageHandlers.loomAIStream`
 * with per-stream callbacks on `window.__loomAI`.
 */

type StreamCallbacks = {
  onChunk: (delta: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

type StreamBridge = { postMessage: (payload: unknown) => void };

type AIWindow = Window & {
  webkit?: {
    messageHandlers?: {
      loomAIStream?: StreamBridge;
    };
  };
  __loomAI?: {
    onChunk: (id: string, text: string) => void;
    onDone: (id: string) => void;
    onError: (id: string, message: string) => void;
  };
};

const streams = new Map<string, StreamCallbacks>();

function ensureInstalled() {
  if (typeof window === 'undefined') return;
  const w = window as AIWindow;
  if (w.__loomAI) return;
  w.__loomAI = {
    onChunk(id, text) {
      streams.get(id)?.onChunk(text);
    },
    onDone(id) {
      streams.get(id)?.onDone();
      streams.delete(id);
    },
    onError(id, message) {
      streams.get(id)?.onError(message);
      streams.delete(id);
    },
  };
}

function getStreamBridge(): StreamBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as AIWindow;
  return w.webkit?.messageHandlers?.loomAIStream ?? null;
}

export function isSwiftStreamBridgeAvailable(): boolean {
  return Boolean(getStreamBridge());
}

export type AskAIStreamOptions = {
  onDelta: (delta: string, full: string) => void;
  onNotice?: (notice: string) => void;
  signal?: AbortSignal;
  model?: string;
  maxTokens?: number;
};

/**
 * Send a prompt and stream the response. Requires the Swift bridge
 * (i.e. running inside the Loom Mac app). Rejects immediately if the
 * bridge is missing.
 */
export function askAIStream(
  prompt: string,
  options: AskAIStreamOptions,
): Promise<string> {
  const bridge = getStreamBridge();
  if (!bridge) {
    return Promise.reject(
      new Error('AI stream bridge unavailable — open this in the Loom Mac app.'),
    );
  }
  ensureInstalled();
  return new Promise<string>((resolve, reject) => {
    const streamId = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    let accumulated = '';
    const finish = (fn: () => void) => {
      streams.delete(streamId);
      fn();
    };
    streams.set(streamId, {
      onChunk(delta) {
        accumulated += delta;
        try { options.onDelta(delta, accumulated); } catch {}
      },
      onDone() {
        finish(() => resolve(accumulated));
      },
      onError(message) {
        finish(() => reject(new Error(message)));
      },
    });

    if (options.signal) {
      if (options.signal.aborted) {
        finish(() => reject(new Error('aborted')));
        return;
      }
      options.signal.addEventListener('abort', () => {
        bridge.postMessage({ streamId, cancel: true });
        finish(() => reject(new Error('aborted')));
      }, { once: true });
    }

    try {
      bridge.postMessage({
        streamId,
        prompt,
        model: options.model,
        maxTokens: options.maxTokens,
      });
    } catch (err) {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    }
  });
}
