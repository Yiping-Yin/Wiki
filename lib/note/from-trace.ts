/**
 * from-trace · read-only adapter from existing trace events to Notes.
 *
 * Part of the Personal Layer × View architecture (see
 * memory/project_loom_unified_architecture.md). This adapter is the
 * first foothold of the unified architecture: it lets new code SEE
 * existing thought-anchor events as Notes, without requiring data
 * migration. Existing UI continues to use the old trace API; new UI
 * (to be built in subsequent sessions) uses this adapter.
 *
 * ADAPTER SCOPE:
 *   - thought-anchor events → Note (with anchor to source doc + char range)
 *   - highlight events → Note (empty content, anchor with quote only)
 *   - (future) canvas-item events — deprecated, not mapped
 *   - Source files are intentionally NOT editable; annotations live
 *     alongside them as thought-anchor events
 *
 * NOT included: writing, mutating, or deleting. This is read-only.
 * Writes go through the existing trace store until store.ts is built.
 */
import type { Trace, TraceEvent } from '../trace/types';
import type { Note, SourceDocId, NoteAnchor } from './types';
import { deriveNoteIdFromTraceEvent } from './types';

type ThoughtAnchorEvent = Extract<TraceEvent, { kind: 'thought-anchor' }>;
type HighlightEvent = Extract<TraceEvent, { kind: 'highlight' }>;

/**
 * Build the SourceDocId a trace's events anchor to. Uses the trace's
 * source.docId when available. If the trace has no source binding (e.g.,
 * a free trace), returns null and Notes synthesized from its events
 * will have anchor.target === null.
 */
function docIdOfTrace(trace: Trace): SourceDocId | null {
  return trace.source?.docId ?? null;
}

/**
 * Convert a single thought-anchor event to a Note.
 *
 * Field mapping:
 *   - anchor.target       ← trace.source.docId
 *   - anchor.range        ← { charStart: e.anchorCharStart, charEnd: e.anchorCharEnd }
 *   - anchor.blockText    ← e.anchorBlockText
 *   - anchor.blockId      ← e.anchorBlockId
 *   - anchor.offsetPx     ← e.anchorOffsetPx
 *   - anchor.quote        ← e.quote
 *   - content             ← e.content
 *   - summary             ← e.summary
 *   - flags               ← {} (crystallized handled separately via crystallize events)
 *   - at                  ← e.at
 */
function thoughtAnchorToNote(
  e: ThoughtAnchorEvent,
  trace: Trace,
): Note {
  const target = docIdOfTrace(trace);
  const anchor: NoteAnchor = {
    target,
    blockText: e.anchorBlockText,
    blockId: e.anchorBlockId,
    offsetPx: e.anchorOffsetPx,
    paragraphId: e.anchorBlockId,
    rangeStartId: e.rangeStartId,
    rangeStartText: e.rangeStartText,
    rangeEndId: e.rangeEndId,
    rangeEndText: e.rangeEndText,
    selection: e.quote,
    quote: e.quote,
  };
  if (
    typeof e.anchorCharStart === 'number' &&
    typeof e.anchorCharEnd === 'number'
  ) {
    anchor.range = {
      charStart: e.anchorCharStart,
      charEnd: e.anchorCharEnd,
    };
  }
  return {
    id: deriveNoteIdFromTraceEvent(trace.id, e.at, 'ta'),
    anchor,
    content: e.content,
    summary: e.summary,
    flags: {},
    at: e.at,
    __traceId: trace.id,
  };
}

/**
 * Convert a single highlight event to a Note. Highlights are Notes with
 * no content — just a marker at a char range with a quote. Useful for
 * rendering highlight overlays in the unified Note view.
 */
function highlightToNote(e: HighlightEvent, trace: Trace): Note {
  const target = docIdOfTrace(trace);
  const anchor: NoteAnchor = {
    target,
    paragraphId: e.anchor?.paragraphId,
    blockId: e.anchor?.blockId,
    blockText: e.anchor?.blockText,
    offsetPx: e.anchor?.offsetPx,
    rangeStartId: e.anchor?.rangeStartId,
    rangeStartText: e.anchor?.rangeStartText,
    rangeEndId: e.anchor?.rangeEndId,
    rangeEndText: e.anchor?.rangeEndText,
    selection: e.anchor?.selection ?? e.text,
    quote: e.text,
  };
  if (
    e.anchor &&
    typeof e.anchor.charStart === 'number' &&
    typeof e.anchor.charEnd === 'number'
  ) {
    anchor.range = {
      charStart: e.anchor.charStart,
      charEnd: e.anchor.charEnd,
    };
  }
  return {
    id: deriveNoteIdFromTraceEvent(trace.id, e.at, 'hl'),
    anchor,
    content: '',
    summary: e.text.slice(0, 80),
    flags: {},
    at: e.at,
    __traceId: trace.id,
  };
}

/**
 * Walk a trace's events and emit one Note per mappable event.
 *
 * Crystallize events are applied as a post-pass: for each crystallize
 * event with an anchorId, find Notes whose trace event's anchorId matched
 * and set their flags.crystallized = true.
 *
 * Note: multiple thought-anchor events at the same char range become
 * multiple Notes sharing the same anchor (but different ids + ats).
 * The View layer will be responsible for collapsing them into version
 * chains (via query.ts primitives in a later P).
 */
export function notesFromTrace(trace: Trace): Note[] {
  const notes: Note[] = [];
  const crystallizedAnchorIds = new Set<string>();
  const anchorIdByEventAt = new Map<number, string>();

  for (const e of trace.events) {
    if (e.kind === 'thought-anchor') {
      notes.push(thoughtAnchorToNote(e, trace));
      anchorIdByEventAt.set(e.at, e.anchorId);
    } else if (e.kind === 'highlight') {
      notes.push(highlightToNote(e, trace));
    } else if (e.kind === 'crystallize') {
      // Anchor-level crystallize carries an anchorId. Trace-level doesn't.
      const eAny = e as TraceEvent & { anchorId?: string };
      if (eAny.anchorId) {
        crystallizedAnchorIds.add(eAny.anchorId);
      }
    }
  }

  // Post-pass: mark Notes as crystallized whose underlying anchorId was crystallized
  if (crystallizedAnchorIds.size > 0) {
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const sourceAt = n.at;
      const originalAnchorId = anchorIdByEventAt.get(sourceAt);
      if (originalAnchorId && crystallizedAnchorIds.has(originalAnchorId)) {
        notes[i] = {
          ...n,
          flags: { ...n.flags, crystallized: true },
        };
      }
    }
  }

  return notes;
}

/**
 * Walk many traces and emit a flat Note[] across all of them.
 * Useful for queries that span a user's entire Personal Layer.
 *
 * Sorting is NOT applied here — the caller decides (by anchor, by time,
 * by doc, etc.) via query.ts primitives.
 */
export function notesFromTraces(traces: Trace[]): Note[] {
  const out: Note[] = [];
  for (const t of traces) {
    out.push(...notesFromTrace(t));
  }
  return out;
}
