'use client';
/**
 * ActiveRetrieval · Layer 1 AI feature.
 *
 * While reading, detects the paragraph at viewport center and queries
 * for semantically similar notes from OTHER documents. Shows a small
 * blue dot in the margin when a match is found.
 *
 * Only active on reading pages (wiki/*, knowledge/*, uploads/*). Debounces scroll to
 * avoid excessive API calls. Caches results per paragraph.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { useSmallScreen } from '../lib/use-small-screen';
import { traceStore } from '../lib/trace';
import { findSimilarNotes, type SimilarNote } from '../lib/note/similarity';
import { openPanelReview } from '../lib/panel-resume';

type Match = {
  paragraphEl: HTMLElement;
  results: SimilarNote[];
  top: number; // page Y position for rendering
};

type IndexDoc = { id: string; title: string; href: string };

const DEBOUNCE_MS = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const THRESHOLD = 0.78;

let _idxCache: IndexDoc[] | null = null;
async function loadDocs(): Promise<IndexDoc[]> {
  if (_idxCache) return _idxCache;
  try {
    const r = await fetch('/api/search-index');
    if (!r.ok) return [];
    const payload = await r.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const out: IndexDoc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      out.push({
        id: String(docIds[internal] ?? internal),
        title: fields.title,
        href: fields.href,
      });
    }
    _idxCache = out;
    return out;
  } catch {
    return [];
  }
}

function inferHrefFromDocId(id: string): string {
  const w = id.match(/^wiki\/(.+)$/);
  if (w) return `/wiki/${w[1]}`;
  const k = id.match(/^know\/([^_]+(?:_[^_]+)*)__(.+)$/);
  if (k) return `/knowledge/${k[1]}/${k[2]}`;
  const u = id.match(/^upload\/(.+)$/);
  if (u) return `/uploads/${encodeURIComponent(u[1])}`;
  return '#';
}

function prettifyDocId(id: string): string {
  return id
    .replace(/^wiki\//, '')
    .replace(/^know\//, '')
    .replace(/^upload\//, '')
    .replace(/__/g, ' · ')
    .replace(/[-_]+/g, ' ');
}

function relationStrength(score: number) {
  if (score >= 0.9) return 'near';
  if (score >= 0.84) return 'close';
  return 'echo';
}

function anchorMatchScore(resultText: string, event: {
  content: string;
  summary: string;
  quote?: string;
}) {
  const haystack = [event.summary, event.quote ?? '', event.content]
    .join('\n')
    .toLowerCase();
  if (!haystack.trim()) return 0;

  let score = 0;
  const normalized = resultText.toLowerCase();
  if (normalized.includes(haystack) || haystack.includes(normalized)) score += 8;
  if (event.quote && normalized.includes(event.quote.toLowerCase())) score += 5;
  if (event.summary && normalized.includes(event.summary.toLowerCase())) score += 4;

  const tokens = normalized.split(/\s+/).filter((token) => token.length > 3);
  let overlap = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) overlap += 1;
  }
  score += Math.min(6, overlap);
  return score;
}

export function ActiveRetrieval() {
  const pathname = usePathname();
  const ctx = contextFromPathname(pathname);
  const smallScreen = useSmallScreen();
  const isReading =
    pathname.startsWith('/wiki/') ||
    pathname.startsWith('/knowledge/') ||
    pathname.startsWith('/uploads/');
  const [matches, setMatches] = useState<Match[]>([]);
  const [docsById, setDocsById] = useState<Map<string, IndexDoc>>(new Map());
  const cacheRef = useRef<Map<string, { results: SimilarNote[]; expiry: number }>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadDocs().then((docs) => {
      const next = new Map<string, IndexDoc>();
      for (const doc of docs) next.set(doc.id, doc);
      setDocsById(next);
    });
  }, []);

  const queryParagraph = useCallback(async (el: HTMLElement) => {
    const text = (el.textContent ?? '').trim().slice(0, 500);
    if (text.length < 30) return null; // Too short

    const key = text.slice(0, 100);
    const cached = cacheRef.current.get(key);
    if (cached && cached.expiry > Date.now()) return cached.results;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const r = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!r.ok) return null;
      const { vector } = await r.json();
      if (!vector) return null;

      const results = await findSimilarNotes(
        new Float32Array(vector),
        ctx.docId,
        THRESHOLD,
        3,
      );

      cacheRef.current.set(key, { results, expiry: Date.now() + CACHE_TTL_MS });
      return results;
    } catch {
      return null;
    }
  }, [ctx.docId]);

  const onScroll = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      // Find the paragraph at viewport center
      const centerY = window.innerHeight / 2;
      const prose = document.querySelector('.loom-source-prose');
      if (!prose) return;

      const children = Array.from(prose.children) as HTMLElement[];
      let closest: HTMLElement | null = null;
      let closestDist = Infinity;

      for (const child of children) {
        const rect = child.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - centerY);
        if (dist < closestDist) {
          closestDist = dist;
          closest = child;
        }
      }

      if (!closest) return;

      const results = await queryParagraph(closest);
      if (results && results.length > 0) {
        const rect = closest.getBoundingClientRect();
        setMatches([{
          paragraphEl: closest,
          results,
          top: rect.top + window.scrollY,
        }]);
      } else {
        setMatches([]);
      }
    }, DEBOUNCE_MS);
  }, [queryParagraph]);

  useEffect(() => {
    if (!isReading || ctx.isFree) return;
    window.addEventListener('scroll', onScroll, { passive: true });
    // Initial query
    const t = setTimeout(onScroll, 1000);
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(t);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isReading, ctx.isFree, onScroll]);

  // Clear matches on navigation
  useEffect(() => {
    setMatches([]);
    cacheRef.current.clear();
  }, [pathname]);

  if (!isReading || matches.length === 0) return null;

  return (
    <>
      {matches.map((m, i) => (
        <RetrievalDot key={i} match={m} docsById={docsById} smallScreen={smallScreen} />
      ))}
    </>
  );
}

function RetrievalDot({
  match,
  docsById,
  smallScreen,
}: {
  match: Match;
  docsById: Map<string, IndexDoc>;
  smallScreen: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Recalculate position from the actual DOM element
  useEffect(() => {
    const update = () => {
      const rect = match.paragraphEl.getBoundingClientRect();
      setPos({ top: rect.top + 4, left: rect.left - 16 });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [match.paragraphEl]);

  const openReview = async (result: SimilarNote) => {
    const doc = docsById.get(result.docId);
    const href = result.href ?? doc?.href ?? inferHrefFromDocId(result.docId);
    let anchorId = result.anchorId ?? null;

    if (!anchorId) {
      const traces = await traceStore.getByDoc(result.docId);
      let best: { anchorId: string; score: number; at: number } | null = null;
      for (const trace of traces) {
        if (trace.kind !== 'reading' || trace.parentId) continue;
        for (const event of trace.events) {
          if (event.kind !== 'thought-anchor') continue;
          const score = anchorMatchScore(result.text, event);
          if (!best || score > best.score || (score === best.score && event.at > best.at)) {
            best = { anchorId: event.anchorId, score, at: event.at };
          }
        }
      }
      if (best && best.score > 0) anchorId = best.anchorId;
    }

    openPanelReview(
      { push: (nextHref: string) => { window.location.href = nextHref; } },
      { href, anchorId },
    );
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: smallScreen ? 'auto' : pos.top,
        left: smallScreen ? 12 : Math.max(4, pos.left),
        right: smallScreen ? 12 : 'auto',
        bottom: smallScreen ? 'max(12px, env(safe-area-inset-bottom, 0px) + 56px)' : 'auto',
        zIndex: 50,
      }}
    >
      {/* The dot */}
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: 'var(--tint-blue, #0a84ff)',
          opacity: hovered || smallScreen ? 0.9 : 0.45,
          cursor: 'pointer',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          transform: hovered || smallScreen ? 'scale(1.5)' : 'scale(1)',
        }}
      />

      {/* Hover popover */}
      {(hovered || smallScreen) && (
        <div
          style={{
            position: 'absolute',
            top: smallScreen ? 'auto' : -8,
            left: smallScreen ? 0 : 16,
            bottom: smallScreen ? 16 : 'auto',
            width: smallScreen ? 'min(100vw - 24px, 320px)' : 280,
            padding: '10px 0 8px 10px',
            background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
            borderTop: '0.5px solid var(--mat-border)',
            borderBottom: '0.5px solid var(--mat-border)',
            fontSize: '0.76rem',
            lineHeight: 1.5,
            color: 'var(--fg)',
            zIndex: 100,
            borderRadius: smallScreen ? 14 : 0,
            boxShadow: smallScreen ? 'var(--shadow-1)' : 'none',
          }}
          onMouseLeave={smallScreen ? undefined : () => setHovered(false)}
        >
          <div style={{ fontSize: '0.62rem', color: 'var(--tint-blue, #0a84ff)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Nearby panel{match.results.length > 1 ? 's' : ''}
          </div>
          {match.results.map((r, i) => (
            <div
              key={r.noteId}
              style={{
                padding: '4px 0',
                borderTop: i > 0 ? '0.5px solid var(--mat-border)' : 'none',
              }}
            >
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                {(docsById.get(r.docId)?.title ?? prettifyDocId(r.docId))}
                <span style={{ marginLeft: 6, opacity: 0.5 }}>{Math.round(r.score * 100)}%</span>
              </div>
              <div
                className="t-caption2"
                style={{
                  marginTop: 2,
                  color: 'var(--tint-blue, #0a84ff)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontWeight: 700,
                }}
              >
                {relationStrength(r.score)}
              </div>
              <div style={{ marginTop: 2, color: 'var(--fg-secondary)' }}>
                {r.text.slice(0, 120)}{r.text.length > 120 ? '…' : ''}
              </div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => void openReview(r)}
                  style={{
                    appearance: 'none',
                    border: 0,
                    background: 'transparent',
                    color: 'var(--tint-blue, #0a84ff)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  Review
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
