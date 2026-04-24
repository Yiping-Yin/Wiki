'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadSoanPayload, SOAN_RECORDS_KEY } from '../lib/loom-soan-records';

/**
 * SoanClient — the thinking-draft surface.
 *
 * Structure:
 * - Left rail (10rem): tree view of every card, grouped by kind with a
 *   small count per group. Clicking an item doesn't navigate yet — this
 *   is the visual-first pass.
 * - Canvas: ruled 40px × 40px grid, cards absolutely positioned by
 *   pixel coordinates, SVG overlay drawing support / echo edges behind
 *   them (z-index 1 for SVG, 2 for cards).
 * - Fixed footer strip along the bottom with ⇧⏎ / ⌘L / ⌘/ / ⌘⏎ hints.
 *
 * Card kinds each have a visual treatment defined in globals.css
 * (`.loom-soan-card--{kind}`): thesis wears a bronze accent band; counter
 * a rose stripe and a slight left-lean; instance a sage stripe plus a
 * quote source; question an indigo stripe and italic serif; fog a dashed
 * border and muted opacity for half-formed thoughts; weft a bronze
 * border and "echoes" tag; sketch a crosshatched background.
 *
 * Data source:
 *   Native mode prefers `loom://native/soan.json`, a direct projection of
 *   SwiftData cards and edges. Browser preview falls back to the mirror
 *   bag. When empty, the surface renders an honest empty state rather
 *   than fabricated cards.
 *
 * Drag-to-reposition:
 *   Cards register a `mousedown` handler that tracks motion on `document`
 *   and updates local state on every frame for a smooth 60fps re-render.
 *   On release we persist the final x/y via the native bridge (WKWebView
 *   → `NavigationBridgeHandler` → `LoomSoanWriter.updateCardPosition`).
 *   Swift broadcasts `loom-soan-updated` afterwards; because the native
 *   projection's x/y match the optimistic state, there is no visual
 *   jump. Drags shorter than 4px are treated as clicks so future
 *   click-to-edit interactions aren't eaten by a nudge.
 */
type CardKind = 'thesis' | 'counter' | 'instance' | 'question' | 'fog' | 'weft' | 'sketch';

type Card = {
  id: string;
  kind: CardKind;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  body: string;
  source?: string;
};

type Edge = { from: string; to: string; kind: 'support' | 'echo' };

type SoanStore = {
  cards: Card[];
  edges: Edge[];
};

/** LocalStorage key for the per-session canvas view (zoom + pan). Separate
 *  from the card store so a view-reset never touches card data, and so
 *  multi-window setups can diverge safely. Bumped to `.v1` so we can
 *  migrate schema later without silently loading an incompatible shape. */
const SOAN_VIEW_STORAGE_KEY = 'loom.soan.view.v1';

/** Pixels of motion before a mousedown is promoted from "click" to "drag".
 *  Below this the gesture is treated as a click — keeps future
 *  click-to-edit affordances responsive without needing separate buttons. */
const DRAG_ACTIVATE_THRESHOLD = 4;

/** Zoom bounds. 0.4 gives a ~40% overview for large drafts; 2.5 is far
 *  past legibility for a 0.82rem body but useful for precision drag
 *  work on a single card. Keyboard + wheel + buttons all clamp to these. */
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
/** Fraction of viewport left as margin when fit-to-content runs — keeps
 *  the outermost cards from flush against the window edge. */
const FIT_PADDING = 48;

type SoanView = { zoom: number; panX: number; panY: number };

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  if (z < ZOOM_MIN) return ZOOM_MIN;
  if (z > ZOOM_MAX) return ZOOM_MAX;
  return z;
}

