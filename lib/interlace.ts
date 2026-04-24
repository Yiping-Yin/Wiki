/**
 * Interlace — Loom's AI margin summoning pattern.
 *
 * When the reader selects text inside a `.prose-notion` page and triggers
 * ⌘E, the page recedes, the selection is warmly rubbed with a bronze
 * underline, and a margin note pops in with a dashed bronze curve
 * connecting the passage to the AI's response. The response streams in
 * italic serif while the curve's dashoffset advances from 80% → 0, so the
 * visual thread "draws itself" as the AI speaks.
 *
 * This module is dependency-free (vanilla DOM) so it can attach to any
 * page the reader is on. It exposes `window.__loomInterlace.open(...)`
 * so the Swift ⌘E bridge can summon it without routing through React.
 *
 * Single-instance: only one Interlace is ever mounted; calling open()
 * while one is active dismisses the existing one first.
 */

type OpenOptions = {
  selection?: string;
  sourceTitle?: string;
  /**
   * Optional pre-captured selection rect (viewport coords, top/left/right/
   * bottom). If omitted, we read `window.getSelection()` on summon.
   * Also accepts a `DOMRect` as callers from Review pass the live rect.
   */
  rect?:
    | { top: number; left: number; right: number; bottom: number }
    | DOMRect;
  /** When true, skip the AI stream and seed the body with a follow-up input. */
  asFollowUp?: boolean;
  /** Seed text for the follow-up input when `asFollowUp` is true. */
  priorThought?: string;
};

type LoomInterlaceAPI = {
  open(opts?: OpenOptions): boolean;
  close(): void;
  isOpen(): boolean;
  keepAsking(priorThought: string): void;
};

type StreamBridge = { postMessage: (payload: unknown) => void };
type AIWindow = Window & {
  webkit?: { messageHandlers?: { loomAIStream?: StreamBridge } };
  __loomAI?: {
    onChunk: (id: string, text: string) => void;
    onDone: (id: string) => void;
    onError: (id: string, message: string) => void;
  };
  __loomInterlace?: LoomInterlaceAPI;
  __loomReview?: {
    addThought: (text: string, section?: string) => void;
  };
};

type ActiveInstance = {
  note: HTMLElement;
  svg: SVGSVGElement;
  curvePath: SVGPathElement;
  curveDot: SVGCircleElement;
  bodyEl: HTMLElement;
  decoratedBlock: HTMLElement | null;
  selectedText: string;
  sourceTitle: string;
  anchorRect: { top: number; left: number; right: number; bottom: number };
  streamId: string | null;
  scrollHandler: (() => void) | null;
  resizeHandler: (() => void) | null;
  keyHandler: ((e: KeyboardEvent) => void) | null;
  outsideClickHandler: ((e: MouseEvent) => void) | null;
  routeHandler: (() => void) | null;
  accumulated: string;
  closed: boolean;
  /**
   * When true the session was spawned by Review → keepAsking — the
   * "prior thought" sits in `accumulated` but did not come from an AI
   * stream for *this* passage, so the follow-up prompt phrases things
   * accordingly.
   */
  keepAskingMode: boolean;
};

let active: ActiveInstance | null = null;

// ── Persistent context across close/reopen ───────────────────────────────
//
// keepAsking() reopens Interlace after Review has just dismissed it. The
// incoming caller has no live selection rect, so we stash the last-known
// anchor rect + source title the moment we close a session. If the stash
// is fresh enough (under ~2 min) and still within the viewport we reuse
// it; otherwise we fall back to a viewport-center anchor so the curve
// still has somewhere to land.
type RectStash = {
  rect: { top: number; left: number; right: number; bottom: number };
  sourceTitle: string;
  selection: string;
  at: number;
};
let lastRect: RectStash | null = null;
const RECT_STASH_TTL_MS = 2 * 60 * 1000;

function stashRectFrom(inst: ActiveInstance) {
  lastRect = {
    rect: { ...inst.anchorRect },
    sourceTitle: inst.sourceTitle,
    selection: inst.selectedText,
    at: Date.now(),
  };
}

function rectIsUsable(
  rect: { top: number; left: number; right: number; bottom: number } | null | undefined,
): boolean {
  if (!rect) return false;
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  if (!Number.isFinite(w) || !Number.isFinite(h)) return false;
  if (w <= 0 || h <= 0) return false;
  return true;
}

