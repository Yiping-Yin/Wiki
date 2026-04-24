'use client';

export const SETTINGS_PANEL_OPEN_EVENT = 'loom:settings:open';

type NavigateBridge = { postMessage: (payload: unknown) => void };

function nativeNavigateBridge(): NavigateBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    webkit?: { messageHandlers?: { loomNavigate?: NavigateBridge } };
  };
  return w.webkit?.messageHandlers?.loomNavigate ?? null;
}

/**
 * Open the Settings pane. Phase 4 of architecture inversion: prefer the
 * native SwiftUI `Settings` scene when the Loom app shell is present,
 * fall back to the retired-but-still-registered web event for dev-server
 * compatibility.
 *
 * The retired web `SettingsPanel` no longer mounts at the root, so the
 * fallback event is a no-op in-app. Keeping the dispatch means any webview
 * that mounts `SettingsPanel` directly (e.g. a component story / test)
 * still gets the event.
 */
export function openSettingsPanel() {
  if (typeof window === 'undefined') return;
  const bridge = nativeNavigateBridge();
  if (bridge) {
    try {
      bridge.postMessage({ action: 'openSettings' });
      return;
    } catch {}
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_PANEL_OPEN_EVENT));
}
