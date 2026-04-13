'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { REFRESH_RESUME_KEY, type RefreshResumePayload } from '../lib/refresh-resume';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../lib/learning-status';
import { useSmallScreen } from '../lib/use-small-screen';
import { useHistory } from '../lib/use-history';
import { useTracesForDoc, type Trace } from '../lib/trace';

export function RefreshCoach() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const smallScreen = useSmallScreen();
  const [payload, setPayload] = useState<RefreshResumePayload | null>(null);
  const [completion, setCompletion] = useState<'settled' | 'verified' | null>(null);
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
        setCompletion(null);
        return;
      }
      const parsed = JSON.parse(raw) as RefreshResumePayload;
      if (!parsed?.href || parsed.href !== pathname) {
        setPayload(null);
        setCompletion(null);
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
      setCompletion('settled');
      const id = window.setTimeout(() => dismiss(), 1800);
      prevRef.current = learning;
      return () => window.clearTimeout(id);
    }

    if (learning.examinerCount > prev.examinerCount) {
      setCompletion('verified');
      const id = window.setTimeout(() => dismiss(), 1800);
      prevRef.current = learning;
      return () => window.clearTimeout(id);
    }

    prevRef.current = learning;
  }, [payload, learning]);

  const dismiss = () => {
    try { sessionStorage.removeItem(REFRESH_RESUME_KEY); } catch {}
    setPayload(null);
    setCompletion(null);
    prevRef.current = null;
  };

  if (!payload || ctx.isFree) return null;

  const openReview = () => {
    window.dispatchEvent(new CustomEvent('loom:review:set-active', { detail: { active: true } }));
    if (learning.latestAnchorId) {
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent('loom:review:focus-thought', {
            detail: { anchorId: learning.latestAnchorId },
          }),
        );
      });
    }
  };

  const openOverlay = (id: 'rehearsal' | 'examiner') => {
    window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id } }));
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('loom:overlay:toggle', { detail: { id } }));
    });
  };

  const openKesi = () => router.push(ctx.docId ? `/kesi?focus=${encodeURIComponent(ctx.docId)}` : '/kesi');
  const primaryAction = refreshPrimaryAction(learning.nextAction);
  const bodyText = refreshBodyText(learning, payload?.source);

  return (
    <div
      style={{
        position: 'fixed',
        left: smallScreen ? 12 : 20,
        right: smallScreen ? 12 : 'auto',
        bottom: smallScreen ? 'max(12px, env(safe-area-inset-bottom, 0px) + 8px)' : 18,
        zIndex: 820,
        padding: '0.65rem 0.8rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: smallScreen ? 'none' : 360,
        borderTop: '0.5px solid var(--mat-border)',
        borderBottom: '0.5px solid var(--mat-border)',
        background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
        borderRadius: smallScreen ? 14 : 0,
        boxShadow: smallScreen ? 'var(--shadow-1)' : 'none',
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
          {completion === 'settled'
            ? 'Settled again'
            : completion === 'verified'
              ? 'Held up'
              : 'Keep this weave warm'}
        </span>
        <span className="t-caption2" style={{ color: 'var(--muted)' }}>
          {completion === 'settled'
            ? 'back in kesi'
            : completion === 'verified'
              ? 'verification complete'
              : payload?.source === 'kesi'
                ? 'return from kesi'
                : payload?.source === 'today'
                  ? 'return from today'
                  : payload?.source === 'graph'
                    ? 'return from relations'
                  : 'one more pass'}
        </span>
      </div>

      <div className="t-footnote" style={{ color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
        {completion === 'settled'
          ? 'This panel is no longer cooling. It has settled back into your kesi.'
          : completion === 'verified'
            ? 'Your latest examiner pass held. Keep going only if you want to deepen the weave.'
            : bodyText}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {completion === 'settled' ? (
          <>
            <button type="button" onClick={openKesi} style={actionStyle(true)}>
              Open panel in Kesi
            </button>
          </>
        ) : completion === 'verified' ? (
          <>
            <button type="button" onClick={openReview} style={actionStyle(true)}>
              Review
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                if (primaryAction === 'review') openReview();
                else if (primaryAction === 'rehearsal') openOverlay('rehearsal');
                else if (primaryAction === 'examiner') openOverlay('examiner');
              }}
              style={actionStyle(true)}
            >
              {primaryAction === 'review' ? 'Review' : primaryAction === 'rehearsal' ? 'Rehearse' : 'Examine'}
            </button>
          </>
        )}
        <button type="button" onClick={dismiss} style={actionStyle(false)}>
          Close
        </button>
      </div>
    </div>
  );
}

function refreshPrimaryAction(nextAction: LearningSurfaceSummary['nextAction']) {
  if (nextAction === 'rehearse') return 'rehearsal' as const;
  if (nextAction === 'examine') return 'examiner' as const;
  return 'review' as const;
}

function refreshBodyText(learning: LearningSurfaceSummary, source?: RefreshResumePayload['source']) {
  const from =
    source === 'kesi'
      ? 'from kesi'
      : source === 'today'
        ? 'from today'
        : source === 'graph'
          ? 'from relations'
          : 'from this thread';
  if (learning.nextAction === 'refresh') {
    return `You came back ${from}. Re-enter review and warm the panel back up.`;
  }
  if (learning.nextAction === 'rehearse') {
    return `You came back ${from}. The panel needs another written pass before it will hold.`;
  }
  if (learning.nextAction === 'examine') {
    return `You came back ${from}. The panel is ready to verify while the weave is still warm.`;
  }
  return `You came back ${from}. Review the current shape and decide whether to deepen or settle it.`;
}

function actionStyle(primary: boolean) {
  return {
    padding: '0.28rem 0',
    borderRadius: 999,
    border: 0,
    borderBottom: `0.5px solid ${primary ? 'var(--accent)' : 'var(--mat-border)'}`,
    background: 'transparent',
    color: primary ? 'var(--accent)' : 'var(--fg-secondary)',
    fontSize: '0.76rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  } as const;
}