function normalizeRect(
  rect: OpenOptions['rect'],
): { top: number; left: number; right: number; bottom: number } | null {
  if (!rect) return null;
  // Works for both plain shape and DOMRect.
  const r = {
    top: (rect as DOMRect).top,
    left: (rect as DOMRect).left,
    right: (rect as DOMRect).right,
    bottom: (rect as DOMRect).bottom,
  };
  return r;
}

function centerRightFallbackRect(): {
  top: number;
  left: number;
  right: number;
  bottom: number;
} {
  // Phantom anchor at viewport center so the curve has a sane origin.
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  return { top: cy - 12, left: cx - 80, right: cx + 80, bottom: cy + 12 };
}

// ── Bridge helpers ────────────────────────────────────────────────────────

function getStreamBridge(): StreamBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as AIWindow;
  return w.webkit?.messageHandlers?.loomAIStream ?? null;
}

function ensureLoomAIShim() {
  if (typeof window === 'undefined') return;
  const w = window as AIWindow;
  if (w.__loomAI) return;
  // Minimal shim so `onChunk`/`onDone`/`onError` from Swift don't throw
  // before `lib/ai-stream-bridge` is ever imported. If that module is
  // imported later it will overwrite this shim harmlessly.
  w.__loomAI = {
    onChunk: () => {},
    onDone: () => {},
    onError: () => {},
  };
}

// ── Selection capture ─────────────────────────────────────────────────────

function readSelection(): {
  text: string;
  rect: DOMRect | null;
  block: HTMLElement | null;
} | null {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0) return null;
  const text = sel.toString().trim();
  if (text.length < 2) return null;
  const range = sel.getRangeAt(0);
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) return null;

  // Use the last rect for the curve anchor (tail of the selection).
  const rect = rects[rects.length - 1];

  // Find the containing .prose-notion > direct-child block, so we can
  // mark it with `data-loom-selected` and the body-class CSS picks it up.
  let node: Node | null = range.commonAncestorContainer;
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  let block: HTMLElement | null = null;
  let cur = node as HTMLElement | null;
  while (cur && cur !== document.body) {
    if (cur.parentElement && cur.parentElement.classList.contains('prose-notion')) {
      block = cur;
      break;
    }
    cur = cur.parentElement;
  }
  return { text, rect, block };
}

// ── Geometry ──────────────────────────────────────────────────────────────

const NOTE_WIDTH = 320;
const NOTE_GAP = 24; // gap between prose edge and margin note

function computeNotePosition(anchorRect: {
  top: number;
  left: number;
  right: number;
  bottom: number;
}): { left: number; top: number; below: boolean } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Try to read --prose-width from the root so the margin note sits in
  // the actual outer gutter, not a guessed one.
  const cs = getComputedStyle(document.documentElement);
  const proseWidthCss = cs.getPropertyValue('--prose-width').trim();
  let proseWidthPx = parseFloat(proseWidthCss);
  if (proseWidthCss.endsWith('rem')) {
    const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    proseWidthPx = parseFloat(proseWidthCss) * rootFs;
  }
  if (!Number.isFinite(proseWidthPx) || proseWidthPx <= 0) {
    proseWidthPx = Math.min(820, vw - 120);
  }

  // Default: float in the right gutter relative to viewport centre.
  const gutterLeft = (vw + proseWidthPx) / 2 + NOTE_GAP;
  let left = gutterLeft;
  let below = false;

  // Fallback: if margin note would clip offscreen, slide under the selection.
  if (left + NOTE_WIDTH + 8 > vw) {
    left = Math.max(16, anchorRect.left);
    below = true;
  }
  if (left < 16) left = 16;

  let top = anchorRect.top - 10;
  if (below) top = anchorRect.bottom + 16;
  // Clamp vertically so it doesn't pour off the bottom.
  const estHeight = 220;
  if (top + estHeight > vh - 16) top = Math.max(16, vh - estHeight - 16);
  if (top < 16) top = 16;

  return { left, top, below };
}

// ── DOM construction ──────────────────────────────────────────────────────

