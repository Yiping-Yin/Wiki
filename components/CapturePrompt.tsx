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

type State = {
  anchorId: string;
  quote: string;
  reviewHint: string;
  left: number | null;
  top: number | null;
  bottom: number | null;
} | null;

export function CapturePrompt() {
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
    window.dispatchEvent(new CustomEvent('loom:review:set-active', { detail: { active: true } }));
    window.dispatchEvent(new CustomEvent('loom:review:focus-thought', {
      detail: { anchorId: state.anchorId },
    }));
    setState(null);
    setFading(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: state.left === null ? '50%' : `clamp(20px, ${state.left}px, calc(100vw - 20px))`,
        top: state.top ?? 'auto',
        bottom: state.top === null ? (state.bottom ?? 20) : 'auto',
        transform: state.left === null ? 'translateX(-50%)' : 'translateX(-18%)',
        zIndex: 920,
        opacity: fading ? 0 : 1,
        transition: 'opacity 0.35s ease, top 0.2s ease, bottom 0.2s ease, left 0.2s ease',
        maxWidth: 'min(92vw, 560px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0.48rem 0.7rem 0.48rem 0.8rem',
          borderTop: '0.5px solid var(--mat-border)',
          borderBottom: '0.5px solid var(--mat-border)',
          background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
          maxWidth: '100%',
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
        <div style={{ minWidth: 0 }}>
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
            已挂到边上 · “{state.quote}”
          </div>
          <button
            type="button"
            onClick={continueToThought}
            className="t-caption2"
            style={{
              color: 'var(--accent)',
              letterSpacing: '0.03em',
              fontWeight: 700,
              marginTop: 2,
              border: 0,
              background: 'transparent',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {state.reviewHint}
          </button>
        </div>
      </div>
    </div>
  );
}
