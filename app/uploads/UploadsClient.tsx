'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LearningStatusInline } from '../../components/LearningStatusInline';
import { summarizeLearningStatus, type LearningStatusSummary } from '../../lib/learning-status';
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
  learning: LearningStatusSummary;
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
    touchedAt: Math.max(latestVisitAt(trace), trace.updatedAt, trace.crystallizedAt ?? 0, trace.createdAt),
    latestSummary,
    latestQuote: latestQuote || undefined,
    anchorCount,
    finished,
  };
}

function uploadSurface(item: UploadListItem, traces: Trace[]): UploadSurface {
  const docId = `upload/${item.name}`;
  const rootTrace = traces
    .filter((trace) => trace.kind === 'reading' && !trace.parentId && trace.source?.docId === docId)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0];

  if (!rootTrace) {
    return {
      ...item,
      title: uploadTitle(item.name),
      href: `/uploads/${encodeURIComponent(item.name)}`,
      state: 'new',
      touchedAt: item.mtime,
      anchorCount: 0,
      latestSummary: '',
      learning: summarizeLearningStatus(null, 0),
    };
  }

  const summary = summarizeTrace(rootTrace);
  return {
    ...item,
    title: rootTrace.source?.sourceTitle ?? uploadTitle(item.name),
    href: `/uploads/${encodeURIComponent(item.name)}`,
    state: summary.finished ? 'finished' : summary.anchorCount > 0 ? 'woven' : 'opened',
    touchedAt: Math.max(item.mtime, summary.touchedAt),
    anchorCount: summary.anchorCount,
    latestSummary: summary.latestSummary,
    latestQuote: summary.latestQuote,
    learning: summarizeLearningStatus(rootTrace, latestVisitAt(rootTrace)),
  };
}

function stateLabel(item: UploadSurface) {
  switch (item.state) {
    case 'finished':
      return 'Finished';
    case 'woven':
      return `${item.anchorCount} stitch${item.anchorCount > 1 ? 'es' : ''}`;
    case 'opened':
      return 'Opened';
    default:
      return 'New';
  }
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

function UploadBlock({
  label,
  items,
}: {
  label: string;
  items: UploadSurface[];
}) {
  if (items.length === 0) return null;

  return (
    <section style={{ marginBottom: '1.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
        <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 700 }}>
          {label}
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {items.map((item, index) => (
          <Link
            key={item.name}
            href={item.href}
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
                  color: item.state === 'finished' ? 'var(--accent)' : 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {stateLabel(item)}
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
            <div style={{ marginTop: 7 }}>
              <LearningStatusInline status={item.learning} compact />
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
              <span aria-hidden>·</span>
              <span>{formatSize(item.size)}</span>
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
    </section>
  );
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

  const openItems = surfaces.filter((item) => item.state === 'woven' || item.state === 'opened');
  const finishedItems = surfaces.filter((item) => item.state === 'finished');
  const newItems = surfaces.filter((item) => item.state === 'new');

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
        <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 700 }}>
          Uploads
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
        <UploadButton variant="button" />
      </div>

      <div
        className="material-thick"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0.55rem 0.82rem',
          borderRadius: 999,
          marginBottom: 24,
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <span
          aria-hidden
          style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1 }}
        >
          Uploads
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a source to continue…"
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: 'var(--fg)',
            fontFamily: 'var(--display)',
            fontSize: '0.92rem',
            letterSpacing: '-0.01em',
          }}
        />
        <span className="t-caption2" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {surfaces.length}
        </span>
      </div>

      {items.length === 0 && (
        <div
          className="material-thick"
          style={{
            padding: '1rem 1.1rem',
            borderRadius: 14,
            color: 'var(--muted)',
            fontStyle: 'italic',
          }}
        >
          Nothing has landed here yet. Add a file, then come back to continue weaving against it.
        </div>
      )}

      {items.length > 0 && surfaces.length === 0 && (
        <div
          className="material-thick"
          style={{
            padding: '1rem 1.1rem',
            borderRadius: 14,
            color: 'var(--muted)',
            fontStyle: 'italic',
            marginBottom: 24,
          }}
        >
          Nothing in uploads matches “{query}”.
        </div>
      )}

      <UploadBlock label="Continue" items={openItems} />
      <UploadBlock label="Finished" items={finishedItems} />
      <UploadBlock label="Recent uploads" items={newItems} />
    </div>
  );
}
