'use client';
/**
 * HighlightOverlay — renders persisted source highlights inside <main>.
 *
 * Reads highlight events from the current document's reading Trace and
 * wraps matching text nodes in tinted <mark> spans. Clicking a highlight
 * removes that exact highlight event from the trace.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTracesForDoc, useRemoveEvents } from '../lib/trace';
import { contextFromPathname } from '../lib/doc-context';
import { rootReadingTraces } from './thought-anchor-model';

const HL_ATTR = 'data-wiki-hl';
const HL_EVENT = 'wiki:highlights:changed';

type Hl = {
  text: string;
  tint: string;
  at: number;
  traceId?: string;
  anchor?: {
    paragraphId?: string;
    blockId?: string;
    charStart?: number;
    charEnd?: number;
    selection?: string;
  };
};

/** Strip any existing highlight wrappers so we can re-render fresh. */
function stripHighlights(root: HTMLElement) {
  // Remove <mark> wrappers (inline text highlights)
  const marks = root.querySelectorAll(`mark[${HL_ATTR}]`);
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
    parent.normalize();
  });
  // Remove direct-attribute highlights (KaTeX blocks)
  const blocks = root.querySelectorAll(`[${HL_ATTR}]:not(mark)`);
  blocks.forEach((el) => {
    const e = el as HTMLElement;
    e.removeAttribute(HL_ATTR);
    delete e.dataset.at;
    delete e.dataset.traceId;
    e.style.background = '';
    e.style.borderRadius = '';
    e.style.cursor = '';
    e.title = '';
  });
}

/** Check if a node lives inside a KaTeX container (display or inline math). */
function isInsideKatex(node: Node, root: Node): boolean {
  let p: Node | null = node.parentNode;
  while (p && p !== root) {
    if (p.nodeType === 1) {
      const cl = (p as HTMLElement).className;
      if (typeof cl === 'string' && cl.includes('katex')) return true;
    }
    p = p.parentNode;
  }
  return false;
}

/** Check if a block element contains any KaTeX rendering. */
function hasKatex(el: HTMLElement): boolean {
  return !!el.querySelector('[class*="katex"]');
}

/** For KaTeX blocks, apply a background tint directly on the block element
 *  instead of inserting overlay DOM. This preserves KaTeX's internal layout
 *  and stacking context, keeping text selection and pointer events intact. */
function wrapKatexBlock(block: HTMLElement, hl: Hl): boolean {
  block.setAttribute(HL_ATTR, '1');
  block.dataset.at = String(hl.at);
  if (hl.traceId) block.dataset.traceId = hl.traceId;
  block.style.background = `color-mix(in srgb, ${hl.tint} 22%, transparent)`;
  block.style.borderRadius = '4px';
  block.style.cursor = 'pointer';
  block.title = 'Click to remove highlight';
  return true;
}

