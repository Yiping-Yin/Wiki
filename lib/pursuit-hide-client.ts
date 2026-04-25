/**
 * Phase 7.2 · Client-side writer for per-pursuit hide / restore.
 *
 * Picks one of two paths depending on runtime — same dual-write idiom
 * as `lib/schema-corrections-client.ts`:
 *   - native mode (loom://): posts via
 *     `window.webkit.messageHandlers.loomPursuitHide` which writes
 *     the sidecar directly in Swift.
 *   - dev / browser: falls back to `POST /api/pursuit-hide`.
 *
 * Both paths converge on the same on-disk sidecar at
 * `knowledge/.cache/pursuit-hide/<slug>.json`, so the resolver reads
 * the same file no matter who wrote it.
 */

import { isNativeMode } from './is-native-mode';

type BridgeResponse = { hiddenPursuitIds: string[] };

type NativeHandler = {
  postMessage: (payload: unknown) => Promise<unknown>;
};

function getBridge(): NativeHandler | null {
  if (typeof window === 'undefined') return null;
  const handlers = (window as unknown as {
    webkit?: { messageHandlers?: Record<string, NativeHandler | undefined> };
  }).webkit?.messageHandlers;
  return handlers?.loomPursuitHide ?? null;
}

async function call(action: 'hide' | 'restore', input: {
  pursuitId: string;
  sourceDocId: string;
}): Promise<string[]> {
  const bridge = isNativeMode() ? getBridge() : null;
  if (bridge) {
    const raw = (await bridge.postMessage({
      action,
      pursuitId: input.pursuitId,
      sourceDocId: input.sourceDocId,
    })) as BridgeResponse | null;
    return Array.isArray(raw?.hiddenPursuitIds) ? raw!.hiddenPursuitIds : [];
  }

  // Dev / browser — hit the Next.js API route.
  const response = await fetch('/api/pursuit-hide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      pursuitId: input.pursuitId,
      sourceDocId: input.sourceDocId,
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `pursuit-hide POST failed: ${response.status}`);
  }
  const body = (await response.json()) as BridgeResponse;
  return Array.isArray(body.hiddenPursuitIds) ? body.hiddenPursuitIds : [];
}

export function hidePursuit(input: {
  pursuitId: string;
  sourceDocId: string;
}): Promise<string[]> {
  return call('hide', input);
}

export function restorePursuit(input: {
  pursuitId: string;
  sourceDocId: string;
}): Promise<string[]> {
  return call('restore', input);
}
