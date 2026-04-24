'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageFrame } from '../../components/PageFrame';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../lib/learning-status';
import { useAllTraces, type Trace } from '../../lib/trace';
import { latestVisitAt } from '../../lib/trace/source-bound';
import { UploadButton } from './UploadButton';

export type UploadListItem = {
  name: string;
  size: number;
  mtime: number;
  ext: string;
  preview: string;
};

type UploadSurface = UploadListItem & {
  title: string;
  href: string;
  state: 'new' | 'opened' | 'woven' | 'finished';
  touchedAt: number;
  anchorCount: number;
  latestSummary: string;
  latestQuote?: string;
  learning: LearningSurfaceSummary;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatWhen(ts: number) {
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < day * 2) return 'yesterday';
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 30) return `${Math.floor(diff / day / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function uploadTitle(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
}

function matchUpload(item: UploadListItem, query: string) {
  const hay = [uploadTitle(item.name), item.name, item.preview, item.ext].join(' ').toLowerCase();
  return hay.includes(query);
}

function uploadSurface(item: UploadListItem, traces: Trace[]): UploadSurface {
  const docId = `upload/${item.name}`;
  const rootTraces = traces
    .filter((trace) => trace.kind === 'reading' && !trace.parentId && trace.source?.docId === docId)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);

  if (rootTraces.length === 0) {
    return {
      ...item,
      title: uploadTitle(item.name),
      href: `/uploads/${encodeURIComponent(item.name)}`,
      state: 'new',
      touchedAt: item.mtime,
      anchorCount: 0,
      latestSummary: '',
      learning: summarizeLearningSurface([], 0),
    };
  }

  const primaryTrace = rootTraces[0];
  const summary = summarizeLearningSurface(rootTraces, latestVisitAt(primaryTrace));
  return {
    ...item,
    title: primaryTrace.source?.sourceTitle ?? uploadTitle(item.name),
    href: `/uploads/${encodeURIComponent(item.name)}`,
    state: summary.finished ? 'finished' : summary.anchorCount > 0 ? 'woven' : 'opened',
    touchedAt: Math.max(item.mtime, summary.touchedAt),
    anchorCount: summary.anchorCount,
    latestSummary: summary.latestSummary,
    latestQuote: summary.latestQuote,
    learning: summary,
  };
}

function stateOrder(item: UploadSurface) {
  switch (item.state) {
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

export function UploadsClient({ items }: { items: UploadListItem[] }) {
  const { traces } = useAllTraces();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const surfaces = useMemo(() => {
    const filtered = normalizedQuery
      ? items.filter((item) => matchUpload(item, normalizedQuery))
      : items;
    return filtered
      .map((item) => uploadSurface(item, traces))
      .sort((a, b) => stateOrder(a) - stateOrder(b) || b.touchedAt - a.touchedAt);
  }, [items, traces, normalizedQuery]);

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: 'var(--space-7)' }}>
      <PageFrame
        eyebrow="Uploads"
        title="Intake."
        description="Sources you've added. Opened ones rise above new ones."
        actions={<UploadButton variant="button" />}
      >
      <div
        className="loom-inline-search"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '0.25rem 0 0.65rem',
          marginBottom: 'var(--space-6)',
        }}
      >
        <span
          aria-hidden
          style={{ color: 'var(--muted)', fontSize: 'var(--fs-small)', lineHeight: 1 }}
        >
          ⌕
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a source…"
          aria-label="Find a source"
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: 'var(--fg)',
            fontFamily: 'var(--display)',
            fontSize: 'var(--fs-body)',
            letterSpacing: '-0.01em',
          }}
        />
      </div>

      {items.length === 0 && (
        <div
          style={{
            padding: '0.8rem 0',
            color: 'var(--muted)',
            fontStyle: 'italic',
            borderBottom: '0.5px solid var(--mat-border)',
          }}
        >
          Nothing has landed here yet. Add a file, then come back when the source is ready to hold a thread.
        </div>
      )}

      {items.length > 0 && surfaces.length === 0 && (
        <div
          style={{
            padding: '0.8rem 0',
            color: 'var(--muted)',
            fontStyle: 'italic',
            marginBottom: 24,
            borderBottom: '0.5px solid var(--mat-border)',
          }}
        >
          Nothing in intake matches “{query}”.
        </div>
      )}

      {surfaces.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {surfaces.map((item, index) => (
            <Link
              key={item.name}
              href={item.href}
              style={{
                display: 'block',
                textDecoration: 'none',
                color: 'var(--fg)',
                padding: '0.78rem 0',
                borderBottom: index < surfaces.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
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
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {item.title}
                </span>
                <span className="t-caption" style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {formatWhen(item.touchedAt)}
                </span>
              </div>

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
                {item.latestSummary || item.preview || item.latestQuote || 'Open this source to start weaving against it.'}
              </div>
              <div
                className="t-caption2"
                style={{
                  marginTop: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  color: 'var(--muted)',
                  letterSpacing: '0.04em',
                  flexWrap: 'wrap',
                }}
              >
                <span>{item.ext.slice(1).toUpperCase()}</span>
                {item.latestQuote && (
                  <>
                    <span aria-hidden>·</span>
                    <span
                      style={{
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontStyle: 'italic',
                      }}
                    >
                      {item.latestQuote.length > 90 ? `${item.latestQuote.slice(0, 90)}…` : item.latestQuote}
                    </span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      </PageFrame>
    </div>
  );
}
