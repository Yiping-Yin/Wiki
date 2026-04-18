'use client';
/**
 * AnchorCard · §38 · anchored note preview / pinned note
 *
 * Hover is only a peek. Click upgrades a note into a pinned reading card.
 * Study mode uses the compact form so the page remains a thought panorama.
 */
import { forwardRef } from 'react';
import dynamic from 'next/dynamic';
import { useSmallScreen } from '../lib/use-small-screen';

// Preload on idle so first card open isn't delayed by chunk loading
const noteRendererImport = () => import('./NoteRenderer').then((m) => m.NoteRenderer);
const NoteRenderer = dynamic(noteRendererImport, { ssr: false });
if (typeof window !== 'undefined') {
  const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (fn: () => void) => setTimeout(fn, 1000);
  idle(() => { noteRendererImport(); });
}

type Props = {
  mode: 'preview' | 'pinned' | 'study';
  docTop: number;
  viewportTop: number;
  fixedRight: number;
  attentionOpacity?: number;
  summary: string;
  content: string;
  quote?: string;
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onUserActivity?: () => void;
};

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

function plainExcerpt(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const AnchorCard = forwardRef<HTMLDivElement, Props>(function AnchorCard(
  { mode, docTop, viewportTop, fixedRight, attentionOpacity = 1, summary, content, quote, onClose, onMouseEnter, onMouseLeave, onUserActivity },
  ref,
) {
  const smallScreen = useSmallScreen();
  const pinned = mode === 'pinned';
  const compact = mode !== 'pinned';
  const previewText = plainExcerpt(content || summary);
  const viewportHeight = typeof window === 'undefined' ? 900 : window.innerHeight;
  const pinnedTop = clamp(viewportTop - 8, 24, Math.max(24, viewportHeight - 460));

  return (
    <div
      ref={ref}
      onMouseEnter={() => {
        onUserActivity?.();
        onMouseEnter?.();
      }}
      onMouseLeave={onMouseLeave}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: smallScreen || pinned ? 'fixed' : 'absolute',
        top: smallScreen ? 'auto' : pinned ? pinnedTop : docTop - 8,
        right: smallScreen ? 12 : pinned ? 24 : 28,
        left: smallScreen ? 12 : 'auto',
        bottom: smallScreen ? 'max(12px, env(safe-area-inset-bottom, 0px) + 8px)' : 'auto',
        width: smallScreen ? 'auto' : pinned ? 'min(380px, calc(100vw - 48px))' : 300,
        maxHeight: smallScreen ? (pinned ? 'min(58vh, 520px)' : 'min(34vh, 280px)') : 'none',
        zIndex: pinned ? 90 : 50,
        animation: 'anchorCardIn 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        pointerEvents: 'auto',
        opacity: pinned ? attentionOpacity : 1,
        transform: pinned
          ? `translateX(${(1 - attentionOpacity) * -10}px) scale(${0.985 + attentionOpacity * 0.015})`
          : undefined,
        transformOrigin: 'left center',
        transition: pinned
          ? 'opacity 0.18s cubic-bezier(0.22, 1, 0.36, 1), transform 0.18s cubic-bezier(0.22, 1, 0.36, 1)'
          : undefined,
      }}
    >
      <div
        style={{
          background: 'var(--mat-reg-bg)',
          backdropFilter: 'var(--mat-blur)',
          WebkitBackdropFilter: 'var(--mat-blur)',
          borderRadius: smallScreen ? 'var(--r-3)' : 'var(--r-2)',
          padding: smallScreen
            ? '1rem 1.1rem'
            : pinned
              ? '1.1rem 1.2rem'
              : '0.85rem 1.1rem',
          borderLeft: smallScreen ? '0.5px solid var(--mat-border)' : '2.5px solid var(--accent)',
          borderTop: '0.5px solid var(--mat-border)',
          borderBottom: '0.5px solid var(--mat-border)',
          borderRight: '0.5px solid var(--mat-border)',
          boxShadow: smallScreen
            ? 'var(--shadow-3)'
            : pinned
              ? 'var(--shadow-3)'
              : 'var(--shadow-2)',
        }}
      >

        {pinned && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontWeight: 700,
              }}
            >
              Anchored note
            </span>
            <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
              aria-label="Close note"
              style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: '0.95rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}

        {quote && (
          <div
            style={{
              fontSize: '0.76rem',
              color: 'var(--muted)',
              fontStyle: 'italic',
              marginBottom: 8,
              lineHeight: 1.4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: compact ? 2 : 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            &ldquo;{quote}&rdquo;
          </div>
        )}

        {summary ? (
          <div
            style={{
              fontSize: pinned ? '0.9rem' : '0.85rem',
              color: 'var(--fg)',
              lineHeight: 1.5,
              fontWeight: 500,
            }}
          >
            {summary}
          </div>
        ) : !content ? (
          // Capture-only anchor — the user pressed ⌘⇧A / ⌘-click on a
          // selection but hasn't elaborated yet. Show a quiet hint so the
          // card doesn't look broken, rather than a blank area. Elaboration
          // happens in the wide state of ReviewThoughtMap.
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--muted)',
              fontStyle: 'italic',
              opacity: 0.72,
              lineHeight: 1.5,
            }}
          >
            这一纬还没织完 · ⌘/ 进入 Thought Map 继续
          </div>
        ) : null}

        {compact && previewText && previewText !== summary && (
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--fg-secondary)',
              lineHeight: 1.5,
              marginTop: 7,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: mode === 'study' ? 4 : 3,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {previewText}
          </div>
        )}

        {pinned && content && content !== summary && (
          <div
            className="prose-notion"
            onScroll={() => onUserActivity?.()}
            onMouseMove={() => onUserActivity?.()}
            style={{
              fontSize: '0.82rem',
              lineHeight: 1.55,
              color: 'var(--fg-secondary)',
              marginTop: 10,
              padding: 0,
              maxWidth: 'none',
              maxHeight: 'min(52vh, 420px)',
              overflowY: 'auto',
            }}
          >
            <NoteRenderer source={content} />
          </div>
        )}

        {mode === 'preview' && content && content !== summary && (
          <div
            className="t-caption2"
            style={{
              marginTop: 8,
              color: 'var(--muted)',
              letterSpacing: '0.04em',
            }}
          >
            click ◆ to open full note
          </div>
        )}
      </div>

      <style>{`
        @keyframes anchorCardIn {
          from { opacity: 0; transform: translateX(-4px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
});
