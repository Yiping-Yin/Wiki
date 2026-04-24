'use client';

export const SHUTTLE_OPEN_EVENT = 'loom:shuttle:open';

type NavigateBridge = { postMessage: (payload: unknown) => void };

function nativeNavigateBridge(): NavigateBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    webkit?: { messageHandlers?: { loomNavigate?: NavigateBridge } };
  };
  return w.webkit?.messageHandlers?.loomNavigate ?? null;
}

/**
 * Trigger the Shuttle palette. Phase 4 of architecture inversion: prefer
 * the native SwiftUI `ShuttleView` window when the Loom app shell is
 * present, fall back to the legacy web QuickSwitcher event for dev-server
 * compatibility.
 */
export function openShuttle() {
  if (typeof window === 'undefined') return;
  const bridge = nativeNavigateBridge();
  if (bridge) {
    try {
      bridge.postMessage({ action: 'openShuttle' });
      return;
    } catch {}
  }
  window.dispatchEvent(new CustomEvent(SHUTTLE_OPEN_EVENT));
}
