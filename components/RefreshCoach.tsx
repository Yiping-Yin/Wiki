'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { REFRESH_RESUME_KEY, type RefreshResumePayload } from '../lib/refresh-resume';

export function RefreshCoach() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const [payload, setPayload] = useState<RefreshResumePayload | null>(null);

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
    if (!payload) return;
    const onCrystallize = (e: Event) => {
      const docId = (e as CustomEvent).detail?.docId as string | undefined;
      if (!docId || docId !== ctx.docId) return;
      dismiss();
    };
    window.addEventListener('loom:crystallize', onCrystallize);
    return () => window.removeEventListener('loom:crystallize', onCrystallize);
  }, [payload, ctx.docId]);

  const dismiss = () => {
    try { sessionStorage.removeItem(REFRESH_RESUME_KEY); } catch {}
    setPayload(null);
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
      className="material-thick"
      style={{
        position: 'fixed',
        left: 20,
        bottom: 18,
        zIndex: 820,
        borderRadius: 18,
        padding: '0.8rem 0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 360,
        boxShadow: 'var(--shadow-3)',
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
          Refresh
        </span>
        <span className="t-caption2" style={{ color: 'var(--muted)' }}>
          review → rehearsal → examiner
        </span>
      </div>

      <div className="t-footnote" style={{ color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
        This doc has gone stale. Reopen the pattern, test recall, then verify it once before you leave.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={openReview} style={actionStyle(true)}>
          Review
        </button>
        <button type="button" onClick={() => openOverlay('rehearsal')} style={actionStyle(false)}>
          Rehearsal
        </button>
        <button type="button" onClick={() => openOverlay('examiner')} style={actionStyle(false)}>
          Examiner
        </button>
        <button type="button" onClick={dismiss} style={actionStyle(false)}>
          Done
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
