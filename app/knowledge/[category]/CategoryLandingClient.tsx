'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { QuietGuideCard } from '../../../components/QuietGuideCard';
import { StageShell } from '../../../components/StageShell';
import { WorkAction, WorkEyebrow, WorkSurface } from '../../../components/WorkSurface';
import { useHistory } from '../../../lib/use-history';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../../lib/learning-status';
import type { KnowledgeCategory } from '../../../lib/knowledge-types';
import { continuePanelLifecycle } from '../../../lib/panel-resume';
import { useAllTraces, type Trace } from '../../../lib/trace';

export type CategoryDocCard = {
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

export type CategoryGroupCard = {
  label: string;
  order: number;
  docs: CategoryDocCard[];
};

type CategorySurface = CategoryDocCard & {
  state: 'new' | 'opened' | 'woven' | 'finished';
  touchedAt: number;
  anchorCount: number;
  latestSummary: string;
  latestQuote?: string;
  learning: LearningSurfaceSummary;
};

function docIdFor(doc: CategoryDocCard) {
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

function stateRank(surface: CategorySurface) {
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

function stateLabel(surface: CategorySurface) {
  if (surface.state === 'woven') return 'Woven';
  if (surface.state === 'opened') return 'Opened';
  if (surface.state === 'finished') return 'Settled';
  return 'Unopened';
}

function extLabel(ext: string) {
  return ext.replace(/^\./, '').toUpperCase();
}

function activeSurfaceCount(surfaces: CategorySurface[]) {
  return surfaces.filter((surface) => surface.state === 'woven' || surface.state === 'opened').length;
}

function defaultSurfaceFromDoc(doc: CategoryDocCard): CategorySurface {
  return {
    ...doc,
    state: 'new',
    touchedAt: 0,
    anchorCount: 0,
    latestSummary: '',
    learning: summarizeLearningSurface([], 0),
  };
}

export function CategoryLandingClient({
  category,
  docs,
  groups,
}: {
  category: KnowledgeCategory;
  docs: CategoryDocCard[];
  groups: CategoryGroupCard[];
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
      const current = map.get(trace.source.docId) ?? [];
      current.push(trace);
      map.set(trace.source.docId, current);
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
          } satisfies CategorySurface;
        }

        const summary = summarizeLearningSurface(traceSet, viewedAt);
        return {
          ...doc,
          state: summary.finished ? 'finished' : summary.anchorCount > 0 ? 'woven' : 'opened',
          touchedAt: Math.max(summary.touchedAt, viewedAt),
          anchorCount: summary.anchorCount,
          latestSummary: summary.latestSummary,
          latestQuote: summary.latestQuote,
          learning: summary,
        } satisfies CategorySurface;
      })
      .sort((a, b) => stateRank(a) - stateRank(b) || b.touchedAt - a.touchedAt || a.subOrder - b.subOrder);
  }, [docs, tracesByDocId, viewedByDocId]);

  const continueDocs = surfaces.filter((surface) => surface.state === 'woven' || surface.state === 'opened').slice(0, 4);
  const startDoc = docs[0] ?? null;
  const continueDoc = continueDocs[0] ?? null;
  const focusDoc = continueDoc ?? (startDoc ? defaultSurfaceFromDoc(startDoc) : null);
  const activeCount = useMemo(() => activeSurfaceCount(surfaces), [surfaces]);
  const surfaceById = useMemo(
    () => new Map(surfaces.map((surface) => [surface.id, surface] as const)),
    [surfaces],
  );

  const groupSummaries = useMemo(() => {
    return groups.map((group) => {
      const docsWithSurface = group.docs.map((doc) => surfaceById.get(doc.id) ?? defaultSurfaceFromDoc(doc));
      const activeDocs = docsWithSurface.filter((surface) => surface.state === 'woven' || surface.state === 'opened');
      const latestTouchedAt = docsWithSurface.reduce((max, surface) => Math.max(max, surface.touchedAt), 0);
      return {
        group,
        activeCount: activeDocs.length,
        latestTouchedAt,
        focusSurface: activeDocs[0] ?? docsWithSurface[0] ?? null,
      };
    });
  }, [groups, surfaceById]);

  const openPrimaryAction = (surface: CategorySurface) => {
    continuePanelLifecycle(router, {
      href: surface.href,
      nextAction: surface.learning.nextAction,
      latestAnchorId: surface.learning.latestAnchorId,
      refreshSource: 'knowledge',
    });
  };

  return (
    <StageShell
      variant="archive"
      contentVariant="archive"
      innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.5rem' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          className="t-caption2"
          style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        >
          <Link href="/knowledge" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Atlas</Link>
          <span aria-hidden>›</span>
          <span>{category.label}</span>
        </div>

        <QuietGuideCard
          eyebrow="Collection"
          title={category.label}
          tone="primary"
          density="roomy"
          summary={
            continueDoc
              ? 'Continue from the current thread in this collection, then move through the material below.'
              : 'Start from the first document, then move through the collection one source at a time.'
          }
          meta={
            <span>
              {docs.length} doc{docs.length === 1 ? '' : 's'}
              {activeCount > 0 ? ` · ${activeCount} active` : ''}
              {continueDoc?.touchedAt ? ` · ${formatWhen(continueDoc.touchedAt)}` : ''}
            </span>
          }
          detail={
            <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 6 }}>
              Group headers keep the long list legible; the source rows stay quiet until a thread needs attention.
            </div>
          }
          actions={
            focusDoc
              ? [
                  {
                    label: continueDoc ? 'Continue collection' : 'Open first doc',
                    onClick: () => openPrimaryAction(focusDoc),
                    primary: true,
                  },
                  { label: 'Back to Atlas', href: '/knowledge' },
                ]
              : undefined
          }
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groupSummaries.map(({ group, activeCount: groupActiveCount, latestTouchedAt, focusSurface }) => (
            <WorkSurface key={group.label || '_root'} tone="quiet">
              <div
                id={encodeURIComponent(group.label || '_all')}
                style={{ scrollMarginTop: '2rem', display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <header
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <WorkEyebrow subtle>{group.label || 'All material'}</WorkEyebrow>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        color: 'var(--muted)',
                      }}
                    >
                      <span>{group.docs.length} item{group.docs.length === 1 ? '' : 's'}</span>
                      {groupActiveCount > 0 ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{groupActiveCount} active</span>
                        </>
                      ) : null}
                      {latestTouchedAt > 0 ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{formatWhen(latestTouchedAt)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {focusSurface ? (
                    <WorkAction
                      label={groupActiveCount > 0 ? 'Continue section' : 'Open first doc'}
                      onClick={() => openPrimaryAction(focusSurface)}
                      tone={groupActiveCount > 0 ? 'primary' : 'secondary'}
                    />
                  ) : null}
                </header>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.docs.map((doc) => {
                    const surface = surfaceById.get(doc.id) ?? defaultSurfaceFromDoc(doc);
                    const summary = surface.latestSummary || doc.preview;
                    return (
                      <Link
                        key={doc.id}
                        href={doc.href}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 16,
                          padding: '0.98rem 1rem',
                          textDecoration: 'none',
                          color: 'var(--fg)',
                          borderRadius: 'var(--r-3)',
                          border: '0.5px solid color-mix(in srgb, var(--mat-border) 80%, transparent)',
                          background: 'color-mix(in srgb, var(--mat-thick-bg) 74%, transparent)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.24)',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: 'var(--display)',
                              fontSize: '1rem',
                              fontWeight: 560,
                              letterSpacing: '-0.015em',
                              lineHeight: 1.25,
                            }}
                          >
                            {doc.title}
                          </div>

                          <div
                            className="t-caption2"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexWrap: 'wrap',
                              color: 'var(--muted)',
                              marginTop: 5,
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                borderRadius: 999,
                                border: '0.5px solid color-mix(in srgb, var(--mat-border) 86%, transparent)',
                                padding: '0.16rem 0.48rem',
                                color: 'var(--fg-secondary)',
                              }}
                            >
                              {stateLabel(surface)}
                            </span>
                            {surface.touchedAt ? (
                              <>
                                <span aria-hidden>·</span>
                                <span>{formatWhen(surface.touchedAt)}</span>
                              </>
                            ) : null}
                            {surface.anchorCount > 0 ? (
                              <>
                                <span aria-hidden>·</span>
                                <span>{surface.anchorCount} anchor{surface.anchorCount === 1 ? '' : 's'}</span>
                              </>
                            ) : null}
                          </div>

                          {summary ? (
                            <div
                              style={{
                                color: 'var(--fg-secondary)',
                                fontSize: '0.84rem',
                                lineHeight: 1.48,
                                marginTop: 6,
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {summary}
                            </div>
                          ) : null}
                        </div>

                        <div
                          className="t-caption2"
                          style={{
                            color: 'var(--muted)',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            flexShrink: 0,
                            paddingTop: 2,
                          }}
                        >
                          {extLabel(doc.ext)}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </WorkSurface>
          ))}
        </div>
      </div>
    </StageShell>
  );
}