function buildNote(sourceTitle: string): {
  note: HTMLElement;
  body: HTMLElement;
} {
  const note = document.createElement('aside');
  note.className = 'loom-interlace-note';
  note.setAttribute('role', 'complementary');
  note.setAttribute('aria-label', 'Interlace margin note');

  const header = document.createElement('div');
  header.className = 'loom-interlace-header';

  const glyph = buildGlyph();
  header.appendChild(glyph);

  const title = document.createElement('span');
  title.textContent = 'Interlace';
  header.appendChild(title);

  const rule = document.createElement('span');
  rule.className = 'loom-interlace-header-rule';
  header.appendChild(rule);

  const kbd = document.createElement('span');
  kbd.className = 'loom-interlace-kbd';
  kbd.textContent = '⌘/';
  header.appendChild(kbd);
  note.appendChild(header);

  if (sourceTitle) {
    const intro = document.createElement('div');
    intro.style.fontFamily = 'var(--serif)';
    intro.style.fontStyle = 'italic';
    intro.style.fontSize = '0.82rem';
    intro.style.color = 'var(--muted)';
    intro.style.marginBottom = '0.5rem';
    intro.textContent = `on “${sourceTitle}”`;
    note.appendChild(intro);
  }

  const body = document.createElement('div');
  body.className = 'loom-interlace-body';
  body.setAttribute('aria-live', 'polite');
  body.setAttribute('aria-atomic', 'false');
  body.textContent = '';
  note.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'loom-interlace-actions';

  const anchorBtn = document.createElement('button');
  anchorBtn.type = 'button';
  anchorBtn.className = 'loom-interlace-action loom-interlace-action--primary';
  anchorBtn.dataset.loomAction = 'anchor';
  anchorBtn.textContent = '⏎ anchor this thought';
  actions.appendChild(anchorBtn);

  const dot1 = document.createElement('span');
  dot1.textContent = '·';
  dot1.setAttribute('aria-hidden', 'true');
  actions.appendChild(dot1);

  const keepBtn = document.createElement('button');
  keepBtn.type = 'button';
  keepBtn.className = 'loom-interlace-action';
  keepBtn.dataset.loomAction = 'keep';
  keepBtn.textContent = 'keep asking';
  actions.appendChild(keepBtn);

  const dot2 = document.createElement('span');
  dot2.textContent = '·';
  dot2.setAttribute('aria-hidden', 'true');
  actions.appendChild(dot2);

  const letgoBtn = document.createElement('button');
  letgoBtn.type = 'button';
  letgoBtn.className = 'loom-interlace-action';
  letgoBtn.dataset.loomAction = 'letgo';
  letgoBtn.textContent = '⎋ let go';
  actions.appendChild(letgoBtn);

  note.appendChild(actions);

  return { note, body };
}

function buildGlyph(): SVGSVGElement {
  const svgns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgns, 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 14 14');
  svg.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(svgns, 'g');
  g.setAttribute('stroke', 'currentColor');
  g.setAttribute('stroke-width', '0.9');
  g.setAttribute('fill', 'none');
  const p1 = document.createElementNS(svgns, 'path');
  p1.setAttribute('d', 'M 2 4 Q 7 8 12 4');
  const p2 = document.createElementNS(svgns, 'path');
  p2.setAttribute('d', 'M 2 10 Q 7 6 12 10');
  g.appendChild(p1);
  g.appendChild(p2);
  svg.appendChild(g);
  return svg;
}

function buildCurve(): {
  svg: SVGSVGElement;
  path: SVGPathElement;
  startDot: SVGCircleElement;
  endDot: SVGCircleElement;
} {
  const svgns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgns, 'svg');
  svg.classList.add('loom-interlace-curve');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgns, 'path');
  path.setAttribute('stroke', 'var(--accent)');
  path.setAttribute('stroke-width', '0.7');
  path.setAttribute('stroke-dasharray', '2 3');
  path.setAttribute('fill', 'none');
  path.setAttribute('opacity', '0.8');
  svg.appendChild(path);
  const startDot = document.createElementNS(svgns, 'circle');
  startDot.setAttribute('r', '2');
  startDot.setAttribute('fill', 'var(--accent)');
  svg.appendChild(startDot);
  const endDot = document.createElementNS(svgns, 'circle');
  endDot.setAttribute('r', '2');
  endDot.setAttribute('fill', 'var(--accent)');
  endDot.setAttribute('opacity', '0'); // pops in on done
  svg.appendChild(endDot);
  return { svg, path, startDot, endDot };
}

