'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { REFRESH_RESUME_KEY, type RefreshResumePayload } from '../lib/refresh-resume';
import { summarizeLearningSurface } from '../lib/learning-status';
import { useHistory } from '../lib/use-history';
import { useTracesForDoc, type Trace } from '../lib/trace';

export function RefreshCoach() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const [payload, setPayload] = useState<RefreshResumePayload | null>(null);
  const [history] = useHistory();
  const { traces } = useTracesForDoc(ctx.isFree ? null : ctx.docId);
  const prevRef = useRef<ReturnType<typeof summarizeLearningSurface> | null>(null);

  const readingTraces = useMemo(
    () => traces.filter((trace) => trace.kind === 'reading' && !trace.parentId) as Trace[],
    [traces],
  );
  const viewedAt = useMemo(() => {
    const current = history.find((entry) => entry.id === ctx.docId);
    return current?.viewedAt ?? 0;
  }, [history, ctx.docId]);
  const learning = useMemo(
    () => summarizeLearningSurface(readingTraces, viewedAt),
    [readingTraces, viewedAt],
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REFRESH_RESUME_KEY);
      if (!raw) {
        setPayload(null);
        return;
      }
      const parsed = JSON.parse(raw) as RefreshResumePayload;
      if (!parsed?.href || parsed.href !== pathname) {
        setPayload(null);
        return;
      }
      setPayload(parsed);
    } catch {
      setPayload(null);
    }
  }, [pathname]);

  useEffect(() => {
    if (!payload) {
      prevRef.current = null;
      return;
    }
    const prev = prevRef.current;
    if (!prev) {
      prevRef.current = learning;
      return;
    }

    if (learning.crystallized && !prev.crystallized) {
      const id = window.setTimeout(() => dismiss(), 1800);
      prevRef.current = learning;
      return () => window.clearTimeout(id);
    }

    if (learning.examinerCount > prev.examinerCount) {
      const id = window.setTimeout(() => dismiss(), 1800);
      prevRef.current = learning;
      return () => window.clearTimeout(id);
    }

    prevRef.current = learning;
  }, [payload, learning]);

  const dismiss = () => {
    try { sessionStorage.removeItem(REFRESH_RESUME_KEY); } catch {}
    setPayload(null);
    prevRef.current = null;
  };

  if (!payload || ctx.isFree) return null;

  const openReview = () => {
    window.dispatchEvent(new CustomEvent('loom:review:set-active', { detail: { active: true } }));
  };

  const openOverlay = (id: 'rehearsal' | 'examiner') => {
    window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id } }));
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('loom:overlay:toggle', { detail: { id } }));
    });
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 20,
        bottom: 18,
        zIndex: 820,
        padding: '0.65rem 0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 360,
        borderTop: '0.5px solid var(--mat-border)',
        borderBottom: '0.5px solid var(--mat-border)',
        background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className="t-caption2"
          style={{
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
          }}
        >
          Return to this thread
        </span>
        <span className="t-caption2" style={{ color: 'var(--muted)' }}>
          one more pass
        </span>
      </div>

      <div className="t-footnote" style={{ color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
        Read a little, write once, ask once.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={openReview} style={actionStyle(true)}>
          Review
        </button>
        <button type="button" onClick={() => openOverlay('rehearsal')} style={actionStyle(false)}>
          Write
        </button>
        <button type="button" onClick={() => openOverlay('examiner')} style={actionStyle(false)}>
          Ask
        </button>
        <button type="button" onClick={dismiss} style={actionStyle(false)}>
          Close
        </button>
      </div>
    </div>
  );
}

function actionStyle(primary: boolean) {
  return {
    padding: '0.42rem 0.72rem',
    borderRadius: 999,
    border: `0.5px solid ${primary ? 'var(--accent)' : 'var(--mat-border)'}`,
    background: primary ? 'var(--accent-soft)' : 'transparent',
    color: primary ? 'var(--fg)' : 'var(--fg-secondary)',
    fontSize: '0.76rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  } as const;
}
