'use client';
/**
 * Client-side `embed(text)` shim. Phase 5 of architecture inversion —
 * replaces the Ollama-backed `/api/embed` route with Apple's NLEmbedding
 * via the native `loomEmbed` bridge. No key, no external service, no
 * network — ships with macOS.
 *
 * In a plain browser (no Loom shell) the bridge is absent; callers should
 * treat a rejection as "embedding not available" and degrade (e.g. skip
 * ActiveRetrieval rather than block the note save).
 */

type EmbedBridge = {
  postMessage: (payload: unknown) => Promise<{ vector: number[]; dims: number; model: string }>;
};

type EmbedWindow = Window & {
  webkit?: { messageHandlers?: { loomEmbed?: EmbedBridge } };
};

function getBridge(): EmbedBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as EmbedWindow;
  return w.webkit?.messageHandlers?.loomEmbed ?? null;
}

export function isEmbedAvailable(): boolean {
  return Boolean(getBridge());
}

export type EmbedResult = {
  vector: number[];
  dims: number;
  model: string;
};

export async function embed(text: string): Promise<EmbedResult> {
  const bridge = getBridge();
  if (!bridge) {
    throw new Error('Embedding bridge unavailable — open this in the Loom Mac app.');
  }
  const trimmed = text.trim().slice(0, 2000);
  if (trimmed.length < 5) {
    throw new Error('Text too short');
  }
  const result = await bridge.postMessage({ text: trimmed });
  if (!result || !Array.isArray(result.vector) || result.vector.length === 0) {
    throw new Error('Empty embedding');
  }
  return result;
}