function drawCurve(
  inst: ActiveInstance,
  noteRect: DOMRect,
): void {
  const anchor = inst.anchorRect;
  // Start: right edge midpoint of the selection's last rect.
  const sx = anchor.right;
  const sy = (anchor.top + anchor.bottom) / 2;
  // End: top-left of the margin note, nudged slightly in so the dot
  // sits on the frame, not past it.
  const ex = noteRect.left + 4;
  const ey = noteRect.top + 12;

  // Bounding box for the SVG (in viewport coords since svg is fixed).
  const minX = Math.min(sx, ex) - 8;
  const minY = Math.min(sy, ey) - 8;
  const maxX = Math.max(sx, ex) + 8;
  const maxY = Math.max(sy, ey) + 8;

  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);

  inst.svg.style.left = `${minX}px`;
  inst.svg.style.top = `${minY}px`;
  inst.svg.style.width = `${w}px`;
  inst.svg.style.height = `${h}px`;
  inst.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const lsx = sx - minX;
  const lsy = sy - minY;
  const lex = ex - minX;
  const ley = ey - minY;
  // Control point — pulled horizontally toward the mid of the run with
  // a gentle downward droop, matching the reference bezier.
  const cx = (lsx + lex) / 2 + 10;
  const cy = Math.min(lsy, ley) + Math.abs(ley - lsy) * 0.2 + 12;

  const d = `M ${lsx} ${lsy} Q ${cx} ${cy} ${lex} ${ley}`;
  inst.curvePath.setAttribute('d', d);

  // Compute total path length for dashoffset progression.
  try {
    const len = inst.curvePath.getTotalLength();
    inst.curvePath.style.strokeDasharray = `${len}`;
    // Starts at 80% hidden when the stream begins.
    inst.curvePath.style.strokeDashoffset = `${len * 0.8}`;
    (inst.curvePath as unknown as { __totalLength: number }).__totalLength = len;
  } catch {
    // getTotalLength can throw on detached nodes — tolerate.
  }

  // Endpoint circles
  inst.curveDot.setAttribute('cx', `${lex}`);
  inst.curveDot.setAttribute('cy', `${ley}`);
  const startDot = inst.svg.querySelectorAll('circle')[0] as SVGCircleElement | undefined;
  if (startDot) {
    startDot.setAttribute('cx', `${lsx}`);
    startDot.setAttribute('cy', `${lsy}`);
  }
}

// ── Decoration of the selected block ─────────────────────────────────────

function decorateSelectedBlock(block: HTMLElement | null): HTMLElement | null {
  if (!block) return null;
  block.setAttribute('data-loom-selected', '');
  return block;
}

function undecorateSelectedBlock(block: HTMLElement | null) {
  if (!block) return;
  block.removeAttribute('data-loom-selected');
}

// ── Streaming ────────────────────────────────────────────────────────────

function buildPrompt(selection: string, sourceTitle: string): string {
  const source = sourceTitle ? `In the source titled “${sourceTitle}”:\n\n` : '';
  return (
    `${source}The reader selected this passage:\n\n` +
    `> ${selection.replace(/\n/g, '\n> ')}\n\n` +
    `Answer briefly, in 2–4 sentences, the question implicit in this passage. ` +
    `Write in a quiet, italic voice — observational, never imperative. ` +
    `Address the reader as "you" if needed. Do not use bullet points. ` +
    `Do not repeat the passage.`
  );
}

