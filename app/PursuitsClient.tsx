'use client';

/**
 * PursuitsClient — the mind-room.
 *
 * Loom's top-level object is not a book; it is a *question* the mind is
 * holding. This surface lists those questions, grouped by weight (how
 * present they are in attention right now). Clicking a row enters one
 * pursuit's interior (`/pursuits/<id>`).
 *
 * Visual grammar:
 *   · flush-left, ample margins, paper background
 *   · Cormorant italic display for questions
 *   · primary weight is large (28-34px), secondary 20-22px, tertiary 16px
 *   · horizontal hairlines separate rows, sans-serif eyebrows separate groups
 *
 * Data source:
 *   Native mode prefers `loom://native/pursuits.json` so the mind-room
 *   can fetch the list directly from SwiftData. Plain-browser preview
 *   still falls back through the shared pursuit-record helper and an
 *   honest empty state when unset; per the
 *   learn-don't-organize rule, placeholder questions would pass off
 *   fabricated interiority as the user's own.
 *
 * Design reference:
 *   /Users/yinyiping/Downloads/Wiki Logo/loom-pursuits.jsx → PursuitsSurface
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPursuitRecords, PURSUIT_RECORDS_KEY, type LoomPursuitRecord } from '../lib/loom-pursuit-records';
import { hidePursuit, restorePursuit } from '../lib/pursuit-hide-client';
import {
  type PursuitSeason,
  pursuitSeasonFor,
  type Pursuit,
  type PursuitSpawnMeta,
  type PursuitWeight,
} from './pursuit-model';

async function loadPursuits(): Promise<Pursuit[]> {
  return (await loadPursuitRecords())
    .map(coercePursuitRecord)
    .filter((p): p is Pursuit => p !== null);
}

const WEIGHT_ORDER: PursuitWeight[] = ['primary', 'secondary', 'tertiary'];
const SEASON_ORDER: PursuitSeason[] = ['active', 'waiting', 'held', 'retired', 'contradicted'];

const WEIGHT_LABEL: Record<PursuitWeight, string> = {
  primary: 'Close to the body',
  secondary: 'In middle distance',
  tertiary: 'At the horizon',
};

function coerceSpawn(raw: LoomPursuitRecord['spawn']): PursuitSpawnMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const extractorId = typeof raw.extractorId === 'string' ? raw.extractorId : '';
  if (!extractorId) return undefined;
  return {
    extractorId,
    fieldPath: typeof raw.fieldPath === 'string' ? raw.fieldPath : '',
    sourceDocId: typeof raw.sourceDocId === 'string' ? raw.sourceDocId : '',
    sourceTraceId: typeof raw.sourceTraceId === 'string' ? raw.sourceTraceId : '',
    sourceTitle: typeof raw.sourceTitle === 'string' ? raw.sourceTitle : '',
    body: typeof raw.body === 'string' ? raw.body : '',
    at: typeof raw.at === 'number' ? raw.at : 0,
  };
}

function coercePursuitRecord(record: LoomPursuitRecord): Pursuit | null {
  if (typeof record.id !== 'string' || !record.id) return null;
  if (typeof record.question !== 'string' || !record.question) return null;
  const weight = WEIGHT_ORDER.includes(record.weight as PursuitWeight)
    ? (record.weight as PursuitWeight)
    : 'tertiary';
  const season = SEASON_ORDER.includes(record.season as PursuitSeason)
    ? (record.season as PursuitSeason)
    : 'active';
  return {
    id: record.id,
    question: record.question,
    weight,
    sources: typeof record.sources === 'number' ? record.sources : 0,
    panels: typeof record.panels === 'number' ? record.panels : 0,
    season,
    at: typeof record.at === 'number' ? record.at : undefined,
    settledAt: typeof record.settledAt === 'number' ? record.settledAt : undefined,
    hidden: record.hidden === true,
    spawn: coerceSpawn(record.spawn),
  };
}

export default function PursuitsClient() {
  // SSR-safe: start empty (matches first client render), hydrate from the
  // native projection on mount. Matches the pattern used by HomeClient etc.
  const [pursuits, setPursuits] = useState<Pursuit[]>([]);
  // Phase 7.2 · "Show hidden" disclosure state. Defaults to collapsed
  // so auto-spawned Pursuits the user has dismissed don't clutter the
  // room; expands inline beneath the visible list when the user
  // clicks the disclosure.
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const next = await loadPursuits();
      if (!cancelled) setPursuits(next);
    };

    void refresh();

    const dispose = subscribeLoomMirror(PURSUIT_RECORDS_KEY, 'loom-pursuits-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  // Split visible vs. hidden BEFORE grouping by weight — visible
  // Pursuits get the canonical room treatment; hidden ones go into
  // the bottom disclosure so the user can restore individually.
  const visiblePursuits = useMemo(
    () => pursuits.filter((p) => !p.hidden),
    [pursuits],
  );
  const hiddenPursuits = useMemo(
    () => pursuits.filter((p) => p.hidden),
    [pursuits],
  );

  const handleHide = useCallback(async (p: Pursuit) => {
    if (!p.spawn?.sourceDocId) return;
    try {
      await hidePursuit({ pursuitId: p.id, sourceDocId: p.spawn.sourceDocId });
      // Optimistic local update — the native bridge also fires a
      // change notification so the next refresh will re-flatten.
      setPursuits((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, hidden: true } : x)),
      );
    } catch (err) {
      // Surface failures via console only — same posture as
      // schema-corrections-client. The mirror refresh will reconcile
      // if the bridge call did partially succeed.
      console.error('[loom] hidePursuit failed:', err);
    }
  }, []);

  const handleRestore = useCallback(async (p: Pursuit) => {
    if (!p.spawn?.sourceDocId) return;
    try {
      await restorePursuit({ pursuitId: p.id, sourceDocId: p.spawn.sourceDocId });
      setPursuits((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, hidden: false } : x)),
      );
    } catch (err) {
      console.error('[loom] restorePursuit failed:', err);
    }
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<PursuitWeight, Pursuit[]>();
    for (const weight of WEIGHT_ORDER) map.set(weight, []);
    for (const p of visiblePursuits) {
      const bucket = map.get(p.weight);
      if (bucket) bucket.push(p);
    }
    return map;
  }, [visiblePursuits]);

  const total = visiblePursuits.length;

  return (
    <div className="loom-pursuits">
      <header className="loom-pursuits-header">
        <div className="loom-pursuits-eyebrow">
          Pursuits{total > 0 ? ` · ${total} held` : ''}
        </div>
        <h1 className="loom-pursuits-title">
          {total > 0 ? 'The questions your mind is holding' : 'Pursuits.'}
        </h1>
        <p className="loom-pursuits-subtitle">
          {total > 0 ? 'Some close to the body, some far.' : 'No questions held yet.'}
        </p>
      </header>

      {total === 0 && hiddenPursuits.length === 0 ? (
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            A pursuit is a question your mind keeps returning to. Open a
            source, read, and the questions that surface will gather here.
          </p>
          <Link href="/sources" className="loom-empty-state-action">
            Open Sources →
          </Link>
        </div>
      ) : (
        WEIGHT_ORDER.map((weight) => {
          const items = grouped.get(weight) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={weight} className="loom-pursuits-group">
              <hr className="loom-pursuits-group-hair" />
              <div className="loom-pursuits-group-label">{WEIGHT_LABEL[weight]}</div>
              <div className="loom-pursuits-group-list">
                {items.map((p) => (
                  <PursuitRow
                    key={p.id}
                    pursuit={p}
                    onHide={p.spawn ? () => handleHide(p) : undefined}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {hiddenPursuits.length > 0 && (
        <section className="loom-pursuits-hidden" role="region" aria-label="Hidden pursuits">
          <hr className="loom-pursuits-group-hair" />
          <button
            type="button"
            className="loom-pursuits-hidden-toggle"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
          >
            {showHidden ? 'hide' : 'show'} {hiddenPursuits.length} hidden
          </button>
          {showHidden && (
            <div className="loom-pursuits-hidden-list">
              {hiddenPursuits.map((p) => (
                <PursuitRow
                  key={p.id}
                  pursuit={p}
                  onRestore={() => handleRestore(p)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function PursuitRow({
  pursuit,
  onHide,
  onRestore,
}: {
  pursuit: Pursuit;
  onHide?: () => void;
  onRestore?: () => void;
}) {
  const season = pursuitSeasonFor(pursuit);
  // Phase 7.2 · "from syllabus" eyebrow + body line surface the
  // spawn provenance without needing a schema field on LoomPursuit.
  // Keep the wording literal per `feedback_no_metaphor_feature_names`
  // — "from syllabus", not "Loom-suggested" or "AI-derived".
  const spawn = pursuit.spawn;
  return (
    <div className={`loom-pursuit-row${pursuit.hidden ? ' loom-pursuit-row--hidden' : ''}`}>
      <Link
        href={`/pursuit/${encodeURIComponent(pursuit.id)}`}
        className={`loom-pursuit loom-pursuit--${pursuit.weight}`}
      >
        {spawn ? (
          <div className="loom-pursuit-spawn-eyebrow" aria-label="Auto-spawned from a source schema">
            from {spawn.extractorId === 'syllabus-pdf' ? 'syllabus' : spawn.extractorId} ·{' '}
            <span className="loom-pursuit-spawn-source">{spawn.sourceTitle || spawn.sourceDocId}</span>
          </div>
        ) : null}
        <div className="loom-pursuit-question">{pursuit.question}</div>
        {spawn && spawn.body ? (
          <div className="loom-pursuit-spawn-body">{spawn.body}</div>
        ) : null}
        <div className="loom-pursuit-meta">
          {pursuit.sources} {pursuit.sources === 1 ? 'source' : 'sources'}
          <span className="loom-pursuit-meta-dot"> · </span>
          {pursuit.panels} {pursuit.panels === 1 ? 'panel' : 'panels'}
          <span className="loom-pursuit-meta-dot"> · </span>
          <span>{pursuit.season}</span>
          <span className="loom-pursuit-meta-dot"> · </span>
          <span>{season}</span>
        </div>
      </Link>
      {onHide ? (
        <button
          type="button"
          className="loom-pursuit-hide"
          aria-label="Hide this pursuit"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onHide();
          }}
        >
          hide
        </button>
      ) : null}
      {onRestore ? (
        <button
          type="button"
          className="loom-pursuit-hide"
          aria-label="Restore this pursuit"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRestore();
          }}
        >
          restore
        </button>
      ) : null}
    </div>
  );
}
