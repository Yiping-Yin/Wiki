'use client';
/**
 * SelectionWarp · §25, §28, §32
 *
 * When the user selects text inside <main>, a single 1px accent-color
 * vertical hairline is planted at the right edge of the selection's last
 * line — as if a fresh warp thread were being raised next to what the
 * user just marked. The hairline itself is the affordance:
 *
 *   - At rest: 1px wide, full line-height tall, accent color, opacity 0.45
 *   - On hover: same geometry, only brighter — no expanding palette
 *   - On click: ask AI about the selection
 *   - On ⌥-click: save as highlight, cycling the tint each time
 *   - On secondary click: same as ⌥-click for mouse users
 *   - On selection clear / scroll / outside-main: it disappears
 *
 * §32 made physical: each selection raises one new warp thread. LOOM had
 * 8 — your reading raises a 9th. The act of asking the AI is the act of
 * laying down a weft against this new warp.
 */
import { useEffect, useRef, useState } from 'react';
import { contextFromPathname } from '../lib/doc-context';
import {
  ensureBlockAnchorId,
  normalizeBlockText,
  rangeTextOffsets,
  stableFragmentAnchorId,
} from '../lib/passage-locator';
import { useSmallScreen } from '../lib/use-small-screen';
import { appendEventForDoc } from '../lib/trace/source-bound';
import { captureCurrentSelection } from '../lib/capture/from-selection';
import type { SourceAnchor } from '../lib/trace/types';

const HIGHLIGHT_TINTS = [
  'var(--tint-yellow)',
  'var(--tint-pink)',
  'var(--tint-green)',
  'var(--tint-blue)',
];
const HIGHLIGHT_COLOR_KEY = 'loom:highlight:tint';

type Spot = {
  top: number;     // page y of selection's last rect top
  height: number;  // line height
  left: number;    // page x of selection's last rect right + small offset
  text: string;    // the selected text
  anchor: SourceAnchor;
  anchorId: string;
  anchorBlockId: string;
  anchorBlockText: string;
  localOffsetPx: number;
};

type Intent = 'ask' | 'capture' | 'highlight';

const MIN_LEN = 2;

function intentFromInput({
  metaKey,
  ctrlKey,
  altKey,
  button,
}: {
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  button?: number;
}): Intent {
  if (altKey || button === 2) return 'highlight';
  if (metaKey || ctrlKey) return 'capture';
  return 'ask';
}

