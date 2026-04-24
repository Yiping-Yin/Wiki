'use client';

/**
 * PursuitDetailClient — the inside of one question.
 *
 * Shows a single pursuit's interior: the question in display-size italic,
 * metadata line ({N sources} gathered · {N panels} drawn · {season} for
 * {duration}), a list of the sources attached, a list of panels formed,
 * and footer actions for the three real transitions a pursuit can make
 * (return · set down · contradict) plus a discreet delete.
 *
 * Data source:
 *   Native mode prefers `loom://native/pursuit/<id>.json` so the detail
 *   surface can fetch one pursuit directly from SwiftData. Browser
 *   preview falls back through the shared pursuit-record helper.
 *
 * Bridge:
 *   Mutations (season swap, delete) post to `loomNavigate` — the
 *   NavigationBridgeHandler dispatches to `LoomPursuitWriter`, which
 *   broadcasts `.loomPursuitChanged`; ContentView's coordinator fires
 *   `loom-pursuits-updated`, which this client uses to re-fetch the
 *   native projection.
 *
 * Design reference:
 *   /Users/yinyiping/Downloads/Wiki Logo/loom-pursuit-detail.jsx
 *     → PursuitDetailSurface
 *
 * Attached sources / panels now come from the native pursuit payload
 * itself. Missing attachments render as empty sections rather than a
 * fabricated bibliography.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { fetchNativeJson } from '../lib/loom-native-json';
import { loadPursuitRecords, PURSUIT_RECORDS_KEY } from '../lib/loom-pursuit-records';
import {
  pursuitSeasonFor,
  type PursuitPanelItem,
  type PursuitSourceItem,
  type Pursuit,
} from './pursuit-model';

/** Minimal shape of the WKWebView → native bridge we post to. Mirrors
 *  the pattern used by `SoanClient`; declared narrowly so the non-WKWebView
 *  path (e.g. plain browser during `next dev`) is a simple undefined check. */
type LoomNavigateBridge = {
  postMessage: (message: unknown) => void;
};
type BridgeWindow = Window & {
  webkit?: { messageHandlers?: { loomNavigate?: LoomNavigateBridge } };
};

/**
 * Post a small command object to the native bridge. No-op off-WKWebView
 * (dev browser, SSR) so the component remains safe to render anywhere.
 * Catches post failures silently — the optimistic state update at the
 * call site is what the user sees; the native projection will re-hydrate
 * the source of truth on the next `loom-pursuits-updated` broadcast.
 */
function postToBridge(action: string, payload: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const handler = (window as BridgeWindow).webkit?.messageHandlers?.loomNavigate;
  if (!handler) return;
  try {
    handler.postMessage({ action, payload });
  } catch {
    // Swallow — optimistic UI holds until the next native refresh.
  }
}

function coercePursuit(raw: unknown, requestedId: string): Pursuit | null {
  if (!raw || typeof raw !== 'object') return null;
  const pursuit = raw as Pursuit;
  if (typeof pursuit.id !== 'string' || !pursuit.id) return null;
  if (typeof pursuit.question !== 'string' || !pursuit.question) return null;
  return {
    ...pursuit,
    id: pursuit.id || requestedId,
  };
}

function nativePursuitUrl(id: string): string {
  return `loom://native/pursuit/${encodeURIComponent(id)}.json`;
}

async function loadStoredPursuitById(id: string): Promise<Pursuit | null> {
  const match = (await loadPursuitRecords()).find((item) => item.id === id);
  return match ? coercePursuit(match, id) : null;
}

async function loadPursuitById(id: string): Promise<Pursuit | null> {
  if (!id) return null;
  const native = await fetchNativeJson<Pursuit>(nativePursuitUrl(id));
  if (native) return coercePursuit(native, id);
  return loadStoredPursuitById(id);
}

type Props = { id: string };

