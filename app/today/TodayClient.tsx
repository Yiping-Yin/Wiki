'use client';
/**
 * /today — the daily free-thinking surface.
 *
 * §1, §6, §11 — Loom is not a productivity dashboard. The previous version
 * of this page mounted Apple-Fitness-style daily rings, fire-emoji streaks,
 * GitHub heatmaps, "weak spots" scoring, and three nested hero sections.
 * That entire framing — "close your rings, hit your goals" — is exactly
 * the gamified surveillance UX that §11 forbids and that ChatGPT-style
 * tools mistake for engagement.
 *
 * What /today actually IS: the entry point for *today's thinking*. The
 * GlobalLiveArtifact in <main> already shows the free-mode Live Note for
 * the current date. This page's only job is to surface (a) what you read
 * today, and (b) what you've pinned for later. Nothing else. If neither
 * exists, the page is empty and the artifact below takes the surface.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuietGuideCard } from '../../components/QuietGuideCard';
import { useHistory } from '../../lib/use-history';
import { usePins } from '../../lib/use-pins';
import { REFRESH_RESUME_KEY, type RefreshResumePayload } from '../../lib/refresh-resume';
import { openPanelReview, setOverlayResume, setRefreshResume } from '../../lib/panel-resume';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../lib/learning-status';
import { useAllTraces, type Trace } from '../../lib/trace';
import { latestVisitAt } from '../../lib/trace/source-bound';

type DocLite = {
  id: string;
  title: string;
  href: string;
  category: string;
  categorySlug: string;
  subcategory: string;
  subOrder: number;
  preview: string;
};

type StudySurface = {
  id: string;
  docId: string;
  title: string;
  href: string;
  pinned: boolean;
  viewedAt: number;
  touchedAt: number;
  kind: 'knowledge' | 'wiki' | 'upload' | 'other';
  learning: LearningSurfaceSummary;
  latestSummary: string;
  latestQuote?: string;
  preview: string;
};

export function TodayClient({
  totalDocs: _totalDocs,
  docsLite,
  daily: _daily,
}: {
  totalDocs: number;
  docsLite: DocLite[];
  daily: unknown;
}) {
  const router = useRouter();
  const [history] = useHistory();
  const { pins } = usePins();
  const { traces } = useAllTraces();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const docsById = useMemo(() => {
    const m = new Map<string, DocLite>();
    for (const d of docsLite) m.set(d.id, d);
    return m;
  }, [docsLite]);

  const viewedByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      map.set(entry.id, Math.max(map.get(entry.id) ?? 0, entry.viewedAt));
    }
    return map;
  }, [history]);

  const pinnedByDocId = useMemo(() => {
    const map = new Set<string>();
    for (const pin of pins) map.add(pin.id);
    return map;
  }, [pins]);

  const surfaces = useMemo(() => {
    const byDocId = new Map<string, StudySurface>();
    const tracesByDocId = new Map<string, Trace[]>();

    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const current = tracesByDocId.get(trace.source.docId) ?? [];
      current.push(trace);
      tracesByDocId.set(trace.source.docId, current);
    }

    for (const [docId, traceSet] of tracesByDocId) {
      const trace = traceSet.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0];
      if (!trace?.source?.docId) continue;
      const meta = docsById.get(trace.source.docId);
      const viewedAt = viewedByDocId.get(trace.source.docId) ?? 0;
      let latestSummary = '';
      let latestQuote = '';
      let latestAnchorAt = 0;

      for (const sourceTrace of traceSet) {
        for (const event of sourceTrace.events) {
          if (event.kind === 'thought-anchor') {
            if (event.at >= latestAnchorAt) {
              latestAnchorAt = event.at;
              latestSummary = event.summary;
              latestQuote = event.quote ?? '';
            }
          }
        }
      }

      const kind = trace.source.href.startsWith('/knowledge/')
        ? 'knowledge'
        : trace.source.href.startsWith('/wiki/')
          ? 'wiki'
          : trace.source.href.startsWith('/uploads/')
            ? 'upload'
            : 'other';

      byDocId.set(trace.source.docId, {
        id: trace.source.docId,
        docId: trace.source.docId,
        title: meta?.title ?? trace.source.sourceTitle ?? trace.title,
        href: meta?.href ?? trace.source.href,
        pinned: pinnedByDocId.has(trace.source.docId),
        viewedAt,
        touchedAt: Math.max(
          viewedAt,
          latestAnchorAt,
          ...traceSet.map((t) => Math.max(t.updatedAt, t.crystallizedAt ?? 0, t.createdAt)),
        ),
        kind,
        learning: summarizeLearningSurface(traceSet, viewedAt),
        latestSummary,
        latestQuote: latestQuote || undefined,
        preview: meta?.preview ?? '',
      });
    }

    for (const pin of pins) {
      if (byDocId.has(pin.id)) continue;
      const meta = docsById.get(pin.id);
      const kind = pin.href.startsWith('/knowledge/')
        ? 'knowledge'
        : pin.href.startsWith('/wiki/')
          ? 'wiki'
          : pin.href.startsWith('/uploads/')
            ? 'upload'
            : 'other';
      byDocId.set(pin.id, {
        id: pin.id,
        docId: pin.id,
        title: meta?.title ?? pin.title,
        href: meta?.href ?? pin.href,
        pinned: true,
        viewedAt: viewedByDocId.get(pin.id) ?? 0,
        touchedAt: pin.pinnedAt,
        kind,
        learning: summarizeLearningSurface([], viewedByDocId.get(pin.id) ?? 0),
        latestSummary: '',
        preview: meta?.preview ?? '',
      });
    }

    const recencyRank = { stale: 0, cooling: 1, fresh: 2 } as const;
    const nextRank = { capture: 0, rehearse: 1, examine: 2, refresh: 3, revisit: 4 } as const;

    return Array.from(byDocId.values()).sort((a, b) => {
      if (nextRank[a.learning.nextAction] !== nextRank[b.learning.nextAction]) {
        return nextRank[a.learning.nextAction] - nextRank[b.learning.nextAction];
      }
      if (recencyRank[a.learning.recency] !== recencyRank[b.learning.recency]) {
        return recencyRank[a.learning.recency] - recencyRank[b.learning.recency];
      }
      return Number(b.pinned) - Number(a.pinned) || b.touchedAt - a.touchedAt;
    });
  }, [docsById, pins, traces, viewedByDocId, pinnedByDocId]);

  const captureNext = useMemo(() => {
    return surfaces.filter((surface) => surface.learning.nextAction === 'capture');
  }, [surfaces]);

  const rehearseNext = useMemo(() => {
    return surfaces.filter((surface) => surface.learning.nextAction === 'rehearse');
  }, [surfaces]);

  const weakSpots = useMemo(() => {
    return surfaces
      .filter((surface) => surface.learning.weakSpot)
      .sort((a, b) => {
        if (b.learning.retryCount !== a.learning.retryCount) {
          return b.learning.retryCount - a.learning.retryCount;
        }
        return a.learning.daysSinceTouch - b.learning.daysSinceTouch;
      });
  }, [surfaces]);

  const examineNext = useMemo(() => {
    return surfaces.filter((surface) => surface.learning.nextAction === 'examine');
  }, [surfaces]);

  const refreshNext = useMemo(() => {
    return surfaces.filter((surface) => surface.learning.nextAction === 'refresh');
  }, [surfaces]);

  const revisit = useMemo(() => {
    return surfaces.filter((surface) => surface.learning.nextAction === 'revisit');
  }, [surfaces]);

  if (!mounted) return null;
  if (surfaces.length === 0) return null;

  const focusSurface = surfaces[0] ?? null;
  const focusId = focusSurface?.id ?? null;

  const openNext = (surface: StudySurface, next: 'source' | 'rehearsal' | 'examiner' | 'review') => {
    if (next === 'source') {
      router.push(surface.href);
      return;
    }
    if (next === 'review') {
      openPanelReview(router, { href: surface.href, anchorId: surface.learning.latestAnchorId });
      return;
    }
    setOverlayResume({ href: surface.href, overlay: next });
    router.push(surface.href);
  };

  const openRefresh = (surface: StudySurface) => {
    const refreshPayload: RefreshResumePayload = { href: surface.href, source: 'today' };
    try {
      setRefreshResume(
        { href: surface.href, anchorId: surface.learning.latestAnchorId },
        refreshPayload,
      );
    } catch {}
    router.push(surface.href);
  };

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '1rem' }}>
      {focusSurface && (
        <QuietGuideCard
          eyebrow="Keep the thread warm"
          title={focusSurface.title}
          meta={
            <>
              <span>{kindLabel(focusSurface.kind)}</span>
              <span aria-hidden>·</span>
              <span>{timeOfDay(focusSurface.touchedAt)}</span>
            </>
          }
          summary={focusSurface.latestSummary || focusSurface.latestQuote || focusSurface.preview || 'Pick up the weave you left warmest.'}
          actions={[
            {
              label: todayPrimaryActionLabel(focusSurface.learning.nextAction),
              onClick: () => {
                if (focusSurface.learning.nextAction === 'refresh') openRefresh(focusSurface);
                else if (focusSurface.learning.nextAction === 'rehearse') openNext(focusSurface, 'rehearsal');
                else if (focusSurface.learning.nextAction === 'examine') openNext(focusSurface, 'examiner');
                else if (focusSurface.learning.nextAction === 'capture') openNext(focusSurface, 'source');
                else openNext(focusSurface, 'review');
              },
              primary: true,
            },
            { label: 'Open source', onClick: () => router.push(focusSurface.href) },
          ]}
        />
      )}

      {captureNext.filter((surface) => surface.id !== focusId).length > 0 && (
        <Block label="Start">
          <ScheduleList items={captureNext.filter((surface) => surface.id !== focusId)} next="source" cta="Open" onOpen={openNext} />
        </Block>
      )}

      {rehearseNext.filter((surface) => surface.id !== focusId).length > 0 && (
        <Block label="Deepen">
          <ScheduleList items={rehearseNext.filter((surface) => surface.id !== focusId)} next="rehearsal" cta="Write" onOpen={openNext} />
        </Block>
      )}

      {weakSpots.filter((surface) => surface.id !== focusId).length > 0 && (
        <Block label="Retry">
          <ScheduleList items={weakSpots.filter((surface) => surface.id !== focusId)} next="rehearsal" cta="Write again" onOpen={openNext} />
        </Block>
      )}

      {examineNext.filter((surface) => surface.id !== focusId).length > 0 && (
        <Block label="Verify">
          <ScheduleList items={examineNext.filter((surface) => surface.id !== focusId)} next="examiner" cta="Ask" onOpen={openNext} />
        </Block>
      )}

      {refreshNext.filter((surface) => surface.id !== focusId).length > 0 && (
        <Block label="Warm">
          <ScheduleList items={refreshNext.filter((surface) => surface.id !== focusId)} next="review" cta="Return" onOpen={() => {}} onPrimary={openRefresh} />
        </Block>
      )}

      {revisit.filter((surface) => surface.id !== focusId).length > 0 && (
        <Block label="Review">
          <ScheduleList items={revisit.filter((surface) => surface.id !== focusId)} next="review" cta="Review" onOpen={openNext} />
        </Block>
      )}

      <ReviewCards traces={traces} docsById={docsById} onOpenReview={openNext} />
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '1.6rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 14,
      }}>
        <span aria-hidden style={{
          width: 18, height: 1,
          background: 'var(--accent)', opacity: 0.55,
        }} />
        <span className="t-caption2" style={{
          color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.10em',
          fontWeight: 700,
        }}>{label}</span>
        <span aria-hidden style={{
          flex: 1, height: 1, background: 'var(--mat-border)',
        }} />
      </div>
      {children}
    </section>
  );
}

function ScheduleList({
  items,
  next,
  cta,
  onOpen,
  onPrimary,
}: {
  items: StudySurface[];
  next: 'source' | 'rehearsal' | 'examiner' | 'review';
  cta: string;
  onOpen?: (surface: StudySurface, next: 'source' | 'rehearsal' | 'examiner' | 'review') => void;
  onPrimary?: (surface: StudySurface) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, index) => (
        <div
          key={item.id}
          style={{
            color: 'var(--fg)',
            padding: '0.8rem 0',
            borderBottom: index < items.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span
              className="t-caption2"
              style={{
                color: item.pinned ? 'var(--accent)' : 'var(--muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {kindLabel(item.kind)}
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
            <span
              suppressHydrationWarning
              className="t-caption"
              style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {timeOfDay(item.touchedAt)}
            </span>
          </div>

          {(item.latestSummary || item.latestQuote || item.preview) && (
            <div
              style={{
                marginTop: 6,
                marginLeft: 2,
                color: 'var(--fg-secondary)',
                fontSize: '0.9rem',
                lineHeight: 1.55,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {item.latestSummary || item.latestQuote || item.preview}
            </div>
          )}

          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => (onPrimary ? onPrimary(item) : onOpen?.(item, next))}
              style={{
                padding: '0.42rem 0.72rem',
                borderRadius: 999,
                border: '0.5px solid var(--mat-border)',
                background: 'transparent',
                color: 'var(--fg)',
                fontSize: '0.76rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
            >
              {cta}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function kindLabel(kind: StudySurface['kind']) {
  switch (kind) {
    case 'knowledge':
      return 'Knowledge';
    case 'wiki':
      return 'LLM';
    case 'upload':
      return 'Upload';
    default:
      return 'Source';
  }
}

function timeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function todayPrimaryActionLabel(nextAction: LearningSurfaceSummary['nextAction']) {
  switch (nextAction) {
    case 'refresh':
      return 'Return';
    case 'rehearse':
      return 'Write';
    case 'examine':
      return 'Ask';
    case 'capture':
      return 'Open';
    default:
      return 'Review';
  }
}

/**
 * ReviewCards — flashcard-style review from recent anchored notes.
 *
 * Shows quotes from the last 3 days' anchored notes. Click to reveal
 * the summary (what you understood). Click the doc title to jump back.
 *
 * §1: only appears when there are notes to review.
 * §④: faster than flipping through a notebook.
 * No separate quiz page needed — review happens on /today.
 */
