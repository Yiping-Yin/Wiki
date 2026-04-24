/**
 * Phase 7.1 · Client-side writer for schema corrections.
 *
 * Picks one of two paths depending on runtime:
 *   - native mode (loom://): posts via
 *     `window.webkit.messageHandlers.loomSchemaCorrections` which
 *     writes the sidecar directly in Swift.
 *   - dev / browser: falls back to `POST /api/schema-corrections`.
 *
 * Both paths converge on the same on-disk sidecar at
 * `knowledge/.cache/schema-corrections/<extractorId>/<slug>.json`,
 * so the resolver reads the same file no matter who wrote it.
 */

import { isNativeMode } from './is-native-mode';
import type { SchemaCorrection } from './loom-schema-records';

type BridgeResponse = { corrections: SchemaCorrection[] };

type NativeHandler = {
  postMessage: (payload: unknown) => Promise<unknown>;
};

function getBridge(): NativeHandler | null {
  if (typeof window === 'undefined') return null;
  const handlers = (window as unknown as {
    webkit?: { messageHandlers?: Record<string, NativeHandler | undefined> };
  }).webkit?.messageHandlers;
  return handlers?.loomSchemaCorrections ?? null;
}

export async function appendSchemaCorrection(input: {
  extractorId: string;
  sourceDocId: string;
  fieldPath: string;
  newValue: string;
  originalValue: string;
}): Promise<SchemaCorrection[]> {
  const bridge = isNativeMode() ? getBridge() : null;
  if (bridge) {
    try {
      const raw = (await bridge.postMessage({
        action: 'append',
        extractorId: input.extractorId,
        sourceDocId: input.sourceDocId,
        fieldPath: input.fieldPath,
        corrected: input.newValue,
        original: input.originalValue,
      })) as BridgeResponse | null;
      return Array.isArray(raw?.corrections) ? raw!.corrections : [];
    } catch (error) {
      // Bridge surfaced a validation error; propagate so the caller
      // can surface it to the user.
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  // Dev / browser — hit the Next.js API route.
  const response = await fetch('/api/schema-corrections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      extractorId: input.extractorId,
      sourceDocId: input.sourceDocId,
      fieldPath: input.fieldPath,
      newValue: input.newValue,
      originalValue: input.originalValue,
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `schema-corrections POST failed: ${response.status}`);
  }
  const body = (await response.json()) as BridgeResponse;
  return Array.isArray(body.corrections) ? body.corrections : [];
}
