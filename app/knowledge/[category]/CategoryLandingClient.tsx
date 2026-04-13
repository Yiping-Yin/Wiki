'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { CategoryHero } from '../../../components/CategoryHero';
import { KesiSwatch } from '../../../components/KesiSwatch';
import { LearningStatusInline } from '../../../components/LearningStatusInline';
import { useHistory } from '../../../lib/use-history';
import { useAllTraces, type Trace } from '../../../lib/trace';
import type { KnowledgeCategory } from '../../../lib/knowledge-types';
import { summarizeLearningStatus, type LearningStatusSummary } from '../../../lib/learning-status';

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
  learning: LearningStatusSummary;
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

function summarizeTrace(trace: Trace) {
  let latestSummary = '';
  let latestQuote = '';
  let latestAnchorAt = 0;
  let anchorCount = 0;
  let finished = false;

  for (const event of trace.events) {
    if (event.kind === 'thought-anchor') {
      anchorCount += 1;
      if (event.at >= latestAnchorAt) {
        latestAnchorAt = event.at;
        latestSummary = event.summary;
        latestQuote = event.quote ?? '';
      }
    }
    if (event.kind === 'crystallize' && !event.anchorId) finished = true;
  }

  return {
    latestSummary,
    latestQuote: latestQuote || undefined,
    anchorCount,
    finished,
    touchedAt: Math.max(trace.updatedAt, trace.crystallizedAt ?? 0, trace.createdAt, latestAnchorAt),
  };
}

