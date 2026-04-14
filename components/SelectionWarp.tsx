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

// Lower minimum for math / code selections where text might be short
// but still meaningful (e.g. "σ(z)" = 4 chars after normalization).
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

function filteredChildren(prose: Element) {
  return Array.from(prose.children).filter((c) => {
    const node = c as HTMLElement;
    if (node.hasAttribute('data-loom-system')) return false;
    if (node.classList.contains('tag-row')) return false;
    if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return false;
    return true;
  }) as HTMLElement[];
}

function ensureBlockAnchorId(block: HTMLElement, proseContainer: HTMLElement) {
  if (block.id) return block.id;
  const children = filteredChildren(proseContainer);
  const index = children.indexOf(block);
  const stableId = `loom-block-${Math.max(0, index)}`;
  block.id = stableId;
  return stableId;
}

function rangeTextOffsets(block: HTMLElement, range: Range) {
  let start = 0;
  let end = 0;
  try {
    const startRange = document.createRange();
    startRange.selectNodeContents(block);
    startRange.setEnd(range.startContainer, range.startOffset);
    start = startRange.toString().length;

    const endRange = document.createRange();
    endRange.selectNodeContents(block);
    endRange.setEnd(range.endContainer, range.endOffset);
    end = endRange.toString().length;
  } catch {
    const text = range.toString();
    start = 0;
    end = text.length;
  }
  return {
    start: Math.max(0, Math.min(start, end)),
    end: Math.max(start, end),
  };
}

function stableFragmentAnchorId(blockId: string, charStart: number, charEnd: number) {
  return `${blockId}::frag:${Math.max(0, charStart)}-${Math.max(charStart, charEnd)}`;
}

