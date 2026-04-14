'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { CategoryHero } from '../../../components/CategoryHero';
import { useHistory } from '../../../lib/use-history';
import { useAllTraces, type Trace } from '../../../lib/trace';
import type { KnowledgeCategory } from '../../../lib/knowledge-types';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../../lib/learning-status';

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
};

function docIdFor(doc: CategoryDocCard) {
  return `know/${doc.id}`;
}

function stateIndicator(surface: CategorySurface) {
  switch (surface.state) {
    case 'finished':
      return { label: 'done', color: 'var(--accent)' };
    case 'woven':
      return { label: `${surface.anchorCount}`, color: 'var(--fg-secondary)' };
    case 'opened':
      return { label: '·', color: 'var(--muted)' };
    default:
      return null;
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

  const surfaceMap = useMemo(() => {
    const map = new Map<string, CategorySurface>();
    for (const doc of docs) {
      const docId = docIdFor(doc);
      const viewedAt = viewedByDocId.get(docId) ?? 0;
      const traceSet = tracesByDocId.get(docId) ?? [];
      const summary = summarizeLearningSurface(traceSet, viewedAt);
      map.set(doc.id, {
        ...doc,
        state: traceSet.length === 0
          ? (viewedAt > 0 ? 'opened' : 'new')
          : (summary.finished ? 'finished' : summary.anchorCount > 0 ? 'woven' : 'opened'),
        touchedAt: Math.max(summary.touchedAt, viewedAt),
        anchorCount: summary.anchorCount,
      });
    }
    return map;
  }, [docs, tracesByDocId, viewedByDocId]);

  return (
    <div className="prose-notion">
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.8rem' }}>
        <Link href="/knowledge">Knowledge</Link>
      </div>

      <CategoryHero
        label={category.label}
        slug={category.slug}
        count={docs.length}
        withText={docs.filter((doc) => doc.hasText).length}
        subs={category.subs}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
        {groups.map((group) => (
          <section
            key={group.label || '_root'}
            id={group.label ? encodeURIComponent(group.label) : undefined}
            style={{ scrollMarginTop: '2rem' }}
          >
            {group.label && (
              <header style={{ padding: '0 0 0.5rem' }}>
                <div
                  className="t-headline"
                  style={{
                    fontFamily: 'var(--display)',
                    letterSpacing: '-0.014em',
                    color: 'var(--fg)',
                  }}
                >
                  {group.label}
                </div>
              </header>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {group.docs.map((doc, index) => {
                const surface = surfaceMap.get(doc.id) ?? null;
                const indicator = surface ? stateIndicator(surface) : null;
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
                      {indicator && (
                        <span
                          className="t-caption2"
                          style={{
                            color: indicator.color,
                            flexShrink: 0,
                            fontWeight: 600,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {indicator.label}
                        </span>
                      )}
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
