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
import { useHistory } from '../../lib/use-history';
import { usePins } from '../../lib/use-pins';
import { useAllTraces } from '../../lib/trace';

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

const DAY_MS = 86400000;

export function TodayClient({
  totalDocs: _totalDocs,
  docsLite,
  daily: _daily,
}: {
  totalDocs: number;
  docsLite: DocLite[];
  daily: unknown;
}) {
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

  const today0 = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }, []);

  const readToday = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; title: string; href: string; viewedAt: number }[] = [];
    for (const h of history) {
      if (h.viewedAt < today0) continue;
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      const meta = docsById.get(h.id);
      out.push({
        id: h.id,
        title: meta?.title ?? h.title,
        href: meta?.href ?? h.href,
        viewedAt: h.viewedAt,
      });
    }
    return out;
  }, [history, docsById, today0]);

  // Today's thought-anchors — what you understood today
  const todayAnchors = useMemo(() => {
    const out: { docTitle: string; href: string; summary: string; at: number }[] = [];
    for (const t of traces) {
      if (t.kind !== 'reading' || t.parentId || !t.source?.docId) continue;
      for (const e of t.events) {
        if (e.kind !== 'thought-anchor' || e.at < today0) continue;
        const meta = docsById.get(t.source.docId);
        out.push({
          docTitle: meta?.title ?? t.source.sourceTitle ?? t.source.docId,
          href: meta?.href ?? t.source.href,
          summary: e.summary,
          at: e.at,
        });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }, [traces, today0, docsById]);

  if (!mounted) return null;
  if (readToday.length === 0 && pins.length === 0 && todayAnchors.length === 0) return null;

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '1rem' }}>
      {todayAnchors.length > 0 && (
        <Block label="Woven today">
          {todayAnchors.map((a, i) => (
            <Link key={i} href={a.href} style={{
              display: 'block',
              padding: '0.55rem 0',
              borderBottom: i < todayAnchors.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
              textDecoration: 'none', color: 'var(--fg)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 8,
              }}>
                <span style={{ color: 'var(--accent)', fontSize: '0.7rem', flexShrink: 0 }}>◆</span>
                <span style={{
                  flex: 1, minWidth: 0,
                  fontFamily: 'var(--display)', fontSize: '0.94rem', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.summary}</span>
                <span className="t-caption" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                  {timeOfDay(a.at)}
                </span>
              </div>
              <div className="t-caption" style={{ color: 'var(--muted)', marginLeft: 20, marginTop: 2 }}>
                {a.docTitle}
              </div>
            </Link>
          ))}
        </Block>
      )}

      {readToday.length > 0 && (
        <Block label="Read today">
          <DocList items={readToday.map((r) => ({ ...r, sub: timeOfDay(r.viewedAt) }))} />
        </Block>
      )}

      {pins.length > 0 && (
        <Block label="Pinned">
          <DocList items={pins.map((p) => ({ id: p.id, title: p.title, href: p.href, sub: '' }))} />
        </Block>
      )}

      <ReviewCards traces={traces} docsById={docsById} />
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

function DocList({
  items,
}: {
  items: { id: string; title: string; href: string; sub: string }[];
}) {
  return (
    <ul style={{
      listStyle: 'none', padding: 0, margin: 0,
      display: 'flex', flexDirection: 'column', gap: 0,
    }}>
      {items.map((it) => (
        <li key={it.id}>
          <Link
            href={it.href}
            style={{
              display: 'flex', alignItems: 'baseline', gap: 14,
              padding: '0.6rem 0',
              color: 'var(--fg)', textDecoration: 'none',
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            <span style={{
              flex: 1, minWidth: 0,
              fontFamily: 'var(--display)',
              fontSize: '1rem',
              fontWeight: 500,
              letterSpacing: '-0.012em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{it.title}</span>
            {it.sub && (
              <span suppressHydrationWarning className="t-caption" style={{
                color: 'var(--muted)', flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}>{it.sub}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function timeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
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
function ReviewCards({ traces, docsById }: { traces: any[]; docsById: Map<string, DocLite> }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const threeDaysAgo = Date.now() - 3 * 86400000;

  const cards = useMemo(() => {
    const out: { quote: string; summary: string; content: string; docTitle: string; href: string; at: number }[] = [];
    for (const t of traces) {
      if (t.kind !== 'reading' || t.parentId || !t.source?.docId) continue;
      for (const e of t.events) {
        if (e.kind !== 'thought-anchor') continue;
        if (e.at < threeDaysAgo) continue;
        if (!e.quote || !e.summary) continue;
        const meta = docsById.get(t.source.docId);
        out.push({
          quote: e.quote,
          summary: e.summary,
          content: e.content,
          docTitle: meta?.title ?? t.source.sourceTitle ?? '',
          href: meta?.href ?? t.source.href,
          at: e.at,
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
                <Link
                  href={card.href}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: '0.75rem', color: 'var(--accent)',
                    textDecoration: 'none',
                  }}
                >
                  {card.docTitle} →
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </Block>
  );
}