function ReviewCards({
  traces,
  docsById,
  onOpenReview,
}: {
  traces: Trace[];
  docsById: Map<string, DocLite>;
  onOpenReview: (surface: StudySurface, next: 'source' | 'rehearsal' | 'examiner' | 'review') => void;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const threeDaysAgo = Date.now() - 3 * 86400000;

  const cards = useMemo(() => {
    const out: Array<{
      quote: string;
      summary: string;
      content: string;
      docTitle: string;
      href: string;
      at: number;
      anchorId: string;
      surface: StudySurface;
    }> = [];
    for (const t of traces) {
      if (t.kind !== 'reading' || t.parentId || !t.source?.docId) continue;
      const meta = docsById.get(t.source.docId);
      const viewedAt = latestVisitAt(t);
      const learning = summarizeLearningSurface(t, viewedAt);
      const surface: StudySurface = {
        id: t.source.docId,
        docId: t.source.docId,
        title: meta?.title ?? t.source.sourceTitle ?? '',
        href: meta?.href ?? t.source.href,
        pinned: false,
        viewedAt,
        touchedAt: learning.touchedAt,
        kind: t.source.href.startsWith('/knowledge/')
          ? 'knowledge'
          : t.source.href.startsWith('/wiki/')
            ? 'wiki'
            : t.source.href.startsWith('/uploads/')
              ? 'upload'
              : 'other',
        learning,
        latestSummary: learning.latestSummary,
        latestQuote: learning.latestQuote,
        preview: meta?.preview ?? '',
      };
      for (const e of t.events) {
        if (e.kind !== 'thought-anchor') continue;
        if (e.at < threeDaysAgo) continue;
        if (!e.quote || !e.summary) continue;
        out.push({
          quote: e.quote,
          summary: e.summary,
          content: e.content,
          docTitle: meta?.title ?? t.source.sourceTitle ?? '',
          href: meta?.href ?? t.source.href,
          at: e.at,
          anchorId: e.anchorId,
          surface,
        });
      }
    }
    // Shuffle for variety
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, 5);
  }, [traces, docsById, threeDaysAgo]);

  if (cards.length === 0) return null;

  const toggle = (i: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <Block label="Review">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {cards.map((card, i) => (
          <div
            key={i}
            onClick={() => toggle(i)}
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 10,
              border: '0.5px solid var(--mat-border)',
              background: revealed.has(i) ? 'var(--accent-soft)' : 'transparent',
              cursor: 'pointer',
              transition: 'background 0.18s var(--ease)',
            }}
          >
            <div style={{
              fontSize: '0.9rem', lineHeight: 1.55,
              color: 'var(--fg)',
              fontStyle: 'italic',
            }}>
              &ldquo;{card.quote.length > 120 ? card.quote.slice(0, 117) + '…' : card.quote}&rdquo;
            </div>
            {revealed.has(i) && (
              <div style={{ marginTop: 8, animation: 'lpFade 0.18s var(--ease)' }}>
                <div style={{
                  fontSize: '0.88rem', lineHeight: 1.5,
                  color: 'var(--fg)', fontWeight: 600,
                  marginBottom: 4,
                }}>
                  {card.summary}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPanelReview(router, { href: card.href, anchorId: card.anchorId });
                      onOpenReview(card.surface, 'review');
                    }}
                    style={{
                      appearance: 'none',
                      border: 0,
                      background: 'transparent',
                      color: 'var(--accent)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    Review
                  </button>
                  <Link
                    href={card.href}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: '0.75rem', color: 'var(--fg-secondary)',
                      textDecoration: 'none',
                    }}
                  >
                    {card.docTitle}
                  </Link>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Block>
  );
}