export default function PursuitDetailClient({ id }: Props) {
  const [pursuit, setPursuit] = useState<Pursuit | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const lookupId = search.get('pursuitId') ?? id;

    let cancelled = false;
    const refresh = async () => {
      const next = await loadPursuitById(lookupId);
      if (cancelled) return;
      setPursuit(next);
      setLoaded(true);
    };

    void refresh();

    const dispose = subscribeLoomMirror(PURSUIT_RECORDS_KEY, 'loom-pursuits-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [id]);

  /**
   * Optimistic local season swap. Patches the single loaded pursuit so the
   * UI (meta line, button labels, greyed footer) reacts immediately — the
   * native writer fires next and the subsequent `loom-pursuits-updated`
   * fetch supersedes our local patch. Also
   * stamps `settledAt` when moving into 'held'/'retired' so
   * `pursuitSeasonFor` can read "held for today" without waiting for the
   * round trip.
   */
  function applySeasonLocally(next: 'held' | 'contradicted' | 'active'): void {
    if (!pursuit) return;
    const now = Date.now();
    setPursuit({
      ...pursuit,
      season: next,
      settledAt: next === 'held' ? now : undefined,
      at: now,
    });
  }

  function handleSetDown(): void {
    if (!pursuit) return;
    postToBridge('updatePursuitSeason', { id: pursuit.id, season: 'held' });
    applySeasonLocally('held');
  }

  function handleContradict(): void {
    if (!pursuit) return;
    postToBridge('updatePursuitSeason', { id: pursuit.id, season: 'contradicted' });
    applySeasonLocally('contradicted');
  }

  function handleDelete(): void {
    if (!pursuit) return;
    if (typeof window === 'undefined') return;
    // `confirm` is the right shape here — deletion is rare and we want a
    // hard "are you sure" beat before firing the native writer. The web
    // side intentionally uses the browser confirm (vs a custom modal) to
    // keep this path dead simple; parity with Finder's "move to trash".
    if (!window.confirm('Remove this pursuit?')) return;
    postToBridge('deletePursuit', { id: pursuit.id });
    // Short delay so the acknowledgement isn't swallowed by the
    // navigation — gives the user a beat to see their choice register
    // before landing back on the Pursuits list (where the mirror will
    // have already dropped this row).
    setTimeout(() => {
      window.location.href = '/pursuits';
    }, 150);
  }

  // Before hydration finishes, render nothing rather than the "not in
  // the room" fallback — avoids a flash of that message on cold mount
  // when the pursuit is in fact stored locally.
  if (!loaded) {
    return <div className="loom-pursuit-detail" aria-busy="true" />;
  }

  if (!pursuit) {
    return (
      <div className="loom-pursuit-detail">
        <h1 className="loom-pursuit-detail-question">
          This pursuit is not in the room.
        </h1>
        <p className="loom-pursuit-detail-meta">
          It may have been set down, or never opened.
        </p>
        <div className="loom-pursuit-detail-actions">
          <Link href="/pursuits" className="loom-pursuit-detail-action">
            Return to Pursuits
          </Link>
        </div>
      </div>
    );
  }

  const sources = pursuit.sourceItems ?? [];
  const panels = pursuit.panelItems ?? [];
  const duration = pursuitSeasonFor(pursuit);

  return (
    <div className="loom-pursuit-detail">
      <h1 className="loom-pursuit-detail-question">{pursuit.question}</h1>
      <p className="loom-pursuit-detail-meta">
        {pursuit.sources} {pursuit.sources === 1 ? 'source' : 'sources'} gathered
        {' · '}
        {pursuit.panels} {pursuit.panels === 1 ? 'panel' : 'panels'} drawn
        {' · '}
        {pursuit.season} for {duration}
      </p>

      {sources.length > 0 && (
        <section className="loom-pursuit-detail-section">
          <div className="loom-pursuit-detail-section-label">Sources attached</div>
          {sources.map((s: PursuitSourceItem, i) => (
            s.href ? (
              <Link
                key={`${s.docId}-${i}`}
                href={s.href}
                className="loom-pursuit-detail-item"
              >
                {s.title}
              </Link>
            ) : (
              <div
                key={`${s.docId}-${i}`}
                className="loom-pursuit-detail-item"
              >
                {s.title}
              </div>
            )
          ))}
        </section>
      )}

      {panels.length > 0 && (
        <section className="loom-pursuit-detail-section">
          <div className="loom-pursuit-detail-section-label">Panels formed within</div>
          {panels.map((panel: PursuitPanelItem) => (
            <Link
              key={panel.id}
              href={`/panel/${encodeURIComponent(panel.id)}`}
              className="loom-pursuit-detail-item"
            >
              {panel.title}
            </Link>
          ))}
        </section>
      )}

      <div className="loom-pursuit-detail-actions">
        <Link href="/pursuits" className="loom-pursuit-detail-action">
          Return to Pursuits
        </Link>
        <button
          type="button"
          className="loom-pursuit-detail-action"
          onClick={handleSetDown}
        >
          Set this question down
        </button>
        <button
          type="button"
          className="loom-pursuit-detail-action"
          onClick={handleContradict}
        >
          Contradict this
        </button>
        {/* Discreet delete — rare path. Preferred exit is Set-down, but
            accidentally-minted pursuits need a way out. Tiny, muted,
            hover-red so it reads as a destructive outlier without
            shouting. */}
        <button
          type="button"
          className="loom-pursuit-detail-action loom-pursuit-detail-action--delete"
          onClick={handleDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
