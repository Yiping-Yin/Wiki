'use client';
/**
 * Capture quick path · landed 2026-04-11 (canvas pivot)
 *
 * Takes the current window selection inside `main .loom-source-prose` and
 * appends a thought-anchor event whose `quote` is the selected text and
 * whose `content` + `summary` are empty. The intent is "externalize that
 * this passage matters, without being asked to write anything yet".
 *
 * The user can elaborate later in the wide state of ReviewThoughtMap, which
 * appends a new version to the same container (version chain keyed by
 * blockText + charRange — see buildThoughtAnchorViewsFromTraces).
 *
 * Shape of anchor fields matches what ChatFocus.commit produces so a later
 * full-discussion commit on the same passage joins the same container as a
 * newer version, not a parallel lane.
 */
import { contextFromPathname } from '../doc-context';
import {
  ensureBlockAnchorId,
  filteredChildren,
  normalizeBlockText,
  rangeTextOffsets,
} from '../passage-locator';
import { appendEventForDoc } from '../trace/source-bound';
import type { TraceEvent } from '../trace/types';

const MIN_LEN = 2;

/**
 * Read the current window selection and build a thought-anchor event.
 * Returns null if there is no valid selection inside reading prose.
 * Does NOT append — the caller decides whether to fire it or skip.
 */
export function buildAnchorFromCurrentSelection():
  | { event: Extract<TraceEvent, { kind: 'thought-anchor' }>; text: string }
  | null {
  if (typeof window === 'undefined') return null;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  const main = document.querySelector('main');
  if (!main || !main.contains(range.commonAncestorContainer)) return null;

  const text = sel.toString().trim();
  if (text.length < MIN_LEN) return null;

  const rect = range.getBoundingClientRect();
  if (rect.height < 4 || rect.width < 2) return null;

  // Walk up from the selection to the direct child of .loom-source-prose
  let node: Node | null = range.commonAncestorContainer;
  while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
  if (!node) return null;
  let block: HTMLElement | null = node as HTMLElement;
  const proseContainer = block.closest(
    '.loom-source-prose',
  ) as HTMLElement | null;
  if (!proseContainer) return null;
  while (block && block.parentElement !== proseContainer) {
    block = block.parentElement;
    if (!block) return null;
  }
  if (!block) return null;

  const blockId = ensureBlockAnchorId(block, proseContainer);
  const blockText = normalizeBlockText(block);
  const { start: charStart, end: charEnd } = rangeTextOffsets(block, range);
  const blockRect = block.getBoundingClientRect();
  const localOffsetPx = Math.max(4, rect.top - blockRect.top + 4);

  // Fragment anchor id — matches ChatFocus's stableFragmentAnchorId format.
  const anchorId = `${blockId}::frag:${charStart}-${charEnd}`;

  const event: Extract<TraceEvent, { kind: 'thought-anchor' }> = {
    kind: 'thought-anchor',
    anchorType: 'paragraph',
    anchorId,
    anchorBlockId: blockId,
    anchorBlockText: blockText,
    anchorOffsetPx: localOffsetPx,
    anchorCharStart: charStart,
    anchorCharEnd: charEnd,
    rangeStartId: blockId,
    rangeStartText: blockText,
    rangeEndId: blockId,
    rangeEndText: blockText,
    // Both empty: this is a capture, not an elaboration. The quote below is
    // the only content — the user can elaborate later in wide ReviewThoughtMap.
    summary: '',
    content: '',
    quote: text,
    thoughtType: 'citation',
    attribution: 'user',
    at: Date.now(),
  };

  return { event, text };
}

/**
 * Fire-and-forget: capture the current selection as a thought-anchor,
 * append to the doc's reading trace, clear the selection.
 *
 * Returns the captured anchor metadata on success, null on no-op.
 */
export async function captureCurrentSelection(): Promise<{ anchorId: string; quote: string } | null> {
  const result = buildAnchorFromCurrentSelection();
  if (!result) return null;

  const ctx = contextFromPathname(window.location.pathname);
  if (ctx.isFree || !ctx.docId) return null;

  await appendEventForDoc(
    { docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle },
    result.event,
  );

  // Clear the native selection so the user sees the capture "happen" rather
  // than leaving the highlighted text lingering. The new AnchorDot will
  // appear in the margin at the passage's y.
  window.getSelection()?.removeAllRanges();

  return { anchorId: result.event.anchorId, quote: result.text };
}
