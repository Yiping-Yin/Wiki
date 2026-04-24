'use client';

/**
 * Focus Discipline — the rule that at any moment, only ONE Loom surface
 * should speak. When a user is in a focused state (reading with ChatFocus,
 * writing in a cowork scratch, tidying, running a review), system-level
 * notices (AI health banners, cross-link pills, save toasts) must defer.
 *
 * See: memory/feedback_focus_discipline.md
 *
 * Usage:
 *   - Wrap the app (or a subtree) with <FocusLayerProvider>.
 *   - A focused component calls `useFocusLock('chat-focus' | 'cowork-tidy' | ...)`
 *     to register itself; the hook returns a release callback tied to unmount.
 *   - A system-notice component calls `useIsFocused()`; when true, it renders null.
 *
 * We use a counter (not boolean) so multiple simultaneous focused surfaces
 * still keep notices suppressed until all release.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';

type FocusLayerApi = {
  isFocused: boolean;
  /** Token count per scope, for debugging + future filtered suppression. */
  scopes: readonly string[];
  requestFocus: (scope: string) => () => void;
};

const FocusLayerContext = createContext<FocusLayerApi>({
  isFocused: false,
  scopes: [],
  requestFocus: () => () => {},
});

export function FocusLayerProvider({ children }: { children: React.ReactNode }) {
  const [scopes, setScopes] = useState<string[]>([]);
  const requestFocus = (scope: string) => {
    setScopes((s) => [...s, scope]);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setScopes((s) => {
        const idx = s.lastIndexOf(scope);
        if (idx === -1) return s;
        const next = [...s];
        next.splice(idx, 1);
        return next;
      });
    };
  };
  const api: FocusLayerApi = {
    isFocused: scopes.length > 0,
    scopes,
    requestFocus,
  };
  return (
    <FocusLayerContext.Provider value={api}>{children}</FocusLayerContext.Provider>
  );
}

/** Components that own a focused user state call this with an `active`
 *  flag. Focus is acquired when active flips true and released when it
 *  flips false (or the component unmounts). This lets a always-mounted
 *  root-level component (e.g. ChatFocus) lock focus only when its own
 *  surface is actually open. */
export function useFocusLock(scope: string, active: boolean = true): void {
  const ctx = useContext(FocusLayerContext);
  const releaseRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active) return;
    releaseRef.current = ctx.requestFocus(scope);
    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** Components that render SYSTEM-level notices (AI health, cross-link pill,
 *  save toast, suggestion banner) call this before rendering. Return true
 *  → defer (render null). */
export function useIsFocused(): boolean {
  return useContext(FocusLayerContext).isFocused;
}