function startStream(inst: ActiveInstance) {
  const bridge = getStreamBridge();
  if (!bridge) {
    inst.bodyEl.textContent = 'Connect an AI provider to use Interlace.';
    inst.bodyEl.style.opacity = '0.7';
    // Still complete the curve so the visual isn't dead-ended.
    const len = (inst.curvePath as unknown as { __totalLength?: number })
      .__totalLength ?? 0;
    if (len > 0) inst.curvePath.style.strokeDashoffset = '0';
    popEndDot(inst);
    return;
  }
  ensureLoomAIShim();

  const streamId = `interlace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  inst.streamId = streamId;

  const w = window as AIWindow;
  const prev = w.__loomAI!;
  const wrapped: NonNullable<AIWindow['__loomAI']> = {
    onChunk(id, text) {
      // Pass through to any existing subscribers (e.g. ChatFocus stream).
      try { prev.onChunk(id, text); } catch {}
      if (id !== streamId) return;
      if (inst.closed) return;
      inst.accumulated += text;
      inst.bodyEl.textContent = inst.accumulated;
      advanceCurve(inst);
    },
    onDone(id) {
      try { prev.onDone(id); } catch {}
      if (id !== streamId) return;
      if (inst.closed) return;
      finishCurve(inst);
    },
    onError(id, message) {
      try { prev.onError(id, message); } catch {}
      if (id !== streamId) return;
      if (inst.closed) return;
      if (!inst.accumulated) {
        inst.bodyEl.textContent = `(Interlace failed: ${message})`;
        inst.bodyEl.style.opacity = '0.7';
      }
      finishCurve(inst);
    },
  };
  w.__loomAI = wrapped;

  try {
    bridge.postMessage({
      streamId,
      prompt: buildPrompt(inst.selectedText, inst.sourceTitle),
      maxTokens: 420,
    });
  } catch (err) {
    inst.bodyEl.textContent = `(could not reach AI bridge)`;
    inst.bodyEl.style.opacity = '0.7';
    console.error('Interlace stream start failed:', err);
  }
}

function advanceCurve(inst: ActiveInstance) {
  const len = (inst.curvePath as unknown as { __totalLength?: number }).__totalLength ?? 0;
  if (len <= 0) return;
  // Advance roughly based on how much text has arrived — asymptotic so
  // it approaches but never quite hits 0 until `done`.
  const chars = inst.accumulated.length;
  const target = Math.min(0.72, chars / 320); // 0..0.72 over ~320 chars
  const progress = 0.8 - target;              // 0.8..0.08
  inst.curvePath.style.strokeDashoffset = `${Math.max(0, len * progress)}`;
}

function finishCurve(inst: ActiveInstance) {
  const len = (inst.curvePath as unknown as { __totalLength?: number }).__totalLength ?? 0;
  if (len > 0) inst.curvePath.style.strokeDashoffset = '0';
  popEndDot(inst);
  recordThought(inst);
}

function recordThought(inst: ActiveInstance) {
  const text = inst.accumulated?.trim();
  if (!text) return;
  try {
    const w = window as AIWindow;
    w.__loomReview?.addThought(text, inst.sourceTitle || undefined);
  } catch {}
}

function popEndDot(inst: ActiveInstance) {
  const dot = inst.curveDot;
  dot.setAttribute('opacity', '1');
  dot.style.transition = 'transform 220ms cubic-bezier(0,0,0.2,1)';
  dot.style.transformOrigin = 'center';
  dot.style.transformBox = 'fill-box';
  dot.style.transform = 'scale(0.4)';
  requestAnimationFrame(() => {
    dot.style.transform = 'scale(1)';
  });
}

// ── Keep-asking input ────────────────────────────────────────────────────

function replaceBodyWithInput(inst: ActiveInstance) {
  const input = document.createElement('textarea');
  input.rows = 2;
  input.placeholder = 'keep asking…';
  input.style.width = '100%';
  input.style.background = 'transparent';
  input.style.border = '0';
  input.style.outline = 'none';
  input.style.resize = 'none';
  input.style.fontFamily = 'var(--serif)';
  input.style.fontStyle = 'italic';
  input.style.fontSize = '0.9rem';
  input.style.lineHeight = '1.6';
  input.style.color = 'var(--fg)';
  input.style.padding = '0';
  inst.bodyEl.innerHTML = '';
  inst.bodyEl.appendChild(input);
  // Darken the curve to indicate active.
  inst.curvePath.setAttribute('opacity', '1.0');
  input.focus();

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      // Rebind prompt around the follow-up question.
      const followUp = inst.keepAskingMode
        ? (
            `Earlier you said: ${inst.accumulated || inst.selectedText}.\n\n` +
            `The reader wants to go deeper: ${q}\n\n` +
            `Respond briefly, in 2–4 sentences, in the same quiet italic voice. ` +
            `Do not use bullet points.`
          )
        : (
            `The reader selected this passage earlier: "${inst.selectedText}"\n\n` +
            `Previous thought (yours):\n${inst.accumulated}\n\n` +
            `Follow-up from the reader: ${q}\n\n` +
            `Answer briefly, still in the same quiet italic voice.`
          );
      inst.accumulated = '';
      inst.bodyEl.textContent = '';
      // After the first follow-up fires, subsequent follow-ups chain
      // from the new AI response like a normal session.
      inst.keepAskingMode = false;
      const bridge = getStreamBridge();
      if (!bridge) {
        inst.bodyEl.textContent = 'Connect an AI provider to use Interlace.';
        return;
      }
      const streamId = `interlace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      inst.streamId = streamId;
      const w = window as AIWindow;
      ensureLoomAIShim();
      const prev = w.__loomAI!;
      w.__loomAI = {
        onChunk(id, text) {
          try { prev.onChunk(id, text); } catch {}
          if (id !== streamId || inst.closed) return;
          inst.accumulated += text;
          inst.bodyEl.textContent = inst.accumulated;
          advanceCurve(inst);
        },
        onDone(id) {
          try { prev.onDone(id); } catch {}
          if (id !== streamId || inst.closed) return;
          finishCurve(inst);
        },
        onError(id, msg) {
          try { prev.onError(id, msg); } catch {}
          if (id !== streamId || inst.closed) return;
          if (!inst.accumulated) {
            inst.bodyEl.textContent = `(Interlace failed: ${msg})`;
          }
          finishCurve(inst);
        },
      };
      // Reset the curve dashoffset so the new answer re-draws it.
      const len = (inst.curvePath as unknown as { __totalLength?: number })
        .__totalLength ?? 0;
      if (len > 0) inst.curvePath.style.strokeDashoffset = `${len * 0.8}`;
      bridge.postMessage({ streamId, prompt: followUp, maxTokens: 420 });
    } else if (e.key === 'Escape') {
      close();
    }
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