export function SelectionWarp() {
  const smallScreen = useSmallScreen();
  const [spot, setSpot] = useState<Spot | null>(null);
  const [hovered, setHovered] = useState(false);
  const [tint, setTint] = useState<string>(HIGHLIGHT_TINTS[0]);
  const [intent, setIntent] = useState<Intent>('ask');
  const [touchActionsOpen, setTouchActionsOpen] = useState(false);
  // Ref to the warp's outer DOM element so the document-level mouseup
  // handler can detect "this click is on me, don't recompute".
  const warpRef = useRef<HTMLDivElement>(null);

  // Restore last-used highlight color
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

      // Use getBoundingClientRect instead of getClientRects — KaTeX math
      // and code blocks render with absolute-positioned spans that produce
      // fragmented or empty client rects. The bounding rect always works.
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
      const blockText = (block.innerText || block.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 280);
      const charOffsets = rangeTextOffsets(block, range);
      const anchorId = block.tagName.match(/^H[1-6]$/)
        ? blockId
        : stableFragmentAnchorId(blockId, charOffsets.start, charOffsets.end);

      // Position ✦ at the end of the selection (near the cursor release point),
      // not at the right edge of the bounding rect. This way the user's
      // pointer is already close to ✦ when they release the mouse.
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
          charStart: charOffsets.start,
          charEnd: charOffsets.end,
          selection: text,
        },
      });
    };

    // Show on mouseup (after a drag-select completes) — this avoids
    // the problem of the warp flashing during the drag itself.
    const onMouseUp = (e: MouseEvent) => {
      // If the click was on the warp itself, do NOT recompute —
      // that would re-set spot from the still-existing selection and
      // cause a re-render that interferes with the click handler.
      const target = e.target as Node | null;
      if (target && warpRef.current && warpRef.current.contains(target)) return;
      // Atlas-style: plain selection auto-opens ChatFocus immediately.
      // Modifier keys (⌘/⌥) still show ✦ for capture/highlight.
      const currentIntent = intentFromInput(e);
      if (currentIntent === 'ask') {
        defer(() => {
          compute();
          // After compute sets spot, auto-fire ask in next tick
          window.setTimeout(() => {
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
            const text = sel.toString().trim();
            if (text.length < MIN_LEN) return;
            // Check if ChatFocus is already active — don't re-open
            if (document.body.classList.contains('loom-chat-focus-active')) return;

            const range = sel.getRangeAt(0);
            const main = document.querySelector('main');
            if (!main || !main.contains(range.commonAncestorContainer)) return;

            const rect = range.getBoundingClientRect();
            if (rect.height < 4 || rect.width < 2) return;

            let node: Node | null = range.commonAncestorContainer;
            while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
            if (!node) return;
            let block: HTMLElement | null = node as HTMLElement;
            const proseContainer = block.closest('.loom-source-prose') as HTMLElement | null;
            if (!proseContainer) return;
            while (block && block.parentElement !== proseContainer) {
              block = block.parentElement;
              if (!block) return;
            }
            if (!block) return;

            const blockId = ensureBlockAnchorId(block, proseContainer);
            const blockText = (block.innerText || block.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 280);
            const charOffsets = rangeTextOffsets(block, range);
            const anchorId = block.tagName.match(/^H[1-6]$/)
              ? blockId
              : stableFragmentAnchorId(blockId, charOffsets.start, charOffsets.end);

            const endRange = document.createRange();
            endRange.setStart(range.endContainer, range.endOffset);
            endRange.collapse(true);
            const er = endRange.getBoundingClientRect();
            const localY = Math.max(4, (er.height > 0 ? er.top : rect.top) - block.getBoundingClientRect().top + 4);

            window.dispatchEvent(new CustomEvent('loom:chat:focus', {
              detail: {
                text,
                anchorId,
                anchorBlockId: blockId,
                anchorBlockText: blockText,
                charStart: charOffsets.start,
                charEnd: charOffsets.end,
                localOffsetPx: localY,
              },
            }));
            // Auto-highlight the selection
            const ctx = contextFromPathname(window.location.pathname);
            void appendEventForDoc(
              { docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle },
              { kind: 'highlight', text, tint, anchor: { paragraphId: blockId, blockId, charStart: charOffsets.start, charEnd: charOffsets.end, selection: text }, at: Date.now() },
            ).then(() => {
              window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
            });
          }, 10);
        });
      } else {
        // Modifier held — show ✦ for capture/highlight as before
        defer(compute);
      }
    };

    const onTouchEnd = () => {
      defer(compute);
    };

    // selectionchange fires when selection becomes empty (e.g. user
    // clicked elsewhere) — hide the warp in that case. We do NOT use
    // it for "show" because it fires too aggressively during drag.
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
    // §37 · trigger ChatFocus — vertical focus mode. The doc collapses
    // around the selected paragraph, an inline discussion appears below.
    // Pass explicit anchor details so ChatFocus does not depend on the
    // browser preserving the native selection after pointerdown.
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
    // §23 extended · Ask absorbs Highlight
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

  // Trigger on pointerdown so click cannot be swallowed by anything else.
  const trigger = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (smallScreen && e.pointerType !== 'mouse') {
      setTouchActionsOpen((open) => !open);
      return;
    }
    const nextIntent = intentFromInput(e);
    if (nextIntent === 'capture') {
      // ⌘-click → capture quick path: create a thought-anchor with empty
      // content/summary (just the quote). No dialog, no AI. User elaborates
      // later in the wide state of ReviewThoughtMap.
      void captureCurrentSelection().then((captured) => {
        if (!captured) return;
        window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
        window.dispatchEvent(new CustomEvent('loom:capture:done', {
          detail: {
            anchorId: captured.anchorId,
            quote: captured.quote,
            reviewHint: '⌘/ 打开 Thought Map 延伸',
            viewport: {
              x: spot.left,
              y: spot.top,
              height: spot.height,
            },
          },
        }));
      });
      setSpot(null);
      setHovered(false);
      setTouchActionsOpen(false);
      setIntent('ask');
    } else if (nextIntent === 'highlight') {
      // ⌥-click or right-click → manual highlight only (no Ask)
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

  const actionLabel = intent === 'capture'
    ? 'capture'
    : intent === 'highlight'
      ? 'highlight'
      : 'ask';
  const actionHint = intent === 'capture'
    ? '⌘ click'
    : intent === 'highlight'
      ? '⌥ click'
      : 'click';
  const threadColor = intent === 'capture'
    ? 'var(--tint-indigo)'
    : intent === 'highlight'
      ? tint
      : 'var(--accent)';
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
        viewport: {
          x: spot.left,
          y: spot.top,
          height: spot.height,
        },
      },
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
        // 40px wide click target, very forgiving for trackpad.
        // The visible thread is centered in the middle.
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
        // Ensure no parent's transform creates a stacking context confusion
        background: 'transparent',
      }}
    >
      {showLabel && (
        <div
          className="t-caption2"
          style={{
            position: 'absolute',
            left: 24,
            top: '50%',
            transform: 'translateY(-50%)',
            padding: '3px 0',
            borderBottom: `0.5px solid color-mix(in srgb, ${threadColor} 40%, transparent)`,
            background: 'color-mix(in srgb, var(--bg) 90%, transparent)',
            color: threadColor,
            fontWeight: 700,
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {actionLabel} · {actionHint}
        </div>
      )}
      <span
        aria-hidden
        style={{
          display: 'block',
          width: hovered || intent !== 'ask' ? 3 : 1.5,
          height: '100%',
          background: threadColor,
          opacity: hovered || intent !== 'ask' ? 1 : 0.6,
          borderRadius: 2,
          boxShadow: hovered || intent !== 'ask'
            ? `0 0 12px color-mix(in srgb, ${threadColor} 35%, transparent)`
            : 'none',
          transition: 'opacity 0.12s var(--ease), box-shadow 0.12s var(--ease), background 0.12s var(--ease), width 0.12s var(--ease)',
          flexShrink: 0,
        }}
      />
      {smallScreen && touchActionsOpen && (
        <div
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            bottom: 'max(12px, env(safe-area-inset-bottom, 0px) + 8px)',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            padding: '0.7rem 0.8rem',
            borderTop: '0.5px solid var(--mat-border)',
            borderBottom: '0.5px solid var(--mat-border)',
            borderRadius: 14,
            background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
            boxShadow: 'var(--shadow-2)',
            zIndex: 10000,
          }}
        >
          <button type="button" onClick={(e) => ask(e as unknown as React.MouseEvent)} style={touchActionStyle(true)}>
            Ask
          </button>
          <button type="button" onClick={() => void capture()} style={touchActionStyle(false)}>
            Capture
          </button>
          <button type="button" onClick={highlightSelection} style={touchActionStyle(false)}>
            Mark
          </button>
          <button type="button" onClick={() => setTouchActionsOpen(false)} style={touchActionStyle(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function touchActionStyle(primary: boolean): React.CSSProperties {
  return {
    appearance: 'none',
    border: 0,
    background: primary ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-elevated))' : 'transparent',
    color: primary ? 'var(--accent)' : 'var(--fg-secondary)',
    borderBottom: `0.5px solid ${primary ? 'color-mix(in srgb, var(--accent) 38%, var(--mat-border))' : 'var(--mat-border)'}`,
    padding: '0.35rem 0',
    fontSize: '0.78rem',
    fontWeight: 700,
    letterSpacing: '0.03em',
    cursor: 'pointer',
    minWidth: 64,
  };
}