function readSoanView(): SoanView {
  try {
    const raw = localStorage.getItem(SOAN_VIEW_STORAGE_KEY);
    if (!raw) return { zoom: 1, panX: 0, panY: 0 };
    const parsed = JSON.parse(raw) as Partial<SoanView> | null;
    if (!parsed || typeof parsed !== 'object') return { zoom: 1, panX: 0, panY: 0 };
    const zoom = clampZoom(typeof parsed.zoom === 'number' ? parsed.zoom : 1);
    const panX = typeof parsed.panX === 'number' && Number.isFinite(parsed.panX) ? parsed.panX : 0;
    const panY = typeof parsed.panY === 'number' && Number.isFinite(parsed.panY) ? parsed.panY : 0;
    return { zoom, panX, panY };
  } catch {
    return { zoom: 1, panX: 0, panY: 0 };
  }
}

/** Minimal shape of the WKWebView → native bridge we post to. Declared
 *  narrowly so the SSR / non-WKWebView path is a plain `undefined` check. */
type LoomNavigateBridge = {
  postMessage: (message: unknown) => void;
};
type BridgeWindow = Window & {
  webkit?: { messageHandlers?: { loomNavigate?: LoomNavigateBridge } };
};

function postSoanCardPosition(id: string, x: number, y: number): void {
  if (typeof window === 'undefined') return;
  const handler = (window as BridgeWindow).webkit?.messageHandlers?.loomNavigate;
  if (!handler) return;
  try {
    handler.postMessage({
      action: 'updateSoanCardPosition',
      payload: { id, x, y },
    });
  } catch {
    // Swallow — the optimistic UI state remains at the dragged position
    // until the next `loom-soan-updated` broadcast overrides it.
  }
}

/** Post an inline-edit commit for a Sōan card body. Mirror of the
 *  position bridge — the native side writes via `LoomSoanWriter.updateCardBody`
 *  and broadcasts `loom-soan-updated`, which our listener re-hydrates
 *  from. We update local state optimistically at the call site so the
 *  transition out of edit mode is jump-free. */
function postSoanCardBody(id: string, body: string): void {
  if (typeof window === 'undefined') return;
  const handler = (window as BridgeWindow).webkit?.messageHandlers?.loomNavigate;
  if (!handler) return;
  try {
    handler.postMessage({
      action: 'updateSoanCardBody',
      payload: { id, body },
    });
  } catch {
    // Swallow — optimistic state stays applied until the next
    // `loom-soan-updated` broadcast overrides it.
  }
}

function isCardKind(value: unknown): value is CardKind {
  return (
    value === 'thesis' || value === 'counter' || value === 'instance'
    || value === 'question' || value === 'fog' || value === 'weft'
    || value === 'sketch'
  );
}

function coerceSoanStore(raw: unknown): SoanStore {
  if (!raw || typeof raw !== 'object') return { cards: [], edges: [] };
  const rawCards = Array.isArray((raw as SoanStore).cards) ? (raw as SoanStore).cards : [];
  const rawEdges = Array.isArray((raw as SoanStore).edges) ? (raw as SoanStore).edges : [];
  const cards: Card[] = rawCards.filter((c): c is Card =>
    !!c && typeof c === 'object'
    && typeof c.id === 'string'
    && isCardKind(c.kind)
    && typeof c.x === 'number' && typeof c.y === 'number'
    && typeof c.w === 'number' && typeof c.h === 'number'
    && typeof c.body === 'string',
  );
  const validIds = new Set(cards.map((c) => c.id));
  const edges: Edge[] = rawEdges.filter((e): e is Edge =>
    !!e && typeof e === 'object'
    && typeof e.from === 'string' && typeof e.to === 'string'
    && (e.kind === 'support' || e.kind === 'echo')
    && validIds.has(e.from) && validIds.has(e.to),
  );
  return { cards, edges };
}

async function loadSoanStore(): Promise<SoanStore> {
  return coerceSoanStore(await loadSoanPayload());
}

/** Card-kind metadata for the left rail — display label, stripe color
 *  (in hex to match the in-CSS stripe colors), and rail ordering. The
 *  color is surfaced via the `--soan-group-color` custom property so the
 *  rail group label echoes each card's accent without duplicating the
 *  palette in JS. */