function reposition() {
  if (!active) return;
  const pos = computeNotePosition(active.anchorRect);
  active.note.style.left = `${pos.left}px`;
  active.note.style.top = `${pos.top}px`;
  const noteRect = active.note.getBoundingClientRect();
  drawCurve(active, noteRect);
}

function close() {
  if (!active) return;
  const inst = active;
  // Stash the anchor rect + source title so a follow-up `keepAsking`
  // summon (from Review) can reuse them.
  stashRectFrom(inst);
  inst.closed = true;
  active = null;

  // Cancel in-flight stream if any.
  const bridge = getStreamBridge();
  if (bridge && inst.streamId) {
    try { bridge.postMessage({ streamId: inst.streamId, cancel: true }); } catch {}
  }

  // Detach listeners.
  if (inst.scrollHandler) window.removeEventListener('scroll', inst.scrollHandler, true);
  if (inst.resizeHandler) window.removeEventListener('resize', inst.resizeHandler);
  if (inst.keyHandler) window.removeEventListener('keydown', inst.keyHandler, true);
  if (inst.outsideClickHandler) document.removeEventListener('mousedown', inst.outsideClickHandler, true);
  if (inst.routeHandler) window.removeEventListener('popstate', inst.routeHandler);

  // Fade out.
  inst.note.style.transition = 'opacity 250ms var(--ease-exit, cubic-bezier(0.4,0,1,1)), transform 250ms var(--ease-exit, cubic-bezier(0.4,0,1,1))';
  inst.note.style.opacity = '0';
  inst.note.style.transform = 'translateY(-0.25rem)';
  inst.svg.style.transition = 'opacity 250ms var(--ease-exit, cubic-bezier(0.4,0,1,1))';
  inst.svg.style.opacity = '0';

  undecorateSelectedBlock(inst.decoratedBlock);
  document.body.classList.remove('loom-interlace-active');

  window.setTimeout(() => {
    inst.note.remove();
    inst.svg.remove();
  }, 270);
}

function settleClose(inst: ActiveInstance) {
  // "Anchor" settle animation: scale down + fade, quicker than `close`.
  inst.note.style.transition = 'opacity 200ms var(--ease-exit), transform 200ms var(--ease-exit)';
  inst.note.style.opacity = '0';
  inst.note.style.transform = 'scale(0.98)';
  window.setTimeout(() => close(), 40);
}

