'use client';

export const SETTINGS_PANEL_OPEN_EVENT = 'loom:settings:open';

export function openSettingsPanel() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SETTINGS_PANEL_OPEN_EVENT));
}
