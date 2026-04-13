'use client';
/**
 * DocBodyProvider · pipes the current document's full text into a global
 * so the AI surfaces (ChatFocus, Review, note organization) can read it
 * on demand.
 *
 * Mounted by the doc page (`/knowledge/[cat]/[slug]` and any wiki page
 * that wants to expose its body). Sets `window.__loomDocBody` while the
 * page is mounted, clears it on unmount.
 *
 * Why a global instead of React context? The AI surfaces live in
 * `app/layout.tsx` — outside the doc page tree. They cannot read a
 * context that the doc page provides. A simple global is the smallest
 * cross-tree pipe.
 */
import { useEffect } from 'react';

declare global {
  interface Window {
    __loomDocBody?: string;
    __loomDocTitle?: string;
  }
}

export function DocBodyProvider({ body, title }: { body: string; title?: string }) {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__loomDocBody = body;
    if (title) window.__loomDocTitle = title;
    return () => {
      delete window.__loomDocBody;
      delete window.__loomDocTitle;
    };
  }, [body, title]);
  return null;
}

/** Read the current document body, if any. Safe to call from any client. */
export function getCurrentDocBody(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.__loomDocBody;
}
