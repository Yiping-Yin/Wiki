'use client';
/**
 * Side-effect-only component: on mount, calls `registerLoomInterlace()`
 * (M2) and `registerLoomReview()` (M5), which expose `window.__loomInterlace`
 * and `window.__loomReview` so the Swift ⌘E / ⌘/ bridges can summon both
 * overlays without any React coupling.
 *
 * Mounted once at the root of the app.
 */
import { useEffect } from 'react';

export function InterlaceInstaller() {
  useEffect(() => {
    let cancelled = false;
    void import('../lib/interlace').then((m) => {
      if (cancelled) return;
      m.registerLoomInterlace();
    });
    void import('../lib/review').then((m) => {
      if (cancelled) return;
      m.registerLoomReview();
    });
    // Dedicated listener for the M5 Review crystallize payload shape
    // ({ section, thoughts, source, at }). The legacy
    // `CrystallizeListener.tsx` handles the older `{ docId }` shape; this
    // one forwards the new shape to Swift via the loomNavigate bridge.
    void import('../lib/crystallize-listener').then((m) => {
      if (cancelled) return;
      m.registerCrystallizeListener();
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