function stateLabel(surface: CategorySurface) {
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

function docSummary(surface: CategorySurface) {
  if (surface.latestSummary) return surface.latestSummary;
  if (surface.preview) return surface.preview.slice(0, 220);
  if (surface.latestQuote) return surface.latestQuote;
  if (surface.subcategory) return surface.subcategory;
  return '';
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
    const map = new Map<string, Trace>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      if (!trace.source.docId.startsWith(`know/${category.slug}__`)) continue;
      const current = map.get(trace.source.docId);
      if (!current || trace.updatedAt > current.updatedAt) map.set(trace.source.docId, trace);
    }
    return map;
  }, [traces, category.slug]);

  const surfaces = useMemo(() => {
    return docs
      .map((doc) => {
        const docId = docIdFor(doc);
        const viewedAt = viewedByDocId.get(docId) ?? 0;
        const trace = tracesByDocId.get(docId);

        if (!trace) {
          return {
            ...doc,
            state: viewedAt > 0 ? 'opened' : 'new',
            touchedAt: viewedAt,
            anchorCount: 0,
            latestSummary: '',
            learning: summarizeLearningStatus(null, viewedAt),
          } satisfies CategorySurface;
        }

        const summary = summarizeTrace(trace);
        return {
          ...doc,
          state: summary.finished ? 'finished' : summary.anchorCount > 0 ? 'woven' : 'opened',
          touchedAt: Math.max(summary.touchedAt, viewedAt),
          anchorCount: summary.anchorCount,
          latestSummary: summary.latestSummary,
          latestQuote: summary.latestQuote,
          learning: summarizeLearningStatus(trace, viewedAt),
        } satisfies CategorySurface;
      })
      .sort((a, b) => stateRank(a) - stateRank(b) || b.touchedAt - a.touchedAt || a.subOrder - b.subOrder);
  }, [docs, tracesByDocId, viewedByDocId]);

  const continueDocs = surfaces.filter((surface) => surface.state === 'woven' || surface.state === 'opened').slice(0, 4);
  const finishedDocs = surfaces.filter((surface) => surface.state === 'finished').slice(0, 3);
  const startDoc = docs[0] ?? null;
  const continueDoc = continueDocs[0] ?? null;

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
      <h1 style={{ display: 'none' }}>{category.label}</h1>

      <section
        className="material-thick"
        style={{
          padding: '1rem 1.1rem',
          borderRadius: 'var(--r-3)',
          marginBottom: '1.5rem',
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Collection state
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {continueDoc && (
                <Link
                  href={continueDoc.href}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0.55rem 0.8rem',
                    borderRadius: 999,
                    border: '0.5px solid var(--mat-border)',
                    textDecoration: 'none',
                    color: 'var(--fg)',
                    boxShadow: 'var(--shadow-1)',
                  }}
                >
                  <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    Continue
                  </span>
                  <span style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>
                    {continueDoc.title}
                  </span>
                </Link>
              )}
              {startDoc && (
                <Link
                  href={startDoc.href}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0.55rem 0.8rem',
                    borderRadius: 999,
                    border: '0.5px solid var(--mat-border)',
                    textDecoration: 'none',
                    color: 'var(--fg)',
                  }}
                >
                  <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    Start
                  </span>
                  <span style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>
                    {startDoc.title}
                  </span>
                </Link>
              )}
            </div>
          </div>

          <div style={{ width: 'min(260px, 100%)', marginLeft: 'auto' }}>
            <KesiSwatch categorySlug={category.slug} height={40} />
          </div>
        </div>
      </section>

      {continueDocs.length > 0 && (
        <Block label="Continue">
          <SurfaceList items={continueDocs} />
        </Block>
      )}

      {groups.length > 1 && (
        <Block label="Course map">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {groups.map((group, index) => (
              <a
                key={group.label || '_root'}
                href={group.label ? `#${encodeURIComponent(group.label)}` : '#materials'}
                style={{
                  display: 'block',
                  textDecoration: 'none',
                  color: 'var(--fg)',
                  padding: '0.78rem 0',
                  borderBottom: index < groups.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: 'var(--display)',
                      fontSize: '1rem',
                      fontWeight: 550,
                      letterSpacing: '-0.012em',
                    }}
                  >
                    {group.label || 'Core material'}
                  </span>
                  <span className="t-caption" style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {group.docs.length}
                  </span>
                </div>
                <div
                  className="t-caption2"
                  style={{
                    marginTop: 6,
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {group.docs.slice(0, 3).map((doc) => doc.title).join(' · ')}
                </div>
              </a>
            ))}
          </div>
        </Block>
      )}

      {finishedDocs.length > 0 && (
        <Block label="Finished here">
          <SurfaceList items={finishedDocs} />
        </Block>
      )}

      <Block label="All material" id="materials">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
          {groups.map((group) => (
            <section
              key={group.label || '_root'}
              id={group.label ? encodeURIComponent(group.label) : undefined}
              style={{
                scrollMarginTop: '2rem',
                borderRadius: 'var(--r-3)',
                border: '0.5px solid var(--mat-border)',
                background: 'var(--bg-elevated)',
                boxShadow: 'var(--shadow-1)',
                overflow: 'hidden',
              }}
            >
              {group.label && (
                <header
                  style={{
                    padding: '0.85rem 1.2rem',
                    borderBottom: '0.5px solid var(--mat-border)',
                    background: 'linear-gradient(180deg, var(--surface-2), transparent)',
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
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
                  <div className="t-caption" style={{ color: 'var(--muted)', fontWeight: 600 }}>
                    {group.docs.length} {group.docs.length === 1 ? 'item' : 'items'}
                  </div>
                </header>
              )}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {group.docs.map((doc, index) => {
                  const surface = surfaces.find((item) => item.id === doc.id) ?? null;
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
                          display: 'block',
                          padding: '0.85rem 1.2rem',
                          textDecoration: 'none',
                          color: 'var(--fg)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          <span className="t-headline" style={{ fontFamily: 'var(--display)' }}>
                            {doc.title}
                          </span>
                          <span
                            className="t-caption2"
                            style={{
                              color: 'var(--muted)',
                              fontFamily: 'var(--mono)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                            }}
                          >
                            {doc.ext.slice(1)}
                          </span>
                          {surface && surface.state !== 'new' && (
                            <span
                              className="t-caption2"
                              style={{
                                color: surface.state === 'finished' ? 'var(--accent)' : 'var(--muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                fontWeight: 700,
                              }}
                            >
                              {stateLabel(surface)}
                            </span>
                          )}
                        </div>
                        {docSummary(surface ?? ({ ...doc, state: 'new', touchedAt: 0, anchorCount: 0, latestSummary: '' } as CategorySurface)) && (
                          <div
                            className="t-footnote"
                            style={{
                              color: 'var(--muted)',
                              marginTop: 4,
                              lineHeight: 1.5,
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                            }}
                          >
                            {docSummary(surface ?? ({ ...doc, state: 'new', touchedAt: 0, anchorCount: 0, latestSummary: '' } as CategorySurface))}
                          </div>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Block>
    </div>
  );
}

function Block({
  label,
  children,
  id,
}: {
  label: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} style={{ marginBottom: '1.8rem', scrollMarginTop: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
        <span
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            fontWeight: 700,
          }}
        >
          {label}
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
      </div>
      {children}
    </section>
  );
}

function SurfaceList({ items }: { items: CategorySurface[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {items.map((surface, index) => (
        <Link
          key={surface.id}
          href={surface.href}
          style={{
            display: 'block',
            textDecoration: 'none',
            color: 'var(--fg)',
            padding: '0.78rem 0',
            borderBottom: index < items.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span
              className="t-caption2"
              style={{
                color: surface.state === 'finished' ? 'var(--accent)' : 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {stateLabel(surface)}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--display)',
                fontSize: '1rem',
                fontWeight: 550,
                letterSpacing: '-0.012em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {surface.title}
            </span>
            <span className="t-caption" style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
              {formatWhen(surface.touchedAt)}
            </span>
          </div>

          {docSummary(surface) && (
            <div
              style={{
                marginTop: 6,
                color: 'var(--fg-secondary)',
                fontSize: '0.9rem',
                lineHeight: 1.55,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {docSummary(surface)}
            </div>
          )}
          <div style={{ marginTop: 7 }}>
            <LearningStatusInline status={surface.learning} compact />
          </div>
        </Link>
      ))}
    </div>
  );
}