export function SelectionWarp() {
  const smallScreen = useSmallScreen();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [hovered, setHovered] = useState(false);
  const [tint, setTint] = useState<string>(HIGHLIGHT_TINTS[0]);
  const [intent, setIntent] = useState<Intent>('ask');
  const [touchActionsOpen, setTouchActionsOpen] = useState(false);
  const warpRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem(HIGHLIGHT_COLOR_KEY);
      if (t && HIGHLIGHT_TINTS.includes(t)) setTint(t);
    } catch {}
  }, []);

  useEffect(() => {
    const timers: number[] = [];
    const defer = (fn: () => void) => {
      const id = window.setTimeout(fn, 0);
      timers.push(id);
    };

    const compute = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setSpot(null); return; }

      const range = sel.getRangeAt(0);
      const main = document.querySelector('main');
      if (!main || !main.contains(range.commonAncestorContainer)) { setSpot(null); return; }

      const text = sel.toString().trim();
      if (text.length < MIN_LEN) { setSpot(null); return; }

      const rect = range.getBoundingClientRect();
      if (rect.height < 4 || rect.width < 2) { setSpot(null); return; }

      let node: Node | null = range.commonAncestorContainer;
      while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
      if (!node) { setSpot(null); return; }
      let block: HTMLElement | null = node as HTMLElement;
      const proseContainer = block.closest('.loom-source-prose') as HTMLElement | null;
      if (!proseContainer) { setSpot(null); return; }
      while (block && block.parentElement !== proseContainer) {
        block = block.parentElement;
        if (!block) { setSpot(null); return; }
      }
      if (!block) { setSpot(null); return; }

      const blockId = ensureBlockAnchorId(block, proseContainer);
      const blockText = normalizeBlockText(block);
      const charOffsets = rangeTextOffsets(block, range);
      const anchorId = block.tagName.match(/^H[1-6]$/)
        ? blockId
        : stableFragmentAnchorId(blockId, charOffsets.start, charOffsets.end);

      const endRect = sel && sel.rangeCount > 0
        ? (() => {
            const r = sel.getRangeAt(0);
            const endRange = document.createRange();
            endRange.setStart(r.endContainer, r.endOffset);
            endRange.collapse(true);
            const er = endRange.getBoundingClientRect();
            return er.width === 0 && er.height > 0 ? er : null;
          })()
        : null;
      const anchorX = endRect
        ? endRect.left + window.scrollX + 4
        : rect.right + window.scrollX + 4;
      const anchorY = endRect
        ? endRect.top + window.scrollY
        : rect.bottom + window.scrollY - rect.height;
      const anchorH = endRect ? endRect.height : rect.height;

      setSpot({
        top: anchorY,
        height: anchorH,
        left: anchorX,
        text,
        anchorId,
        anchorBlockId: blockId,
        anchorBlockText: blockText,
        localOffsetPx: Math.max(4, anchorY - (block.getBoundingClientRect().top + window.scrollY) + 4),
        anchor: {
          paragraphId: blockId,
          blockId,
          blockText,
          offsetPx: Math.max(4, anchorY - (block.getBoundingClientRect().top + window.scrollY) + 4),
          charStart: charOffsets.start,
          charEnd: charOffsets.end,
          rangeStartId: blockId,
          rangeStartText: blockText,
          rangeEndId: blockId,
          rangeEndText: blockText,
          selection: text,
        },
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && warpRef.current && warpRef.current.contains(target)) return;
      defer(compute);
    };

    const onTouchEnd = () => { defer(compute); };

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSpot(null);
        setTouchActionsOpen(false);
      }
    };

    const onScroll = () => { setSpot(null); };
    const onPageShow = () => { defer(compute); };
    const onFocus = () => { defer(compute); };

    const onKeyChange = (e: KeyboardEvent) => {
      setIntent(intentFromInput(e));
    };
    const onWindowBlur = () => setIntent('ask');

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('keydown', onKeyChange);
    window.addEventListener('keyup', onKeyChange);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onWindowBlur);

    return () => {
      timers.forEach((id) => clearTimeout(id));
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('keydown', onKeyChange);
      window.removeEventListener('keyup', onKeyChange);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, []);

  if (!spot) return null;

  const ask = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('loom:chat:focus', {
      detail: {
        text: spot.text,
        anchorId: spot.anchorId,
        anchorBlockId: spot.anchorBlockId,
        anchorBlockText: spot.anchorBlockText,
        charStart: spot.anchor.charStart,
        charEnd: spot.anchor.charEnd,
        localOffsetPx: spot.localOffsetPx,
      },
    }));
    autoHighlight(spot.text);
    setSpot(null);
    setHovered(false);
    setTouchActionsOpen(false);
  };

  const autoHighlight = (text: string) => {
    const ctx = contextFromPathname(window.location.pathname);
    void appendEventForDoc(
      { docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle },
      { kind: 'highlight', text, tint, anchor: spot.anchor, at: Date.now() },
    ).then(() => {
      window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
    });
  };

  const highlight = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ctx = contextFromPathname(window.location.pathname);
    void appendEventForDoc(
      { docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle },
      { kind: 'highlight', text: spot.text, tint, anchor: spot.anchor, at: Date.now() },
    ).then(() => {
      window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
    });
    window.getSelection()?.removeAllRanges();
    setSpot(null);
    setHovered(false);
    setTouchActionsOpen(false);
  };

  const cycleTint = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const idx = HIGHLIGHT_TINTS.indexOf(tint);
    const next = HIGHLIGHT_TINTS[(idx + 1) % HIGHLIGHT_TINTS.length];
    setTint(next);
    try { localStorage.setItem(HIGHLIGHT_COLOR_KEY, next); } catch {}
    return next;
  };

  const trigger = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (smallScreen && e.pointerType !== 'mouse') {
      setTouchActionsOpen((open) => !open);
      return;
    }
    const nextIntent = intentFromInput(e);
    if (nextIntent === 'capture') {
      void captureCurrentSelection().then((captured) => {
        if (!captured) return;
        window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
        window.dispatchEvent(new CustomEvent('loom:capture:done', {
          detail: {
            anchorId: captured.anchorId,
            quote: captured.quote,
            reviewHint: '⌘/ 打开 Thought Map 延伸',
            viewport: { x: spot.left, y: spot.top, height: spot.height },
          },
        }));
        window.dispatchEvent(new CustomEvent('loom:capture-success', {
          detail: { label: 'Weft Woven' }
        }));
      });
      setSpot(null);
      setHovered(false);
      setTouchActionsOpen(false);
      setIntent('ask');
    } else if (nextIntent === 'highlight') {
      const text = spot.text;
      const ctx = contextFromPathname(window.location.pathname);
      void appendEventForDoc(
        { docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle },
        { kind: 'highlight', text, tint, anchor: spot.anchor, at: Date.now() },
      ).then(() => {
        window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
      });
      window.getSelection()?.removeAllRanges();
      setSpot(null);
      setHovered(false);
      setTouchActionsOpen(false);
      setIntent('ask');
    } else {
      ask(e as unknown as React.MouseEvent);
      setIntent('ask');
    }
  };

  const actionLabel = intent === 'capture' ? 'capture' : intent === 'highlight' ? 'highlight' : 'ask';
  const actionHint = intent === 'capture' ? '⌘ click' : intent === 'highlight' ? '⌥ click' : 'click';
  const threadColor = intent === 'capture' ? 'var(--tint-indigo)' : intent === 'highlight' ? tint : 'var(--accent)';
  const showLabel = !smallScreen && (hovered || intent !== 'ask');

  const capture = async () => {
    const captured = await captureCurrentSelection();
    if (!captured) return;
    window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
    window.dispatchEvent(new CustomEvent('loom:capture:done', {
      detail: {
        anchorId: captured.anchorId,
        quote: captured.quote,
        reviewHint: '⌘/ 打开 Thought Map 延伸',
        viewport: { x: spot.left, y: spot.top, height: spot.height },
      },
    }));
    window.dispatchEvent(new CustomEvent('loom:capture-success', {
      detail: { label: 'Weft Woven' }
    }));
    setSpot(null);
    setHovered(false);
    setTouchActionsOpen(false);
  };

  const highlightSelection = () => {
    const ctx = contextFromPathname(window.location.pathname);
    void appendEventForDoc(
      { docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle },
      { kind: 'highlight', text: spot.text, tint, anchor: spot.anchor, at: Date.now() },
    ).then(() => {
      window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
    });
    window.getSelection()?.removeAllRanges();
    setSpot(null);
    setHovered(false);
    setTouchActionsOpen(false);
  };

  return (
    <div
      ref={warpRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        if (intent === 'ask') return;
      }}
      onPointerDown={trigger}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        cycleTint(e);
        highlight(e);
      }}
      aria-label={`${actionLabel} this selection`}
      title="click → ask AI · ⌘ click → capture · ⌥ click → highlight · ⌘⇧A anywhere"
      style={{
        position: 'absolute',
        top: spot.top,
        left: spot.left - 20,
        height: spot.height,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 40,
        pointerEvents: 'auto',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: 'pointer',
        background: 'transparent',
      }}
    >
      {showLabel && (
        <div
          className="t-caption2"
          style={{
            position: 'absolute',
            left: 28,
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '4px 10px',
            background: 'var(--mat-reg-bg)',
            backdropFilter: 'var(--mat-blur)',
            WebkitBackdropFilter: 'var(--mat-blur)',
            border: '0.5px solid var(--mat-border)',
            borderRadius: 'var(--r-2)',
            boxShadow: 'var(--shadow-1)',
            color: threadColor,
            fontWeight: 700,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            animation: 'loom-overlay-fade-in 0.18s var(--ease) both',
          }}
        >
          <span>{actionLabel}</span>
          <span aria-hidden style={{ opacity: 0.3, width: 0.5, height: 10, background: 'var(--fg)' }} />
          <span style={{ fontSize: '0.62rem', color: 'var(--muted)', fontWeight: 600 }}>{actionHint}</span>
        </div>
      )}
      <span
        aria-hidden
        style={{
          display: 'block',
          width: hovered || intent !== 'ask' ? 3.5 : 2,
          height: '100%',
          background: threadColor,
          opacity: hovered || intent !== 'ask' ? 1 : 0.45,
          borderRadius: 4,
          boxShadow: hovered || intent !== 'ask'
            ? `0 0 14px color-mix(in srgb, ${threadColor} 45%, transparent)`
            : 'none',
          transition: 'opacity 0.18s var(--ease), box-shadow 0.18s var(--ease), background 0.18s var(--ease), width 0.18s var(--ease)',
          flexShrink: 0,
          animation: 'string-vibrate 0.4s var(--ease-spring) both',
        }}
      />
      {smallScreen && touchActionsOpen && (
        <div
          style={{
            position: 'fixed',
            left: 16,
            right: 16,
            bottom: 'max(16px, env(safe-area-inset-bottom, 0px) + 12px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '0.4rem',
            background: 'var(--mat-thick-bg)',
            backdropFilter: 'var(--mat-blur-thick)',
            WebkitBackdropFilter: 'var(--mat-blur-thick)',
            border: '0.5px solid var(--mat-border)',
            borderRadius: 'var(--r-4)',
            boxShadow: 'var(--shadow-3)',
            zIndex: 10000,
            animation: 'toastIn 0.3s var(--ease-spring) both',
          }}
        >
          <button type="button" onClick={(e) => ask(e as unknown as React.MouseEvent)} style={touchActionStyle(true)}>Ask AI</button>
          <div style={{ height: 0.5, background: 'var(--mat-border)', margin: '0 0.6rem' }} />
          <button type="button" onClick={() => void capture()} style={touchActionStyle(false)}>Capture</button>
          <div style={{ height: 0.5, background: 'var(--mat-border)', margin: '0 0.6rem' }} />
          <button type="button" onClick={highlightSelection} style={touchActionStyle(false)}>Mark / Highlight</button>
          <div style={{ height: 0.5, background: 'var(--mat-border)', margin: '0 0.6rem' }} />
          <button type="button" onClick={() => setTouchActionsOpen(false)} style={{ ...touchActionStyle(false), color: 'var(--tint-red)' }}>Cancel</button>
        </div>
      )}
      <style>{`
        @keyframes string-vibrate {
          0% { transform: scaleX(1); opacity: 0; }
          20% { transform: scaleX(1.8); opacity: 1; }
          40% { transform: scaleX(0.8); }
          60% { transform: scaleX(1.3); }
          80% { transform: scaleX(0.95); }
          100% { transform: scaleX(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function touchActionStyle(primary: boolean): React.CSSProperties {
  return {
    appearance: 'none', border: 0, background: 'transparent',
    color: primary ? 'var(--accent)' : 'var(--fg)',
    padding: '0.85rem 1rem', fontSize: '0.94rem', fontWeight: primary ? 650 : 450,
    letterSpacing: '-0.01em', cursor: 'pointer', width: '100%',
    textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}
