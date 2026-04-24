'use client';
/**
 * CapturePrompt · tiny, zero-modal reassurance after capture.
 *
 * Current capture-first flow:
 *   1. user captures a passage
 *   2. the passage becomes a gutter thought-anchor immediately
 *   3. elaboration happens later in wide ReviewThoughtMap
 *
 * This component should therefore be a whisper, not a form.
 */
import { useEffect, useState } from 'react';
import { openLoomReview } from '../lib/ai/surface-actions';
import { useSmallScreen } from '../lib/use-small-screen';

type State = {
  anchorId: string;
  quote: string;
  reviewHint: string;
  left: number | null;
  top: number | null;
  bottom: number | null;
} | null;

export function CapturePrompt() {
  const smallScreen = useSmallScreen();
  const [state, setState] = useState<State>(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (!state) return;
    const fadeTimer = window.setTimeout(() => setFading(true), 1700);
    const hideTimer = window.setTimeout(() => {
      setState(null);
      setFading(false);
    }, 2300);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    };
  }, [state]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail ?? {};
      const anchorId = String(detail.anchorId ?? '').trim();
      const quote = String(detail.quote ?? '').trim();
      if (!quote || !anchorId) return;
      const viewport = detail.viewport ?? {};
      const anchorX = Number.isFinite(viewport.x) ? Number(viewport.x) : null;
      const anchorY = Number.isFinite(viewport.y) ? Number(viewport.y) : null;
      const anchorH = Number.isFinite(viewport.height) ? Number(viewport.height) : 0;
      const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
      const nearLowerHalf = anchorY !== null && anchorY > vh * 0.55;
      setFading(false);
      setState({
        anchorId,
        quote: quote.slice(0, 120),
        reviewHint: String(detail.reviewHint ?? '⌘/ 打开 Thought Map 延伸'),
        left: anchorX,
        top: nearLowerHalf && anchorY !== null ? Math.max(20, anchorY - 58) : null,
        bottom: !nearLowerHalf && anchorY !== null ? Math.max(20, vh - (anchorY + anchorH + 18)) : 20,
      });
    };
    window.addEventListener('loom:capture:done', handler);
    return () => window.removeEventListener('loom:capture:done', handler);
  }, []);

  if (!state) return null;

  const continueToThought = () => {
    openLoomReview(state.anchorId);
    setState(null);
    setFading(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: smallScreen
          ? '12px'
          : state.left === null
            ? '50%'
            : `clamp(20px, ${state.left}px, calc(100vw - 20px))`,
        right: smallScreen ? '12px' : 'auto',
        top: smallScreen ? 'auto' : state.top ?? 'auto',
        bottom: smallScreen
          ? 'max(12px, env(safe-area-inset-bottom, 0px) + 8px)'
          : state.top === null
            ? (state.bottom ?? 20)
            : 'auto',
        transform: smallScreen ? 'none' : state.left === null ? 'translateX(-50%)' : 'translateX(-18%)',
        zIndex: 920,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.35s ease, top 0.2s ease, bottom 0.2s ease, left 0.2s ease',
        maxWidth: 'min(92vw, 560px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '0.52rem 0.78rem 0.56rem 0.82rem',
          borderTop: '0.5px solid var(--mat-border)',
          borderBottom: '0.5px solid var(--mat-border)',
          background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
          maxWidth: '100%',
          borderRadius: smallScreen ? 14 : 0,
          boxShadow: smallScreen ? 'var(--shadow-1)' : 'none',
        }}
      >
        <span
          aria-hidden
          style={{
            color: 'var(--accent)',
            fontSize: '0.95rem',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          ◆
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            className="loom-smallcaps"
            style={{
              color: 'var(--accent)',
              fontFamily: 'var(--serif)',
              fontWeight: 500,
              fontSize: '0.84rem',
              marginBottom: 3,
            }}
          >
            Anchored
          </div>
          <div
            className="t-footnote"
            style={{
              color: 'var(--fg)',
              lineHeight: 1.4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '100%',
            }}
          >
            “{state.quote}”
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={continueToThought}
              className="t-caption2"
              style={{
                color: 'var(--accent)',
                letterSpacing: '0.03em',
                fontWeight: 700,
                border: 0,
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Review now
            </button>
            <button
              type="button"
              onClick={() => {
                setState(null);
                setFading(false);
              }}
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                letterSpacing: '0.03em',
                fontWeight: 700,
                border: 0,
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Keep reading
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
