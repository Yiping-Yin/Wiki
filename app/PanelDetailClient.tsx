'use client';

/**
 * PanelDetailClient — the interior of a held panel.
 *
 * Data source:
 *   Native mode prefers `loom://native/panel/<id>.json`, with browser
 *   preview falling back through the shared panel-record helper. This
 *   route no longer falls back to a static seed corpus: if no real panel
 *   matches the requested id/docId, the surface stays honestly empty.
 *   Source-level weft provenance is still gated until the projection
 *   ships attributed source rows.
 *
 * Design reference:
 *   /Users/yinyiping/Downloads/Wiki Logo/loom-actions.jsx
 *     → PanelDetailSurface (~lines 152-263)
 */

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { fetchNativeJson } from '../lib/loom-native-json';
import { loadPanelRecords, PANEL_RECORDS_KEY, type LoomPanelRecord } from '../lib/loom-panel-records';
import Ornament from '../components/Ornament';

// Typed view into the WebKit message bridge — mirrors the pattern used
// across SoanClient / HomeClient. Absent when running outside the native
// shell (tests, in-browser preview), in which case we degrade silently.
type LoomNavigateBridge = { postMessage: (message: unknown) => void };
type BridgeWindow = Window & {
  webkit?: { messageHandlers?: { loomNavigate?: LoomNavigateBridge } };
};

/** Ship a revision of a trace's summary through the native bridge. The
 *  Swift side (`handleReviseTraceSummary`) appends a `revision` event to
 *  the trace's eventsJSON, preserving the prior text so Palimpsest can
 *  render the draft-beneath-the-draft timeline. A no-op outside the
 *  native shell — web preview gets no-persistence, which is the right
 *  failure mode (don't silently claim to have saved). */
function postReviseTraceSummary(id: string, newText: string): void {
  if (typeof window === 'undefined') return;
  const handler = (window as BridgeWindow).webkit?.messageHandlers?.loomNavigate;
  if (!handler) return;
  try {
    handler.postMessage({
      action: 'reviseTraceSummary',
      payload: { id, newText },
    });
  } catch {
    // Bridge failures are non-fatal — the native projection will
    // re-reconcile on next refresh if the native side eventually persists.
  }
}

type PanelDetail = {
  id: string;
  title: string;
  subtitle: string;
  color: string;
  drawnAt: string;
  editedAt: string;
  status: string;
  body: string[];
  thoughtCount: number;
  highlight?: string;
};

/**
 * Shape of each panel record exposed by the native shell. Only a subset
 * is consumed here — the rest is retained by the projection for forward
 * compatibility.
 */
type StoredPanelEntry = LoomPanelRecord;

function coercePanelDetail(raw: unknown, requestedId: string): PanelDetail | null {
  if (!raw || typeof raw !== 'object') return null;
  const match = raw as StoredPanelEntry;

  const title = typeof match.title === 'string' && match.title ? match.title : 'Untitled';
  const subtitle = typeof match.sub === 'string' ? match.sub : '';
  const color = typeof match.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(match.color)
    ? match.color
    : '#9E7C3E';
  const bodyText = typeof match.body === 'string' ? match.body : '';
  const thoughtsRaw = Array.isArray(match.thoughts) ? match.thoughts : [];
  const thoughts = thoughtsRaw.filter((t): t is string => typeof t === 'string' && t.length > 0);
  const revisions = Array.isArray(match.revisions) ? match.revisions : [];

  const body = bodyText
    ? bodyText.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean)
    : ['This held panel exists, but its written body has not been mirrored into the web surface yet.'];

  return {
    id: typeof match.id === 'string' && match.id ? match.id : requestedId,
    title,
    subtitle: subtitle || 'a panel held from your own thinking',
    color,
    drawnAt: match.at ? `drawn ${formatLongDate(match.at)}` : 'drawn in this session',
    editedAt: revisions.length > 0
      ? `revised ${revisions.length} time${revisions.length === 1 ? '' : 's'}`
      : '',
    status: 'held panel',
    body,
    thoughtCount: thoughts.length,
  };
}

function nativePanelUrl(id: string): string {
  return `loom://native/panel/${encodeURIComponent(id)}.json`;
}

/**
 * Read the native-mirrored panel whose id matches `id` and reshape it into
 * the `PanelDetail` the render path consumes. Returns null if the store
 * hasn't been seeded yet, the key is absent, or no entry matches.
 */
async function loadStoredPanelById(id: string): Promise<PanelDetail | null> {
  const match = (await loadPanelRecords()).find((entry) => entry.id === id || entry.docId === id);
  return match ? coercePanelDetail(match, id) : null;
}

async function loadPanelDetail(id: string): Promise<PanelDetail | null> {
  if (!id) return null;
  const native = await fetchNativeJson<StoredPanelEntry>(nativePanelUrl(id));
  if (native) return coercePanelDetail(native, id);
  return loadStoredPanelById(id);
}

function formatLongDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString('en-US', { month: 'short', day: '2-digit' }).toLowerCase();
}

type Props = { id: string };