/** Walk text nodes inside `root` and wrap the first occurrence of `needle`. */
function wrapFirst(root: HTMLElement, hl: Hl): boolean {
  const needle = hl.text;
  if (!needle.trim() || needle.length < 2) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
      let p: Node | null = node.parentNode;
      while (p && p !== root) {
        if (p.nodeType === 1) {
          const el = p as HTMLElement;
          const tag = el.tagName;
          if (tag === 'MARK' || tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
          if (typeof el.className === 'string' && el.className.includes('katex')) return NodeFilter.FILTER_REJECT;
        }
        p = p.parentNode;
      }
      return node.nodeValue.includes(needle) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  const node = walker.nextNode() as Text | null;
  if (!node || !node.nodeValue) return false;

  const idx = node.nodeValue.indexOf(needle);
  if (idx === -1) return false;

  const before = node.nodeValue.slice(0, idx);
  const match = node.nodeValue.slice(idx, idx + needle.length);
  const after = node.nodeValue.slice(idx + needle.length);

  const mark = document.createElement('mark');
  mark.setAttribute(HL_ATTR, '1');
  mark.dataset.at = String(hl.at);
  if (hl.traceId) mark.dataset.traceId = hl.traceId;
  mark.textContent = match;
  mark.style.background = `color-mix(in srgb, ${hl.tint} 38%, transparent)`;
  mark.style.color = 'inherit';
  mark.style.padding = '0 2px';
  mark.style.borderRadius = '3px';
  mark.style.cursor = 'pointer';
  mark.style.boxDecorationBreak = 'clone';
  mark.style.transition = 'background 0.18s ease';
  mark.title = 'Click to remove highlight';

  const frag = document.createDocumentFragment();
  if (before) frag.appendChild(document.createTextNode(before));
  frag.appendChild(mark);
  if (after) frag.appendChild(document.createTextNode(after));
  node.parentNode!.replaceChild(frag, node);
  return true;
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

function resolveBlock(root: HTMLElement, blockId?: string): HTMLElement | null {
  if (!blockId) return null;
  const direct = document.getElementById(blockId);
  if (direct && root.contains(direct)) return direct as HTMLElement;

  const prose = root.querySelector('.loom-source-prose');
  if (!prose) return null;

  if (blockId.startsWith('loom-block-')) {
    const idx = parseInt(blockId.slice('loom-block-'.length), 10);
    return filteredChildren(prose)[idx] ?? null;
  }
  if (blockId.startsWith('p-')) {
    const idx = parseInt(blockId.slice(2), 10);
    return filteredChildren(prose)[idx] ?? null;
  }
  return null;
}

function wrapByAnchor(root: HTMLElement, hl: Hl): boolean {
  const block = resolveBlock(root, hl.anchor?.blockId ?? hl.anchor?.paragraphId);
  const start = hl.anchor?.charStart;
  const end = hl.anchor?.charEnd;
  if (!block || start == null || end == null || end <= start) return false;

  // If the block contains KaTeX math, use a CSS overlay instead of
  // DOM manipulation — inserting <mark> inside KaTeX breaks its layout.
  // This includes blocks with inline math ($...$) and display math ($$...$$).
  if (hasKatex(block)) {
    return wrapKatexBlock(block, hl);
  }

  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let seen = 0;
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.nodeValue?.length ?? 0;
    if (!startNode && start <= seen + len) {
      startNode = node;
      startOffset = Math.max(0, start - seen);
    }
    if (!endNode && end <= seen + len) {
      endNode = node;
      endOffset = Math.max(0, end - seen);
      break;
    }
    seen += len;
  }

  if (!startNode || !endNode) return false;

  // Safety: if the resolved nodes are inside KaTeX, fall back to overlay.
  // This catches edge cases where anchor offsets were computed with KaTeX
  // text included, causing the range to land inside math elements.
  if (isInsideKatex(startNode, block) || isInsideKatex(endNode, block)) {
    return wrapKatexBlock(block, hl);
  }

  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);

  const mark = document.createElement('mark');
  mark.setAttribute(HL_ATTR, '1');
  mark.dataset.at = String(hl.at);
  if (hl.traceId) mark.dataset.traceId = hl.traceId;
  mark.style.background = `color-mix(in srgb, ${hl.tint} 38%, transparent)`;
  mark.style.color = 'inherit';
  mark.style.padding = '0 2px';
  mark.style.borderRadius = '3px';
  mark.style.cursor = 'pointer';
  mark.style.boxDecorationBreak = 'clone';
  mark.style.transition = 'background 0.18s ease';
  mark.title = 'Click to remove highlight';

  const frag = range.extractContents();
  mark.appendChild(frag);
  range.insertNode(mark);
  return true;
}

export function HighlightOverlay() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const { traces } = useTracesForDoc(ctx.isFree ? null : ctx.docId);
  const removeEvents = useRemoveEvents();

  useEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    if (!main || ctx.isFree) return;
    const readingTraces = rootReadingTraces(traces);
    if (readingTraces.length === 0) {
      stripHighlights(main);
      return;
    }

    let cancelled = false;
    const highlights: Hl[] = readingTraces
      .flatMap((trace) =>
        trace.events
          .filter((e): e is Extract<typeof e, { kind: 'highlight' }> => e.kind === 'highlight')
          .map((e) => ({ text: e.text, tint: e.tint, at: e.at, anchor: e.anchor, traceId: trace.id })),
      )
      .sort((a, b) => a.at - b.at);

    const apply = () => {
      if (cancelled) return;
      const root = document.querySelector('main') as HTMLElement | null;
      if (!root) return;
      stripHighlights(root);
      for (const hl of highlights) {
        if (!wrapByAnchor(root, hl) && !wrapFirst(root, hl)) {
          // Fallback: if the highlight target is inside a KaTeX block that
          // neither anchor nor text-walk could wrap, try the block overlay.
          const blockEl = resolveBlock(root, hl.anchor?.blockId ?? hl.anchor?.paragraphId);
          if (blockEl && hasKatex(blockEl)) wrapKatexBlock(blockEl, hl);
        }
      }
    };

    apply();
    const t1 = window.setTimeout(apply, 60);
    const t2 = window.setTimeout(apply, 240);
    const t3 = window.setTimeout(apply, 800);

    const onChange = () => apply();
    window.addEventListener(HL_EVENT, onChange);

    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      // Match both <mark> wrappers and direct-attribute KaTeX block highlights
      const hl_el = t.tagName === 'MARK' && t.hasAttribute(HL_ATTR)
        ? t
        : t.closest?.(`[${HL_ATTR}]`) as HTMLElement | null;
      if (!hl_el) return;
      e.preventDefault();
      e.stopPropagation();
      const at = Number(hl_el.dataset.at);
      const traceId = hl_el.dataset.traceId;
      if (!traceId) return;
      void removeEvents(traceId, (ev) => ev.kind === 'highlight' && ev.at === at).then(() => {
        window.dispatchEvent(new CustomEvent(HL_EVENT));
      });
    };
    main.addEventListener('click', onClick);

    return () => {
      cancelled = true;
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      window.removeEventListener(HL_EVENT, onChange);
      main.removeEventListener('click', onClick);
      const root = document.querySelector('main') as HTMLElement | null;
      if (root) stripHighlights(root);
    };
  }, [ctx.docId, ctx.isFree, traces, removeEvents]);

  return null;
}