const KIND_META: Record<Card['kind'], { label: string; color: string }> = {
  thesis: { label: 'Thesis', color: '#9E7C3E' },
  instance: { label: 'Instance', color: '#5C6E4E' },
  counter: { label: 'Counter', color: '#8F4646' },
  question: { label: 'Question', color: '#3A477A' },
  fog: { label: 'Fog', color: '#8A8373' },
  weft: { label: 'Weft', color: '#9E7C3E' },
  sketch: { label: 'Sketch', color: '#4A4339' },
};

const KIND_ORDER: Card['kind'][] = [
  'thesis',
  'instance',
  'counter',
  'question',
  'weft',
  'sketch',
  'fog',
];

/**
 * Build a smooth SVG cubic path from one card's edge to another's.
 * Connects the closer vertical edge midpoints so the curve doesn't
 * cross the card, with control points offset horizontally for a hand-
 * drawn arc rather than a taut line.
 */
function edgePath(from: Card, to: Card): { d: string; tx: number; ty: number } {
  const fromCx = from.x + from.w / 2;
  const toCx = to.x + to.w / 2;
  // Start from the side of `from` that faces `to`; anchor horizontally
  // so edges don't start mid-card and occlude body copy.
  const fromRight = fromCx < toCx;
  const sx = fromRight ? from.x + from.w : from.x;
  const sy = from.y + from.h / 2;
  const toLeft = fromCx < toCx;
  const tx = toLeft ? to.x : to.x + to.w;
  const ty = to.y + to.h / 2;
  // Control points — halfway in X, pulled slightly past the endpoints
  // for a soft S-curve that reads as drawn, not routed.
  const midX = (sx + tx) / 2;
  const c1x = midX;
  const c1y = sy;
  const c2x = midX;
  const c2y = ty;
  const d = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
  return { d, tx, ty };
}

