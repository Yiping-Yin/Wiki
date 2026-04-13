'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { KnowledgeHomeStatic } from './KnowledgeHomeStatic';
import { summarizeLearningSurface, type LearningNextAction } from '../../lib/learning-status';
import { useAllTraces, type Trace } from '../../lib/trace';
import { useHistory } from '../../lib/use-history';

type CollectionCardData = {
  slug: string;
  label: string;
  count: number;
  weeks: number;
  docIds: string[];
};

type CollectionGroupData = {
  label: string;
  count: number;
  items: CollectionCardData[];
};

type CollectionProgress = {
  touched: number;
  crystallized: number;
  examined: number;
  stale: number;
  latestTouched: number;
  nextAction: LearningNextAction;
};

const nextActionRank: Record<LearningNextAction, number> = {
  refresh: 0,
  examine: 1,
  rehearse: 2,
  revisit: 3,
  capture: 4,
};

export function KnowledgeHomeClient({ groups }: { groups: CollectionGroupData[] }) {
  const router = useRouter();
  const [history] = useHistory();
  const { traces } = useAllTraces();

  const viewedByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      map.set(entry.id, Math.max(map.get(entry.id) ?? 0, entry.viewedAt));
    }
    return map;
  }, [history]);

  const tracesByDocId = useMemo(() => {
    const map = new Map<string, Trace[]>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const existing = map.get(trace.source.docId) ?? [];
      existing.push(trace);
      map.set(trace.source.docId, existing);
    }
    return map;
  }, [traces]);

  const collectionProgress = useMemo(() => {
    const map = new Map<string, CollectionProgress>();
    for (const group of groups) {
      for (const item of group.items) {
        let touched = 0;
        let crystallized = 0;
        let examined = 0;
        let stale = 0;
        let latestTouched = 0;
        let nextAction: LearningNextAction = 'capture';

        for (const docId of item.docIds) {
          const viewedAt = viewedByDocId.get(docId) ?? 0;
          const learning = summarizeLearningSurface(tracesByDocId.get(docId) ?? [], viewedAt);
          if (learning.opened) touched += 1;
          if (learning.crystallized) crystallized += 1;
          if (learning.examinerCount > 0) examined += 1;
          if (learning.opened && learning.recency === 'stale') stale += 1;
          latestTouched = Math.max(latestTouched, learning.touchedAt);
          if (nextActionRank[learning.nextAction] < nextActionRank[nextAction]) {
            nextAction = learning.nextAction;
          }
        }

        map.set(item.slug, {
          touched,
          crystallized,
          examined,
          stale,
          latestTouched,
          nextAction,
        });
      }
    }
    return map;
  }, [groups, tracesByDocId, viewedByDocId]);

  const focusCollection = useMemo(() => {
    return groups
      .flatMap((group) => group.items)
      .filter((item) => (collectionProgress.get(item.slug)?.touched ?? 0) > 0)
      .sort((a, b) => {
        const ap = collectionProgress.get(a.slug)!;
        const bp = collectionProgress.get(b.slug)!;
        if (nextActionRank[ap.nextAction] !== nextActionRank[bp.nextAction]) {
          return nextActionRank[ap.nextAction] - nextActionRank[bp.nextAction];
        }
        return bp.latestTouched - ap.latestTouched;
      })[0] ?? null;
  }, [groups, collectionProgress]);

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      {focusCollection && (
        <section
          className="material-thick"
          style={{
            padding: '1rem 1.05rem 1.05rem',
            borderRadius: 'var(--r-3)',
            marginBottom: 20,
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.65 }} />
            <span
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}
            >
              Continue collection
            </span>
            <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: '1.18rem',
                  fontWeight: 650,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                  marginBottom: 6,
                }}
              >
                {focusCollection.label}
              </div>

              {(() => {
                const progress = collectionProgress.get(focusCollection.slug)!;
                return (
                  <>
                    <div
                      className="t-caption2"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        color: 'var(--muted)',
                        letterSpacing: '0.04em',
                        marginBottom: 8,
                      }}
                    >
                      <span>{focusCollection.count} docs</span>
                      <span aria-hidden>·</span>
                      <span>{progress.touched} touched</span>
                      {progress.examined > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{progress.examined} examined</span>
                        </>
                      )}
                      {progress.crystallized > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{progress.crystallized} settled</span>
                        </>
                      )}
                      {progress.stale > 0 && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{progress.stale} stale</span>
                        </>
                      )}
                    </div>

                    <div
                      style={{
                        color: 'var(--fg-secondary)',
                        fontSize: '0.9rem',
                        lineHeight: 1.55,
                      }}
                    >
                      {collectionFocusLine(progress.nextAction)}
                    </div>
                  </>
                );
              })()}
            </div>

            <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignSelf: 'center' }}>
              <button
                type="button"
                onClick={() => router.push(`/knowledge/${focusCollection.slug}`)}
                style={knowledgeActionStyle(true)}
              >
                {collectionPrimaryLabel(collectionProgress.get(focusCollection.slug)!.nextAction)}
              </button>
            </div>
          </div>
        </section>
      )}

      <KnowledgeHomeStatic
        groups={groups.map((group) => ({
          ...group,
          items: group.items.map((item) => {
            const progress = collectionProgress.get(item.slug);
            const detail = progress && progress.touched > 0
              ? `${progress.touched} touched${progress.examined > 0 ? ` · ${progress.examined} examined` : ''}${progress.crystallized > 0 ? ` · ${progress.crystallized} settled` : ''}${progress.stale > 0 ? ` · ${progress.stale} stale` : ''}`
              : null;
            return {
              slug: item.slug,
              label: item.label,
              count: item.count,
              weeks: item.weeks,
              detail,
            };
          }),
        }))}
      />
    </div>
  );
}

function collectionPrimaryLabel(nextAction: LearningNextAction) {
  switch (nextAction) {
    case 'refresh':
      return 'Refresh collection';
    case 'examine':
      return 'Verify collection';
    case 'rehearse':
      return 'Rehearse collection';
    case 'capture':
      return 'Open collection';
    default:
      return 'Review collection';
  }
}

function collectionFocusLine(nextAction: LearningNextAction) {
  switch (nextAction) {
    case 'refresh':
      return 'Some panels in this collection have cooled. Re-enter the weave and warm them back up.';
    case 'examine':
      return 'This collection is ready to verify. Move from rehearsal into examiner while it is still warm.';
    case 'rehearse':
      return 'You have captures here that still need shaping. Rehearse them into stronger understanding.';
    case 'capture':
      return 'You have opened this collection, but the weave has barely started. Return to source and capture the key passages.';
    default:
      return 'This collection is in motion. Return to review and keep the weave coherent.';
  }
}

function knowledgeActionStyle(primary: boolean) {
  return {
    appearance: 'none' as const,
    border: `0.5px solid ${primary ? 'color-mix(in srgb, var(--accent) 38%, var(--mat-border))' : 'var(--mat-border)'}`,
    background: primary ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-elevated))' : 'var(--bg-elevated)',
    color: primary ? 'var(--accent)' : 'var(--fg)',
    borderRadius: 999,
    padding: '0.52rem 0.82rem',
    fontSize: '0.82rem',
    fontWeight: 650,
    letterSpacing: '-0.01em',
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: primary ? 'var(--shadow-1)' : 'none',
  };
}
