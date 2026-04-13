'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { KesiSwatch } from '../../../../components/KesiSwatch';
import { LearningStatusInline } from '../../../../components/LearningStatusInline';
import { useHistory } from '../../../../lib/use-history';
import { useAllTraces, type Trace } from '../../../../lib/trace';
import type { KnowledgeCategory } from '../../../../lib/knowledge-types';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../../../lib/learning-status';

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

function docSummary(surface: CollectionSurface) {
  if (surface.latestSummary) return surface.latestSummary;
  if (surface.latestQuote) return surface.latestQuote;
  if (surface.preview) return surface.preview.slice(0, 220);
  return '';
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
  const startDoc = docs[currentIndex + 1] ?? docs[0] ?? null;
  const mapHref = currentGroup?.label
    ? `/knowledge/${category.slug}#${encodeURIComponent(currentGroup.label)}`
    : `/knowledge/${category.slug}`;
  const baseSequence = currentGroupDocs.length > 0 ? currentGroupDocs : surfaces;
  const sequenceAnchorIndex =
    currentGroupIndex >= 0
      ? currentGroupIndex
      : baseSequence.findIndex((doc) => doc.id === currentDocId);
  const sequenceDocs =
    baseSequence.length <= 3 || sequenceAnchorIndex < 0
      ? baseSequence.slice(0, 3)
      : baseSequence.slice(
          Math.max(0, sequenceAnchorIndex - 1),
          Math.min(baseSequence.length, sequenceAnchorIndex + 2),
        );

  return (
    <section
      style={{
        marginTop: '0.8rem',
        marginBottom: '1rem',
        paddingBottom: '0.9rem',
        borderBottom: '0.5px solid var(--mat-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="t-caption2"
            style={{
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Collection
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--display)', fontSize: '0.95rem', fontWeight: 600, letterSpacing: '-0.012em' }}>
              {currentGroup?.label || category.label}
            </span>
            <span className="t-caption2" style={{ color: 'var(--muted)', letterSpacing: '0.04em' }}>
              {currentIndex + 1} of {docs.length}
            </span>
            {currentSurface && (
              <span className="t-caption2" style={{ color: currentSurface.state === 'finished' ? 'var(--accent)' : 'var(--muted)', letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 700 }}>
                {stateLabel(currentSurface)}
              </span>
            )}
          </div>
        </div>

        <div style={{ width: 96, opacity: 0.18, flexShrink: 0 }}>
          <KesiSwatch categorySlug={category.slug} height={20} />
        </div>
      </div>

      {currentSurface && (
        <div style={{ marginTop: 6 }}>
          <LearningStatusInline status={currentSurface.learning} compact />
        </div>
      )}

      <div
        className="t-caption2"
        style={{
          color: 'var(--muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          letterSpacing: '0.04em',
          marginTop: 8,
        }}
      >
        <Link href={`/knowledge/${category.slug}`} style={{ color: 'inherit', textDecoration: 'none' }}>
          {category.label}
        </Link>
        <span aria-hidden>·</span>
        <Link href={mapHref} style={{ color: 'inherit', textDecoration: 'none' }}>
          {currentGroup?.label || 'All material'}
        </Link>
        {continueDoc && (
          <>
            <span aria-hidden>·</span>
            <Link href={continueDoc.href} style={{ color: 'inherit', textDecoration: 'none' }}>
              Continue {continueDoc.title}
            </Link>
          </>
        )}
        {!continueDoc && startDoc && startDoc.id !== currentDocId && (
          <>
            <span aria-hidden>·</span>
            <Link href={startDoc.href} style={{ color: 'inherit', textDecoration: 'none' }}>
              Next {startDoc.title}
            </Link>
          </>
        )}
        {currentSurface?.touchedAt ? (
          <>
            <span aria-hidden>·</span>
            <span>{stateLabel(currentSurface).toLowerCase()}</span>
            <span aria-hidden>·</span>
            <span>touched {formatWhen(currentSurface.touchedAt)}</span>
          </>
        ) : null}
      </div>

      {sequenceDocs.length > 1 && (
        <div
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            letterSpacing: '0.04em',
            marginTop: 8,
          }}
        >
          {sequenceDocs.map((doc, index) => {
            const active = doc.id === currentDocId;
            const seqIndex =
              currentGroupIndex >= 0
                ? Math.max(0, currentGroupIndex - 1) + index + 1
                : docs.findIndex((item) => item.id === doc.id) + 1;
            return (
              <span key={doc.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {index > 0 && <span aria-hidden>·</span>}
                <Link
                  href={doc.href}
                  style={{
                    color: active ? 'var(--fg)' : 'inherit',
                    textDecoration: 'none',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {seqIndex} {doc.title}
                </Link>
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