export default function SoanClient() {
  const [store, setStore] = useState<SoanStore>({ cards: [], edges: [] });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /** id of the card whose body is currently open in a textarea, or null.
   *  Set on double-click of a body, cleared on blur / ⌘↵ / Esc. While
   *  set, drag-to-reposition is suppressed for that card so mouse-down
   *  inside the textarea doesn't start a nudge. */
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  /** Canvas view transform — applied to `.loom-soan-canvas-inner` as a
   *  `translate(…) scale(…)` so cards + SVG edges scale together. Pan
   *  is unclamped by design (Task 4: first version, freedom > fences). */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /** Live "is user holding space" flag. Drives cursor state + enables
   *  the background-pan path on mousedown. Tracked as React state so
   *  the cursor reacts instantly to keydown/keyup. */
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** Active only while a background pan is mid-drag. Used to strip the
   *  CSS transition (so the pan tracks the cursor 1:1 without easing
   *  lag) and to switch the cursor to `grabbing`. */
  const [isPanning, setIsPanning] = useState(false);
  const canvasRef = useRef<HTMLElement | null>(null);
  /** Live mirror of `zoom` for read-access inside stable callbacks
   *  (card drag handler closure) without retriggering their `useCallback`
   *  dep array on every zoom change. */
  const zoomRef = useRef(1);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      const next = await loadSoanStore();
      if (!cancelled) setStore(next);
    };

    void refresh();

    const dispose = subscribeLoomMirror(SOAN_RECORDS_KEY, 'loom-soan-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  // Restore persisted view (zoom + pan) once on mount. Read synchronously
  // so the first paint already honours the user's previous framing —
  // avoids a "snap to 100%" flicker for returning users.
  useEffect(() => {
    const v = readSoanView();
    setZoom(v.zoom);
    setPan({ x: v.panX, y: v.panY });
  }, []);

  // Debounced persistence. A single trailing-edge write per 400ms of
  // quiet keeps localStorage writes off the hot wheel/pinch path
  // without losing the final resting view. The cleanup both cancels
  // the pending write AND flushes it, so an unmount mid-pan still saves.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          SOAN_VIEW_STORAGE_KEY,
          JSON.stringify({ zoom, panX: pan.x, panY: pan.y }),
        );
      } catch {
        // Storage full / disabled — ignore; view stays in-memory only.
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [zoom, pan.x, pan.y]);

  const { cards, edges } = store;

  const grouped = useMemo(() => {
    const byKind = new Map<Card['kind'], Card[]>();
    for (const c of cards) {
      const arr = byKind.get(c.kind) ?? [];
      arr.push(c);
      byKind.set(c.kind, arr);
    }
    return byKind;
  }, [cards]);

  // Canvas dimensions are derived from the farthest card edge plus
  // padding so the SVG overlay matches the content box exactly. The
  // min-height in CSS keeps short drafts from looking empty.
  const canvasSize = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const c of cards) {
      if (c.x + c.w > maxX) maxX = c.x + c.w;
      if (c.y + c.h > maxY) maxY = c.y + c.h;
    }
    return { w: maxX + 80, h: maxY + 120 };
  }, [cards]);

  const cardById = useMemo(() => {
    const m = new Map<string, Card>();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  /** Reset the canvas view to the default framing — 100% zoom, pan at
   *  origin. Used by ⌘0 and by the zoom-control logic on mount if the
   *  persisted state is corrupt. */
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  /** Compute a bounding box over all cards and adjust zoom + pan so the
   *  whole content fits the canvas viewport with `FIT_PADDING` margin.
   *  No-op on an empty canvas. */
  const fitToContent = useCallback(() => {
    if (cards.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of cards) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.x + c.w > maxX) maxX = c.x + c.w;
      if (c.y + c.h > maxY) maxY = c.y + c.h;
    }
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW <= 0 || contentH <= 0) return;
    const rect = canvas.getBoundingClientRect();
    const availW = Math.max(1, rect.width - FIT_PADDING * 2);
    const availH = Math.max(1, rect.height - FIT_PADDING * 2);
    const nextZoom = clampZoom(Math.min(availW / contentW, availH / contentH));
    // Center the content bbox in the viewport. Pan is applied BEFORE
    // scale (CSS `translate(...) scale(...)`) so we multiply content
    // offsets by nextZoom when translating.
    const nextPanX = FIT_PADDING - minX * nextZoom + (availW - contentW * nextZoom) / 2;
    const nextPanY = FIT_PADDING - minY * nextZoom + (availH - contentH * nextZoom) / 2;
    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  }, [cards]);

  // Keyboard — ⌘+/⌘=/⌘-/⌘0 for zoom, `1` for fit-to-content. Attached
  // on window so shortcuts work regardless of focus target (as long as
  // the user isn't typing in a text field).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField = !!target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
      );
      if (e.code === 'Space' && !inField && !spaceHeld) {
        // Default space would scroll the page; suppress so the canvas
        // can adopt it as a pan modifier.
        e.preventDefault();
        setSpaceHeld(true);
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          setZoom((z) => clampZoom(z + ZOOM_STEP));
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          setZoom((z) => clampZoom(z - ZOOM_STEP));
        } else if (e.key === '0') {
          e.preventDefault();
          resetView();
        }
        return;
      }
      if (e.key === '1' && !inField) {
        e.preventDefault();
        fitToContent();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [spaceHeld, resetView, fitToContent]);

  // Wheel — pinch (ctrlKey) zooms, plain wheel pans. Bound as a non-
  // passive listener via ref effect so `preventDefault` actually stops
  // the page-level scroll / browser zoom. Pinch-zoom is anchored at the
  // cursor so content under the cursor stays put — standard tldraw /
  // Figma feel.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        // Trackpad pinch arrives as wheel with ctrlKey. Browser's default
        // would trigger page zoom; we claim it for canvas zoom.
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        setZoom((prevZoom) => {
          const nextZoom = clampZoom(prevZoom - e.deltaY * 0.01);
          if (nextZoom === prevZoom) return prevZoom;
          // Anchor zoom at cursor: preserve the content-space point
          // under the cursor across the scale change.
          setPan((prevPan) => {
            const worldX = (cx - prevPan.x) / prevZoom;
            const worldY = (cy - prevPan.y) / prevZoom;
            return {
              x: cx - worldX * nextZoom,
              y: cy - worldY * nextZoom,
            };
          });
          return nextZoom;
        });
      } else {
        // Two-finger drag → pan. Prevent default so the page doesn't
        // also scroll the outer body when the canvas edge is reached.
        e.preventDefault();
        setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** Begin a background-pan drag. Fired by mousedown on the canvas
   *  background (or middle-click anywhere on the canvas). Pans the
   *  view 1:1 with cursor motion until mouseup. */
  const handleBackgroundMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      // Only start a pan on:
      //   - middle click (button 1) anywhere on the canvas, OR
      //   - left click (button 0) on the canvas background while space held.
      // The card's own onMouseDown stops propagation via the drag-activate
      // check, so normal left-clicks on a card never reach this handler.
      const isMiddle = event.button === 1;
      const isSpaceLeft = event.button === 0 && spaceHeld;
      if (!isMiddle && !isSpaceLeft) return;
      // If the mousedown landed on a card (or any descendant), only
      // consume it when space is held — otherwise we'd swallow clicks
      // that belong to the card. Middle-click is always ours.
      if (!isMiddle) {
        const target = event.target as HTMLElement | null;
        if (target && target.closest('.loom-soan-card')) return;
      }
      event.preventDefault();
      const startMouseX = event.clientX;
      const startMouseY = event.clientY;
      const startPanX = pan.x;
      const startPanY = pan.y;
      setIsPanning(true);
      document.body.style.userSelect = 'none';
      const onMove = (ev: MouseEvent) => {
        setPan({
          x: startPanX + (ev.clientX - startMouseX),
          y: startPanY + (ev.clientY - startMouseY),
        });
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        setIsPanning(false);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [pan.x, pan.y, spaceHeld],
  );

  /**
   * Begin a drag on the given card. Records origin mouse + card coords,
   * attaches document-level `mousemove` / `mouseup` listeners, updates
   * `store.cards[i]` optimistically on every move (clamped to canvas
   * bounds), and on release posts the final position to the native
   * bridge. Returns early if the target element signals it's being
   * edited (e.g. a `contentEditable` descendant gains focus later on) —
   * the `isEditable` check walks up from `event.target`.
   */
  const handleCardMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>, cardId: string) => {
      // Only left-button drags. Trackpad tap counts as left-button too.
      if (event.button !== 0) return;
      // Inline edit takes precedence — the textarea is a focusable
      // input and mousedowns inside it shouldn't start a reposition.
      if (editingCardId === cardId) return;
      // If the user is (or will be) editing text inside the card, bail
      // before we start tracking motion. `isContentEditable` walks up
      // the DOM so nested elements inherit correctly.
      const target = event.target as HTMLElement | null;
      if (target) {
        let node: HTMLElement | null = target;
        while (node && node !== event.currentTarget) {
          if (node.isContentEditable) return;
          const tag = node.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
          node = node.parentElement;
        }
      }

      const originalCard = cardById.get(cardId);
      if (!originalCard) return;

      const startMouseX = event.clientX;
      const startMouseY = event.clientY;
      const startX = originalCard.x;
      const startY = originalCard.y;
      // `cardW` / `cardH` are the card's box in WORLD coordinates — the
      // rendered rect is scaled by the canvas zoom, so divide it back
      // out. `minHeight` may push actual height past `c.h`, so read the
      // box live rather than using c.w / c.h.
      const el = event.currentTarget;
      const rect = el.getBoundingClientRect();
      const zoomAtStart = zoomRef.current || 1;
      const cardW = rect.width / zoomAtStart;
      const cardH = rect.height / zoomAtStart;

      let activated = false;
      let latestX = startX;
      let latestY = startY;

      const onMove = (ev: MouseEvent) => {
        const z = zoomRef.current || 1;
        // Screen-pixel delta → world-pixel delta. At zoom=2 the user
        // needs to move the mouse 2 screen pixels to nudge a card by 1
        // world pixel, so the card tracks the cursor rather than
        // racing ahead of it.
        const dx = (ev.clientX - startMouseX) / z;
        const dy = (ev.clientY - startMouseY) / z;
        if (!activated) {
          // Threshold is in screen pixels — using the raw screen delta
          // so activation timing is consistent regardless of zoom.
          if (Math.hypot(ev.clientX - startMouseX, ev.clientY - startMouseY) < DRAG_ACTIVATE_THRESHOLD) return;
          activated = true;
          setDraggingId(cardId);
          // Prevent text selection while the drag is live.
          document.body.style.userSelect = 'none';
        }
        // Clamp in world coordinates. The canvas outer section is not
        // scaled; we compare against the inner container's world size
        // (cRect.width / z) so the clamp matches card coords.
        let nx = startX + dx;
        let ny = startY + dy;
        const canvas = canvasRef.current;
        if (canvas) {
          const cRect = canvas.getBoundingClientRect();
          const worldW = cRect.width / z;
          const worldH = cRect.height / z;
          const maxX = Math.max(0, worldW - cardW);
          const maxY = Math.max(0, worldH - cardH);
          if (nx < 0) nx = 0;
          else if (nx > maxX) nx = maxX;
          if (ny < 0) ny = 0;
          else if (ny > maxY) ny = maxY;
        } else {
          if (nx < 0) nx = 0;
          if (ny < 0) ny = 0;
        }
        latestX = nx;
        latestY = ny;
        setStore((prev) => {
          // Replace the moved card, keep everything else referential so
          // React's diff only re-lays out the one card.
          const idx = prev.cards.findIndex((c) => c.id === cardId);
          if (idx === -1) return prev;
          const next = prev.cards.slice();
          next[idx] = { ...next[idx], x: nx, y: ny };
          return { cards: next, edges: prev.edges };
        });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        if (activated) {
          setDraggingId(null);
          postSoanCardPosition(cardId, latestX, latestY);
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [cardById, editingCardId],
  );

  /** Commit the current textarea value for `cardId`. Updates local state
   *  optimistically, then posts to the bridge. Called from both blur
   *  and ⌘↵. Empty bodies are accepted — the render path shows a muted
   *  "(empty)" placeholder so the card stays tappable / re-editable. */
  const commitEdit = useCallback((cardId: string, nextBody: string) => {
    setStore((prev) => {
      const idx = prev.cards.findIndex((c) => c.id === cardId);
      if (idx === -1) return prev;
      if (prev.cards[idx].body === nextBody) return prev;
      const next = prev.cards.slice();
      next[idx] = { ...next[idx], body: nextBody };
      return { cards: next, edges: prev.edges };
    });
    setEditingCardId(null);
    postSoanCardBody(cardId, nextBody);
  }, []);

  /** Abort an edit — restore the pre-edit body by simply leaving state
   *  alone (we never wrote into it) and drop edit mode. */
  const cancelEdit = useCallback(() => {
    setEditingCardId(null);
  }, []);

  const isEmpty = cards.length === 0;

  return (
    <div className="loom-soan">
      {/* Left rail — cards grouped by kind, with count chips. Keeps the
          whole draft visible at a glance; doubles as a table-of-contents
          when the sheet grows past the viewport. Renders only groups
          that have at least one card, so on a fresh install the rail is
          quiet (just the "Pieces" eyebrow) rather than listing empty
          kinds. */}
      <aside className="loom-soan-rail" aria-label="Sōan card index">
        <div className="loom-soan-rail-eyebrow">Pieces</div>
        {KIND_ORDER.map((kind) => {
          const items = grouped.get(kind);
          if (!items || items.length === 0) return null;
          const meta = KIND_META[kind];
          return (
            <div
              key={kind}
              className="loom-soan-rail-group"
              style={{ ['--soan-group-color' as string]: meta.color }}
            >
              <div className="loom-soan-rail-group-label">
                {meta.label} · {items.length}
              </div>
              {items.map((c) => (
                <div key={c.id} className="loom-soan-rail-item" title={c.body}>
                  {c.title ?? truncate(c.body, 32)}
                </div>
              ))}
            </div>
          );
        })}
      </aside>

      {/* The canvas — ruled grid, pixel-placed cards, SVG edge overlay.
          Relative positioning so every child is absolute against it.
          The outer section hosts the fixed header + empty state; all
          pannable / zoomable content lives inside `.loom-soan-canvas-inner`. */}
      <section
        ref={canvasRef}
        className="loom-soan-canvas"
        onMouseDown={handleBackgroundMouseDown}
        style={{
          minHeight: isEmpty ? undefined : `${canvasSize.h}px`,
          cursor: isPanning ? 'grabbing' : (spaceHeld ? 'grab' : 'default'),
        }}
      >
        <header className="loom-soan-header">
          <div className="loom-soan-eyebrow">Sōan · thinking draft</div>
          <h1 className="loom-soan-title">
            {isEmpty ? 'Sōan.' : 'What does it mean to stand before you sign?'}
          </h1>
          <p className="loom-soan-subtitle">
            {isEmpty
              ? 'The draft table is empty.'
              : `${cards.length} pieces on the sheet · the sheet grows with you`}
          </p>
        </header>

        {isEmpty ? (
          <div className="loom-soan-empty-wrap">
            <div className="loom-empty-state" role="note">
              <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
              <p className="loom-empty-state-copy">
                Sōan holds the cards you&apos;ve placed — thesis, counter,
                instance, question, fog, weft, sketch. Start by selecting
                a passage and adding a thesis.
              </p>
              <Link href="/sources" className="loom-empty-state-action">
                Open Sources →
              </Link>
            </div>
          </div>
        ) : (
          <div
            className={`loom-soan-canvas-inner${isPanning ? ' is-panning' : ''}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              width: `${canvasSize.w}px`,
              height: `${canvasSize.h}px`,
            }}
          >
            {/* Edges drawn before cards in DOM order, but z-index 1 keeps
                them visually beneath cards (z-index 2) regardless. */}
            <svg
              className="loom-soan-svg"
              viewBox={`0 0 ${canvasSize.w} ${canvasSize.h}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              {edges.map((e, i) => {
                const from = cardById.get(e.from);
                const to = cardById.get(e.to);
                if (!from || !to) return null;
                const { d, tx, ty } = edgePath(from, to);
                const isSupport = e.kind === 'support';
                const stroke = isSupport ? '#9E7C3E' : '#8A8373';
                const dash = isSupport ? undefined : '2 4';
                const opacity = isSupport ? 0.55 : 0.45;
                return (
                  <g key={i} opacity={opacity}>
                    <path
                      d={d}
                      stroke={stroke}
                      strokeWidth={0.8}
                      fill="none"
                      strokeDasharray={dash}
                    />
                    <circle cx={tx} cy={ty} r={1.8} fill={stroke} />
                  </g>
                );
              })}
            </svg>

            {cards.map((c) => {
              const isDragging = draggingId === c.id;
              const isEditing = editingCardId === c.id;
              return (
                <article
                  key={c.id}
                  className={`loom-soan-card loom-soan-card--${c.kind}${isDragging ? ' is-dragging' : ''}${isEditing ? ' is-editing' : ''}`}
                  onMouseDown={(event) => handleCardMouseDown(event, c.id)}
                  style={{
                    left: `${c.x}px`,
                    top: `${c.y}px`,
                    width: `${c.w}px`,
                    minHeight: `${c.h}px`,
                    cursor: isEditing ? 'text' : (isDragging ? 'grabbing' : 'grab'),
                    // Lift the active card so it reads as "picked up" and
                    // never ducks behind a neighbour it's being dragged over.
                    // Edit mode also lifts so the textarea isn't occluded
                    // by a neighbour while typing.
                    zIndex: isDragging || isEditing ? 3 : undefined,
                  }}
                >
                  {c.title && <div className="loom-soan-card-title">{c.title}</div>}
                  {isEditing ? (
                    <SoanCardEditor
                      initialValue={c.body}
                      onCommit={(next) => commitEdit(c.id, next)}
                      onCancel={cancelEdit}
                    />
                  ) : (
                    <div
                      className="loom-soan-card-body"
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setEditingCardId(c.id);
                      }}
                    >
                      {c.body.length === 0 ? (
                        <span className="loom-soan-card-body-empty">(empty)</span>
                      ) : c.kind === 'question' ? (
                        <span>
                          <span aria-hidden className="loom-soan-card-qmark">?&nbsp;</span>
                          {c.body}
                        </span>
                      ) : (
                        c.body
                      )}
                    </div>
                  )}
                  {c.source && <div className="loom-soan-card-source">{c.source}</div>}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Zoom controls — mini chip pinned to the canvas bottom-right.
          Only rendered when there's content to zoom; on empty state the
          controls would have nothing to act on. Vellum glass styling in
          globals.css keeps it quiet enough to sit over the ruled grid. */}
      {!isEmpty && (
        <div className="loom-soan-zoom-controls" role="group" aria-label="Zoom">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))}
          >
            +
          </button>
        </div>
      )}

      {/* Footer hint bar — shortcut scaffolding the editing tick will
          wire up. Fixed so it stays visible as the canvas scrolls. */}
      <footer className="loom-soan-footer" aria-label="Sōan shortcuts">
        <span>
          <kbd>⇧⏎</kbd>new
        </span>
        <span>
          <kbd>⌘L</kbd>draw relation
        </span>
        <span>
          <kbd>⌘/</kbd>ask loom
        </span>
        <span>
          <kbd>⌘⏎</kbd>promote
        </span>
      </footer>
    </div>
  );
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/^["“]|["”]$/g, '');
  return clean.length > n ? clean.slice(0, n - 1).trimEnd() + '…' : clean;
}

/**
 * Inline-edit textarea for a Sōan card body. Kept as a local component
 * so the uncontrolled input state lives in a fresh subtree each time
 * edit mode opens (no stale-value bugs when switching between cards).
 *
 * Commit paths:
 *   - Blur → save (delegated to `onCommit`)
 *   - ⌘↵ / Ctrl+↵ → save then release focus
 *   - Esc → cancel, original body stays untouched
 *
 * The textarea inherits the card body's italic EB Garamond via the
 * `loom-soan-card-body-edit` class (see globals.css); we deliberately
 * do NOT autosave on every keystroke to avoid bridge spam.
 */
function SoanCardEditor({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  /** Guard so a save-triggered blur doesn't fire `onCommit` a second
   *  time with the same value (would be harmless but noisy). */
  const committedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // Place the caret at the end so the user can keep typing without
    // first clicking. Matches the ReviewThoughtMap inline-edit feel.
    const el = textareaRef.current;
    if (!el) return;
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, []);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value);
  };

  return (
    <textarea
      ref={textareaRef}
      className="loom-soan-card-body loom-soan-card-body-edit"
      value={value}
      autoFocus
      spellCheck
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          committedRef.current = true; // suppress the onBlur commit
          onCancel();
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          commit();
        }
      }}
      onBlur={commit}
      onMouseDown={(e) => {
        // Stop the card's reposition handler from kicking in on clicks
        // inside the textarea (belt-and-braces — the outer handler
        // already bails via `editingCardId`).
        e.stopPropagation();
      }}
    />
  );
}