function open(opts: OpenOptions = {}): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;

  // If one's already open, close it first.
  if (active) close();

  // Figure out the selection.
  const cap = readSelection();
  const text = (opts.selection ?? cap?.text ?? '').trim();
  if (!text) return false;

  // Prefer explicit rect → live selection rect → stashed rect → fallback.
  const explicitRect = normalizeRect(opts.rect);
  const liveRect = cap?.rect
    ? { top: cap.rect.top, left: cap.rect.left, right: cap.rect.right, bottom: cap.rect.bottom }
    : null;
  const stashedRect =
    lastRect && Date.now() - lastRect.at < RECT_STASH_TTL_MS ? lastRect.rect : null;
  let rect: { top: number; left: number; right: number; bottom: number };
  if (rectIsUsable(explicitRect)) {
    rect = explicitRect!;
  } else if (rectIsUsable(liveRect)) {
    rect = liveRect!;
  } else if (rectIsUsable(stashedRect)) {
    rect = stashedRect!;
  } else {
    // All-zero or missing → fall back to viewport center-right so the
    // curve still draws and the margin note still sits in the right
    // gutter.
    rect = centerRightFallbackRect();
  }

  // Source title — Next.js sets <title>, fall back to h1.
  let sourceTitle = opts.sourceTitle?.trim() ?? '';
  if (!sourceTitle) {
    const h1 = document.querySelector('.prose-notion h1');
    sourceTitle = h1?.textContent?.trim() ?? document.title.trim();
  }
  // Strip "· LLM Wiki" suffix etc.
  sourceTitle = sourceTitle.replace(/\s*·.*$/, '').trim();

  const { note, body } = buildNote(sourceTitle);
  const curve = buildCurve();
  document.body.appendChild(note);
  document.body.appendChild(curve.svg);

  const block = cap ? decorateSelectedBlock(cap.block) : null;
  document.body.classList.add('loom-interlace-active');

  const inst: ActiveInstance = {
    note,
    svg: curve.svg,
    curvePath: curve.path,
    curveDot: curve.endDot,
    bodyEl: body,
    decoratedBlock: block,
    selectedText: text,
    sourceTitle,
    anchorRect: rect,
    streamId: null,
    scrollHandler: null,
    resizeHandler: null,
    keyHandler: null,
    outsideClickHandler: null,
    routeHandler: null,
    accumulated: '',
    closed: false,
    keepAskingMode: opts.asFollowUp === true,
  };
  active = inst;

  // Initial position + curve.
  const pos = computeNotePosition(inst.anchorRect);
  note.style.left = `${pos.left}px`;
  note.style.top = `${pos.top}px`;
  const noteRect = note.getBoundingClientRect();
  drawCurve(inst, noteRect);

  // Wire handlers.
  inst.scrollHandler = () => {
    // Don't chase scroll: close instead, so the margin note doesn't
    // float detached from the now-scrolled source.
    close();
  };
  inst.resizeHandler = () => reposition();
  inst.keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      // Only anchor via Enter if the body isn't currently an input.
      const tagName = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tagName === 'textarea' || tagName === 'input') return;
      if (!active) return;
      anchorThought();
    }
  };
  inst.outsideClickHandler = (e: MouseEvent) => {
    if (!active) return;
    const target = e.target as Node;
    if (note.contains(target)) return;
    if (curve.svg.contains(target)) return;
    close();
  };
  inst.routeHandler = () => close();

  window.addEventListener('scroll', inst.scrollHandler, true);
  window.addEventListener('resize', inst.resizeHandler);
  window.addEventListener('keydown', inst.keyHandler, true);
  // Delay outside-click by one tick so the click that spawned us (via
  // menu command) doesn't immediately dismiss.
  window.setTimeout(() => {
    if (!active) return;
    document.addEventListener('mousedown', inst.outsideClickHandler!, true);
  }, 0);
  window.addEventListener('popstate', inst.routeHandler);

  // Wire action buttons.
  const anchorBtn = note.querySelector<HTMLButtonElement>('[data-loom-action="anchor"]');
  const keepBtn = note.querySelector<HTMLButtonElement>('[data-loom-action="keep"]');
  const letgoBtn = note.querySelector<HTMLButtonElement>('[data-loom-action="letgo"]');
  anchorBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    anchorThought();
  });
  keepBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!active) return;
    replaceBodyWithInput(active);
  });
  letgoBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    close();
  });

  if (opts.asFollowUp) {
    // Skip the initial AI stream: we are reopening specifically to let
    // the user type a follow-up around a prior thought. Seed the body
    // with the prior thought so the follow-up prompt has context when
    // the user presses Enter.
    const seed = (opts.priorThought ?? '').trim();
    if (seed) {
      inst.accumulated = seed;
      inst.bodyEl.textContent = seed;
      // Complete the curve visually — we're not streaming.
      finishCurve(inst);
    }
    replaceBodyWithInput(inst);
  } else {
    startStream(inst);
  }
  return true;
}

