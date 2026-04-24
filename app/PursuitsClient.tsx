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
import { useEffect, useMemo, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPursuitRecords, PURSUIT_RECORDS_KEY, type LoomPursuitRecord } from '../lib/loom-pursuit-records';
import {
  type PursuitSeason,
  pursuitSeasonFor,
  type Pursuit,
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
  };
}

export default function PursuitsClient() {
  // SSR-safe: start empty (matches first client render), hydrate from the
  // native projection on mount. Matches the pattern used by HomeClient etc.
  const [pursuits, setPursuits] = useState<Pursuit[]>([]);

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

  const grouped = useMemo(() => {
    const map = new Map<PursuitWeight, Pursuit[]>();
    for (const weight of WEIGHT_ORDER) map.set(weight, []);
    for (const p of pursuits) {
      const bucket = map.get(p.weight);
      if (bucket) bucket.push(p);
    }
    return map;
  }, [pursuits]);

  const total = pursuits.length;

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

      {total === 0 ? (
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
                  <PursuitRow key={p.id} pursuit={p} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function PursuitRow({ pursuit }: { pursuit: Pursuit }) {
  const season = pursuitSeasonFor(pursuit);
  return (
    <Link
      href={`/pursuit/${encodeURIComponent(pursuit.id)}`}
      className={`loom-pursuit loom-pursuit--${pursuit.weight}`}
    >
      <div className="loom-pursuit-question">{pursuit.question}</div>
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
  );
}
