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
import { findSimilarNotes, type SimilarNote } from '../lib/note/similarity';

type Match = {
  paragraphEl: HTMLElement;
  results: SimilarNote[];
  top: number; // page Y position for rendering
};

const DEBOUNCE_MS = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const THRESHOLD = 0.78;

export function ActiveRetrieval() {
  const pathname = usePathname();
  const ctx = contextFromPathname(pathname);
  const isReading =
    pathname.startsWith('/wiki/') ||
    pathname.startsWith('/knowledge/') ||
    pathname.startsWith('/uploads/');
  const [matches, setMatches] = useState<Match[]>([]);
  const cacheRef = useRef<Map<string, { results: SimilarNote[]; expiry: number }>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        <RetrievalDot key={i} match={m} />
      ))}
    </>
  );
}

function RetrievalDot({ match }: { match: Match }) {
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

  return (
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left: Math.max(4, pos.left),
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
          opacity: hovered ? 0.9 : 0.45,
          cursor: 'pointer',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          transform: hovered ? 'scale(1.5)' : 'scale(1)',
        }}
      />

      {/* Hover popover */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: -8,
            left: 16,
            width: 280,
            padding: '10px 0 8px 10px',
            background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
            borderTop: '0.5px solid var(--mat-border)',
            borderBottom: '0.5px solid var(--mat-border)',
            fontSize: '0.76rem',
            lineHeight: 1.5,
            color: 'var(--fg)',
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: '0.62rem', color: 'var(--tint-blue, #0a84ff)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 6 }}>
            Nearby note{match.results.length > 1 ? 's' : ''}
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
                {r.docId.replace(/^(wiki|know)\//, '').replace(/__/g, ' · ')}
                <span style={{ marginLeft: 6, opacity: 0.5 }}>{Math.round(r.score * 100)}%</span>
              </div>
              <div style={{ marginTop: 2, color: 'var(--fg-secondary)' }}>
                {r.text.slice(0, 120)}{r.text.length > 120 ? '…' : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