/**
 * Reopen Interlace pre-seeded with a prior thought. Strategy:
 *   1. Reuse the most recent stashed rect if it's still fresh.
 *   2. Otherwise anchor to the viewport center so the curve still draws.
 *   3. Skip the AI stream; go directly into the follow-up input with the
 *      prior thought pre-loaded so the follow-up prompt has context.
 */
function keepAsking(priorThought: string): void {
  if (typeof window === 'undefined') return;
  const seed = (priorThought ?? '').trim();
  const stash = lastRect && Date.now() - lastRect.at < RECT_STASH_TTL_MS ? lastRect : null;
  const rect = stash?.rect ?? centerRightFallbackRect();
  const sourceTitle = stash?.sourceTitle;
  const selection = stash?.selection || seed || 'earlier thought';
  open({
    selection,
    rect,
    sourceTitle,
    asFollowUp: true,
    priorThought: seed,
  });
}

function anchorThought() {
  if (!active) return;
  const inst = active;
  try {
    window.dispatchEvent(
      new CustomEvent('loom:anchor-from-interlace', {
        detail: {
          selection: inst.selectedText,
          sourceTitle: inst.sourceTitle,
          response: inst.accumulated,
        },
      }),
    );
  } catch {}
  settleClose(inst);
}

// ── Public registration ──────────────────────────────────────────────────

/**
 * Bridge the `loom:anchor-from-interlace` CustomEvent (dispatched by
 * `anchorThought()` when the user clicks "Anchor this thought" in the
 * Interlace margin) into the native host via `webkit.messageHandlers.loomNavigate`.
 *
 * Without this bridge, clicking "Anchor" silently drops the thought on the
 * floor — the event fires but nobody persists it. Guarded for dev / non-WKWebView
 * contexts where the bridge is missing; silently no-ops in that case.
 */
function registerInterlaceAnchorListener(): void {
  if (typeof window === 'undefined') return;
  const w = window as AIWindow & {
    __loomInterlaceAnchorListener?: boolean;
    webkit?: {
      messageHandlers?: {
        loomNavigate?: { postMessage: (msg: unknown) => void };
      };
    };
    location?: Location;
  };
  if (w.__loomInterlaceAnchorListener) return;
  w.__loomInterlaceAnchorListener = true;

  window.addEventListener('loom:anchor-from-interlace', (ev: Event) => {
    try {
      const detail = (ev as CustomEvent).detail as
        | { selection?: string; sourceTitle?: string; response?: string }
        | undefined;
      const handler = w.webkit?.messageHandlers?.loomNavigate;
      if (!handler?.postMessage) return; // dev / no bridge — silent no-op
      const sourceHref =
        typeof window !== 'undefined' ? window.location?.pathname ?? '' : '';
      handler.postMessage({
        action: 'anchorFromInterlace',
        payload: {
          selection: detail?.selection ?? '',
          sourceTitle: detail?.sourceTitle ?? '',
          response: detail?.response ?? '',
          sourceHref,
          at: Date.now(),
        },
      });
      // eslint-disable-next-line no-console
      console.log('Interlace anchor saved');
    } catch {}
  });
}

export function registerLoomInterlace(): void {
  if (typeof window === 'undefined') return;
  const w = window as AIWindow;
  if (w.__loomInterlace) return;
  w.__loomInterlace = {
    open(opts) {
      return open(opts);
    },
    close() {
      close();
    },
    isOpen() {
      return active !== null;
    },
    keepAsking(priorThought) {
      keepAsking(priorThought);
    },
  };
  // Next.js client-side nav fires this; clear any stale overlay.
  try {
    window.addEventListener('loom:route:change', () => close());
  } catch {}
  // Bridge "Anchor this thought" → native persistence.
  registerInterlaceAnchorListener();
}

export function closeLoomInterlace() {
  close();
}
