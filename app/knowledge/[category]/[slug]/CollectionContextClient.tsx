'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useHistory } from '../../../../lib/use-history';
import { useAllTraces, type Trace } from '../../../../lib/trace';
import type { KnowledgeCategory } from '../../../../lib/knowledge-types';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../../../lib/learning-status';
import { continuePanelLifecycle } from '../../../../lib/panel-resume';

export type CollectionDocCard = {
  id: string;
  title: string;
  href: string;
  categorySlug: string;
  fileSlug: string;
  ext: string;
  preview: string;
  subcategory: string;
  subOrder: number;
  hasText: boolean;
  size: number;
};

export type CollectionGroupCard = {
  label: string;
  order: number;
  docs: CollectionDocCard[];
};

type CollectionSurface = CollectionDocCard & {
  state: 'new' | 'opened' | 'woven' | 'finished';
  touchedAt: number;
  anchorCount: number;
  latestSummary: string;
  latestQuote?: string;
  learning: LearningSurfaceSummary;
};

function docIdFor(doc: CollectionDocCard) {
  return `know/${doc.id}`;
}

function formatWhen(ts: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < day * 2) return 'yesterday';
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 30) return `${Math.floor(diff / day / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function stateLabel(surface: CollectionSurface) {
  switch (surface.state) {
    case 'finished':
      return 'Finished';
    case 'woven':
      return `${surface.anchorCount} stitch${surface.anchorCount > 1 ? 'es' : ''}`;
    case 'opened':
      return 'Opened';
    default:
      return 'New';
  }
}

function stateRank(surface: CollectionSurface) {
  switch (surface.state) {
    case 'woven':
      return 0;
    case 'opened':
      return 1;
    case 'finished':
      return 2;
    default:
      return 3;
  }
}

export function CollectionContextClient({
  category,
  docs,
  groups,
  currentDocId,
}: {
  category: KnowledgeCategory;
  docs: CollectionDocCard[];
  groups: CollectionGroupCard[];
  currentDocId: string;
}) {
  const router = useRouter();
  const [history] = useHistory();
  const { traces } = useAllTraces();

  const viewedByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      if (!entry.id.startsWith(`know/${category.slug}__`)) continue;
      map.set(entry.id, Math.max(map.get(entry.id) ?? 0, entry.viewedAt));
    }
    return map;
  }, [history, category.slug]);

  const tracesByDocId = useMemo(() => {
    const map = new Map<string, Trace[]>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      if (!trace.source.docId.startsWith(`know/${category.slug}__`)) continue;
      const existing = map.get(trace.source.docId) ?? [];
      existing.push(trace);
      map.set(trace.source.docId, existing);
    }
    return map;
  }, [traces, category.slug]);

  const surfaces = useMemo(() => {
    return docs
      .map((doc) => {
        const docId = docIdFor(doc);
        const viewedAt = viewedByDocId.get(docId) ?? 0;
        const traceSet = tracesByDocId.get(docId) ?? [];

        if (traceSet.length === 0) {
          return {
            ...doc,
            state: viewedAt > 0 ? 'opened' : 'new',
            touchedAt: viewedAt,
            anchorCount: 0,
            latestSummary: '',
            learning: summarizeLearningSurface([], viewedAt),
          } satisfies CollectionSurface;
        }

        const summary = summarizeLearningSurface(traceSet, viewedAt);
        return {
          ...doc,
          state: summary.finished ? 'finished' : summary.anchorCount > 0 ? 'woven' : 'opened',
          touchedAt: Math.max(viewedAt, summary.touchedAt),
          anchorCount: summary.anchorCount,
          latestSummary: summary.latestSummary,
          latestQuote: summary.latestQuote,
          learning: summarizeLearningSurface(traceSet, viewedAt),
        } satisfies CollectionSurface;
      })
      .sort((a, b) => stateRank(a) - stateRank(b) || b.touchedAt - a.touchedAt || a.subOrder - b.subOrder);
  }, [docs, tracesByDocId, viewedByDocId]);

  const currentIndex = docs.findIndex((doc) => doc.id === currentDocId);
  const currentSurface = surfaces.find((surface) => surface.id === currentDocId) ?? null;
  const currentGroup = groups.find((group) => group.docs.some((doc) => doc.id === currentDocId)) ?? null;
  const currentGroupDocs = currentGroup
    ? currentGroup.docs.map((doc) => surfaces.find((surface) => surface.id === doc.id) ?? null).filter(Boolean) as CollectionSurface[]
    : [];
  const currentGroupIndex = currentGroupDocs.findIndex((doc) => doc.id === currentDocId);
  const continueDoc = surfaces.find((surface) => surface.id !== currentDocId && (surface.state === 'woven' || surface.state === 'opened')) ?? null;
  const mapHref = currentGroup?.label
    ? `/knowledge/${category.slug}#${encodeURIComponent(currentGroup.label)}`
    : `/knowledge/${category.slug}`;

  const actionDoc = continueDoc ?? currentSurface ?? null;

  const openPrimaryAction = (surface: CollectionSurface | null) => {
    if (!surface) return;
    continuePanelLifecycle(router, {
      href: surface.href,
      nextAction: surface.learning.nextAction,
      latestAnchorId: surface.learning.latestAnchorId,
      refreshSource: 'knowledge',
    });
  };

  return (
    <section
      style={{
        marginTop: '0.35rem',
        marginBottom: '0.55rem',
        paddingBottom: '0.55rem',
        borderBottom: '0.5px solid var(--mat-border)',
      }}
    >
      <div
        className="t-caption2"
        style={{
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
          letterSpacing: '0.04em',
        }}
      >
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
          Collection
        </span>
        <span aria-hidden>·</span>
        <Link href={`/knowledge/${category.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          {category.label}
        </Link>
        <span aria-hidden>·</span>
        <span>{currentGroup?.label || 'All material'}</span>
        <span aria-hidden>·</span>
        <span>{currentIndex + 1} / {docs.length}</span>
        {currentSurface?.touchedAt && currentSurface.state !== 'new' ? (
          <>
            <span aria-hidden>·</span>
            <span>{formatWhen(currentSurface.touchedAt)}</span>
          </>
        ) : null}
        <span aria-hidden>·</span>
        {continueDoc ? (
          <button
            type="button"
            onClick={() => openPrimaryAction(actionDoc)}
            style={{
              appearance: 'none',
              border: 0,
              background: 'transparent',
              color: 'var(--accent)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            Continue collection
          </button>
        ) : (
          <Link
            href={mapHref}
            style={{
              color: 'var(--accent)',
              textDecoration: 'none',
              fontWeight: 700,
            }}
          >
            All material
          </Link>
        )}
      </div>
    </section>
  );
}