// Wraps a literal highlight substring with the bronze inline style. The
// highlight is the one phrase the author has pinned inside the prose —
// typically the figure the panel is built around. We match once, case-
// sensitive, and only in the first paragraph that contains it, so we
// don't accidentally highlight the same phrase twice if it recurs.
function renderWithHighlight(paragraph: string, highlight: string) {
  const idx = paragraph.indexOf(highlight);
  if (idx === -1) return { __html: escapeHtml(paragraph) };
  const before = paragraph.slice(0, idx);
  const after = paragraph.slice(idx + highlight.length);
  return {
    __html:
      escapeHtml(before) +
      '<span class="loom-panel-detail-highlight">' +
      escapeHtml(highlight) +
      '</span>' +
      escapeHtml(after),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function PanelDetailClient({ id }: Props) {
  const [panel, setPanel] = useState<PanelDetail | null>(null);

  // Edit-summary state. `editing` toggles the prose region into a
  // textarea; `draft` holds the in-flight text. We only persist the
  // edit if it actually differs from the current body — a blur with
  // no change is a no-op (don't burn a revision event on a glance-and-
  // close).
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await loadPanelDetail(id);
      if (!cancelled) setPanel(next);
    };
    void refresh();
    const dispose = subscribeLoomMirror(PANEL_RECORDS_KEY, 'loom-panels-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, [id]);

  // Whenever the panel's body changes (fresh mirror from native), reset
  // the draft to match so the textarea stays in sync if the user is mid-
  // edit on an old revision.
  const bodyText = panel ? panel.body.join('\n\n') : '';
  useEffect(() => {
    if (!editing) setDraft(bodyText);
  }, [bodyText, editing]);

  const editableId = panel?.id ?? null;

  const commitEdit = useCallback(() => {
    if (!editableId) {
      setEditing(false);
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed) {
      // Reject the empty edit — reset to current body so blur doesn't
      // wipe visible state.
      setDraft(bodyText);
      setEditing(false);
      return;
    }
    if (trimmed === bodyText.trim()) {
      setEditing(false);
      return;
    }
    postReviseTraceSummary(editableId, draft);
    setEditing(false);
  }, [editableId, draft, bodyText]);

  const cancelEdit = useCallback(() => {
    setDraft(bodyText);
    setEditing(false);
  }, [bodyText]);

  if (!panel) {
    return (
      <article className="loom-panel-detail loom-panel-detail--empty">
        <nav className="loom-panel-detail-back">
          <Link href="/patterns">{'\u2190 Patterns'}</Link>
        </nav>
        <section className="loom-panel-detail-body">
          <div className="loom-panel-detail-eyebrow">Panel</div>
          <h1 className="loom-panel-detail-title">
            No held panel matches this route.
          </h1>
          <p className="loom-panel-detail-subtitle">
            Open Patterns and choose a real panel; this detail view no longer invents placeholder prose.
          </p>
        </section>
      </article>
    );
  }

  return (
    <article className="loom-panel-detail">
      <nav className="loom-panel-detail-back">
        <Link href="/patterns">{'\u2190 Patterns'}</Link>
      </nav>

      <section className="loom-panel-detail-body">
        <div className="loom-panel-detail-eyebrow">Panel · held</div>
        <h1 className="loom-panel-detail-title">{panel.title}</h1>
        <p className="loom-panel-detail-subtitle">{panel.subtitle}</p>
        <div className="loom-panel-detail-ornament"><Ornament color="var(--accent)" size={13} /></div>

        {editing && editableId ? (
          <div className="loom-panel-detail-prose loom-panel-detail-prose--editing">
            <textarea
              className="loom-panel-detail-edit"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitEdit();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              aria-label="Revise panel summary"
            />
            <div className="loom-panel-detail-edit-hint">
              <kbd>⌘↵</kbd> save · <kbd>esc</kbd> cancel
            </div>
          </div>
        ) : (
          <div className="loom-panel-detail-prose">
            {editableId && (
              <button
                type="button"
                className="loom-panel-detail-edit-toggle"
                onClick={() => {
                  setDraft(bodyText);
                  setEditing(true);
                }}
                aria-label="Revise summary"
                title="Revise summary"
              >
                ✎
              </button>
            )}
            {panel.body.map((paragraph, i) => {
              // Highlight the pinned phrase on its first paragraph occurrence.
              // We only render dangerouslySetInnerHTML when we know a match
              // exists, so the paragraph's literal content is otherwise
              // escaped as plain text via React.
              const shouldHighlight =
                panel.highlight != null && paragraph.includes(panel.highlight);
              if (shouldHighlight && panel.highlight) {
                return (
                  <p
                    key={i}
                    dangerouslySetInnerHTML={renderWithHighlight(
                      paragraph,
                      panel.highlight,
                    )}
                  />
                );
              }
              return <p key={i}>{paragraph}</p>;
            })}
          </div>
        )}

        <div className="loom-panel-detail-provenance">
          <span>{panel.drawnAt}</span>
          {panel.editedAt ? <span>{panel.editedAt}</span> : null}
          <span>{panel.status}</span>
        </div>
      </section>

      <aside className="loom-panel-detail-wefts">
        <div className="loom-panel-detail-wefts-label">
          Wefts · pending
        </div>
        <p className="loom-panel-detail-wefts-empty">
          {panel.thoughtCount > 0
            ? `This panel was crystallized from ${panel.thoughtCount} thought${panel.thoughtCount === 1 ? '' : 's'}, but source-level wefts are not mirrored into the web surface yet.`
            : 'Source-level wefts are not mirrored into the web surface yet.'}
        </p>
        <div className="loom-panel-detail-footer">
          <span>{editableId ? 'summary edits sync through the native bridge' : 'read-only detail view'}</span>
          <span>source provenance still gated</span>
        </div>
      </aside>
    </article>
  );
}
