'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { QuietGuideCard } from '../../../components/QuietGuideCard';
import { useHistory } from '../../../lib/use-history';
import { useAllTraces, type Trace } from '../../../lib/trace';
import type { KnowledgeCategory } from '../../../lib/knowledge-types';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../../lib/learning-status';
import { continuePanelLifecycle } from '../../../lib/panel-resume';

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
          learning: summarizeLearningSurface(traceSet, viewedAt),
        } satisfies CategorySurface;
      })
      .sort((a, b) => stateRank(a) - stateRank(b) || b.touchedAt - a.touchedAt || a.subOrder - b.subOrder);
  }, [docs, tracesByDocId, viewedByDocId]);

  const continueDocs = surfaces.filter((surface) => surface.state === 'woven' || surface.state === 'opened').slice(0, 4);
  const startDoc = docs[0] ?? null;
  const continueDoc = continueDocs[0] ?? null;
  const focusDoc = continueDoc ?? startDoc;

  const openPrimaryAction = (surface: CategorySurface) => {
    continuePanelLifecycle(router, {
      href: surface.href,
      nextAction: surface.learning.nextAction,
      latestAnchorId: surface.learning.latestAnchorId,
      refreshSource: 'knowledge',
    });
  };

  return (
    <div className="prose-notion">
      <div
        className="t-caption2"
        style={{ color: 'var(--muted)', marginBottom: '0.9rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
      >
        <Link href="/knowledge" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Knowledge</Link>
        <span aria-hidden>›</span>
        <span>{category.label}</span>
      </div>

      <QuietGuideCard
        eyebrow="Collection"
        title={category.label}
        mode="inline"
        meta={continueDoc?.touchedAt ? <span>{formatWhen(continueDoc.touchedAt)}</span> : undefined}
        actions={focusDoc ? [
          {
            label: continueDoc ? 'Continue collection' : 'Open first doc',
            onClick: () => openPrimaryAction(continueDoc ?? ({ ...startDoc, state: 'new', touchedAt: 0, anchorCount: 0, latestSummary: '', learning: summarizeLearningSurface([], 0) } as CategorySurface)),
            primary: true,
          },
          { label: 'All material', href: `#${encodeURIComponent(groups[0]?.label || '_all')}` },
        ] : undefined}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
        {groups.map((group) => (
          <section
            key={group.label || '_root'}
            id={encodeURIComponent(group.label || '_all')}
            style={{ scrollMarginTop: '2rem' }}
          >
            {group.label && (
              <header style={{ padding: '0 0 0.35rem' }}>
                <div
                  className="t-caption2"
                  style={{
                    color: 'var(--muted)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {group.label}
                </div>
              </header>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {group.docs.map((doc, index) => {
                return (
                  <li
                    key={doc.id}
                    style={{
                      borderBottom: index < group.docs.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
                    }}
                  >
                    <Link
                      href={doc.href}
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 10,
                        padding: '0.7rem 0',
                        textDecoration: 'none',
                        color: 'var(--fg)',
                      }}
                    >
                      <span
                        className="t-headline"
                        style={{
                          flex: 1,
                          fontFamily: 'var(--display)',
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {doc.title}
                    </span>
                  </Link>
                </li>
              );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
