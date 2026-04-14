/**
 * Three-layer Passage Locator — the foundation of anchor stability.
 *
 * When an anchor is created, three identification layers are stored:
 *   1. Text fingerprint (anchorBlockText) — 280-char normalized block text
 *   2. Structural index (anchorBlockId) — loom-block-N positional index
 *   3. Character offsets (charStart/charEnd) — within-block position
 *
 * Resolution priority (most stable first):
 *   Layer 1: Exact text fingerprint match → survives structural changes
 *   Layer 2: Fuzzy text match (>70% similarity) → survives minor edits
 *   Layer 3: Index-based fallback → works when text is completely rewritten
 *
 * This module centralizes all passage resolution logic. All components
 * (AnchorDot, ChatFocus, thought-anchor-model, HighlightOverlay) should
 * use resolveBlock() instead of rolling their own DOM lookups.
 */

/** Normalize block text the same way it's stored. */
export function normalizeBlockText(el: HTMLElement | null): string {
  if (!el) return '';
  return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 280);
}

/** Filter prose children to get the "addressable" blocks. */
export function filteredChildren(prose: Element): HTMLElement[] {
  return Array.from(prose.children).filter((c) => {
    const el = c as HTMLElement;
    if (el.hasAttribute('data-loom-system')) return false;
    if (el.classList.contains('tag-row')) return false;
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') return false;
    return true;
  }) as HTMLElement[];
}

/** Ensure a direct child block has a stable fallback id. */
export function ensureBlockAnchorId(
  block: HTMLElement,
  proseContainer: HTMLElement,
): string {
  if (block.id) return block.id;
  const children = filteredChildren(proseContainer);
  const index = children.indexOf(block);
  const stableId = `loom-block-${Math.max(0, index)}`;
  block.id = stableId;
  return stableId;
}

/** Character offsets of a DOM range inside a block's text content. */
export function rangeTextOffsets(block: HTMLElement, range: Range) {
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

/** Stable fragment anchor id format shared across selection + chat flows. */
export function stableFragmentAnchorId(blockId: string, charStart: number, charEnd: number) {
  return `${blockId}::frag:${Math.max(0, charStart)}-${Math.max(charStart, charEnd)}`;
}

/** Similarity score between two strings (0-1). Uses character bigram overlap. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const na = norm(a);
  const nb = norm(b);
  if (na === nb) return 1;
  if (na.length < 4 || nb.length < 4) return na === nb ? 1 : 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };

  const ba = bigrams(na);
  const bb = bigrams(nb);
  let overlap = 0;
  for (const b of ba) if (bb.has(b)) overlap++;
  return (2 * overlap) / (ba.size + bb.size);
}

export type ResolvedBlock = {
  element: HTMLElement;
  confidence: 'exact' | 'fuzzy' | 'index' | 'none';
};

/**
 * Resolve a block element from stored anchor fields.
 * Tries three layers in order of stability.
 */
export function resolveBlock(opts: {
  anchorId?: string;
  anchorBlockId?: string;
  anchorBlockText?: string;
  prose?: HTMLElement | null;
}): ResolvedBlock {
  const { anchorId, anchorBlockId, anchorBlockText } = opts;
  const prose = opts.prose ?? document.querySelector('.loom-source-prose') as HTMLElement | null;
  if (!prose) return { element: null as any, confidence: 'none' };

  const children = filteredChildren(prose);

  // Layer 1: Exact text fingerprint match
  if (anchorBlockText) {
    for (const child of children) {
      if (normalizeBlockText(child) === anchorBlockText) {
        return { element: child, confidence: 'exact' };
      }
    }
  }

  // Layer 2: Fuzzy text match (>70% bigram similarity)
  if (anchorBlockText && anchorBlockText.length >= 10) {
    let bestScore = 0;
    let bestEl: HTMLElement | null = null;
    for (const child of children) {
      const score = similarity(normalizeBlockText(child), anchorBlockText);
      if (score > bestScore) {
        bestScore = score;
        bestEl = child;
      }
    }
    if (bestEl && bestScore > 0.7) {
      return { element: bestEl, confidence: 'fuzzy' };
    }
  }

  // Layer 3: Index-based fallback
  const blockId = anchorBlockId ?? anchorId;
  if (blockId) {
    // Try direct getElementById first
    const direct = document.getElementById(blockId);
    if (direct && prose.contains(direct)) {
      return { element: direct, confidence: 'index' };
    }

    // Parse index from loom-block-N or p-N format
    const stripped = blockId.replace(/::frag:.*$/, '');
    let index = -1;
    if (stripped.startsWith('loom-block-')) {
      index = parseInt(stripped.slice('loom-block-'.length), 10);
    } else if (stripped.startsWith('p-')) {
      index = parseInt(stripped.slice(2), 10);
    }
    if (index >= 0 && index < children.length) {
      return { element: children[index], confidence: 'index' };
    }
  }

  return { element: null as any, confidence: 'none' };
}

/**
 * Convenience: resolve and return just the element (or null).
 * Drop-in replacement for the old locateAnchorElement / resolveProseBlock.
 */
export function resolveBlockElement(opts: {
  anchorId?: string;
  anchorBlockId?: string;
  anchorBlockText?: string;
  prose?: HTMLElement | null;
}): HTMLElement | null {
  const result = resolveBlock(opts);
  return result.confidence !== 'none' ? result.element : null;
}
