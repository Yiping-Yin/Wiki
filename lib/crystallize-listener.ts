/**
 * Crystallize listener · M5 Review → Swift persistence bridge.
 *
 * The M5 Review vellum dispatches a `loom:crystallize` CustomEvent carrying
 *   detail: { section, thoughts, source, at }
 * when the reader hits "Crystallize". The legacy `CrystallizeListener.tsx`
 * handles the older `{ docId }` shape (AI Examiner) and returns early on
 * events without a `docId`, so the new Review payload needs a dedicated
 * listener that forwards the trail to the Swift side via the
 * `loomNavigate` bridge. Swift settles it into `LoomTraceWriter`.
 *
 * Registration is idempotent — multiple mount cycles won't stack
 * listeners.
 */

type CrystallizeDetail = {
  section?: string;
  thoughts?: unknown;
  source?: string;
  at?: number;
};

type NavigateBridge = { postMessage: (payload: unknown) => void };
type BridgeWindow = Window & {
  webkit?: {
    messageHandlers?: {
      loomNavigate?: NavigateBridge;
    };
  };
  __loomCrystallizeListenerInstalled?: boolean;
};

export function registerCrystallizeListener(): void {
  if (typeof window === 'undefined') return;
  const w = window as BridgeWindow;
  if (w.__loomCrystallizeListenerInstalled) return;
  w.__loomCrystallizeListenerInstalled = true;

  window.addEventListener('loom:crystallize', (ev: Event) => {
    const detail = (ev as CustomEvent<CrystallizeDetail>).detail;
    if (!detail || !Array.isArray(detail.thoughts)) return;
    // Persist via native bridge. Swift's NavigationBridgeHandler picks
    // up `{ action: "crystallize", payload }` and hands it to
    // LoomTraceWriter (or falls back to a notification).
    try {
      const handler = (window as BridgeWindow).webkit?.messageHandlers?.loomNavigate;
      if (handler?.postMessage) {
        handler.postMessage({
          action: 'crystallize',
          payload: {
            section: typeof detail.section === 'string' ? detail.section : '',
            thoughts: (detail.thoughts as unknown[]).filter(
              (t): t is string => typeof t === 'string',
            ),
            source: typeof detail.source === 'string' ? detail.source : '',
            at:
              typeof detail.at === 'number' && Number.isFinite(detail.at)
                ? detail.at
                : Date.now(),
          },
        });
      }
    } catch {
      // If the bridge isn't present (e.g. running outside the Swift
      // shell during `next dev`), silently no-op. The legacy
      // `CrystallizeListener` already owns the localStorage path for
      // older `{ docId }` events, so nothing is lost.
    }
  });
}
