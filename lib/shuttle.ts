'use client';

export const SHUTTLE_OPEN_EVENT = 'loom:shuttle:open';

export function openShuttle() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SHUTTLE_OPEN_EVENT));
}
