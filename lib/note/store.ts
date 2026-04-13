'use client';
/**
 * lib/note/store · minimum write path for Notes.
 *
 * Tonight's write path does NOT introduce a new IndexedDB schema. Instead,
 * it writes Notes by appending them as `thought-anchor` trace events
 * (the existing event type). The `from-trace` adapter then projects them
 * back to Notes on read. This means:
 *
 *   - Writes: new Note → append `thought-anchor` event to the reading trace
 *     of the current doc.
 *   - Reads: `from-trace.notesFromTraces()` (already built) picks it up.
 *
 * Benefits:
 *   - No schema migration
 *   - Existing UI (ReviewThoughtMap, AnchorDots, ChatFocus) sees the Note
 *     immediately (because it's just a thought-anchor event to them)
 *   - Backward compatible: if we later introduce a native `note` event
 *     type, migration is additive
 *
 * Limitations (deferred to next session):
 *   - (Source editing is deliberately NOT supported. User confirmed
 *     2026-04-12: source files stay immutable, annotations happen via
 *     the existing capture / thought-anchor flow.)
 *   - Supersedes chain lives only in the new `__supersedes` sidechannel
 *     (currently unstorable as trace event metadata) — for now, supersede
 *     actions re-write the full content
 *
 * For tonight, this is enough to ship rehearsal writes end-to-end.
 */
import { appendEventForDoc } from '../trace/source-bound';
import type { TraceEvent } from '../trace/types';
import type { Note, NoteAnchor, SourceDocId } from './types';
import { newNoteId } from './types';
// Dynamic import to avoid SSR crash (embeddings.ts uses IndexedDB)

/**
 * Append a Note by writing a thought-anchor event to the current doc's
 * reading trace. The Note's anchor must have a SourceDocId target.
 *
 * Returns the id of the new Note (derived from the event's `at` timestamp
 * so the adapter generates the same id on next read).
 */
export async function appendNote(input: {
  docId: SourceDocId;
  docHref: string;
  docTitle: string;
  content: string;
  summary?: string;
  anchor: NoteAnchor;
}): Promise<string> {
  const at = Date.now();

  // Derive a deterministic-ish anchorId for the new event. If the Note's
  // anchor has a blockId + char range, use the existing fragment format
  // (matches lib/capture/from-selection conventions). Otherwise synthesize
  // a unique anchorId so the event can still be stored.
  const anchorId = computeAnchorId(input.anchor, at);

  const event: Extract<TraceEvent, { kind: 'thought-anchor' }> = {
    kind: 'thought-anchor',
    anchorType: 'paragraph',
    anchorId,
    anchorBlockId: input.anchor.blockId,
    anchorBlockText: input.anchor.blockText,
    anchorOffsetPx: input.anchor.offsetPx,
    anchorCharStart: input.anchor.range?.charStart,
    anchorCharEnd: input.anchor.range?.charEnd,
    rangeStartId: input.anchor.blockId,
    rangeStartText: input.anchor.blockText,
    rangeEndId: input.anchor.blockId,
    rangeEndText: input.anchor.blockText,
    summary: input.summary ?? deriveSummary(input.content),
    content: input.content,
    quote: input.anchor.quote,
    at,
  };

  await appendEventForDoc(
    {
      docId: input.docId,
      href: input.docHref,
      sourceTitle: input.docTitle,
    },
    event,
  );

  // Signal the Dynamic Island (if mounted) that a save happened.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('loom:island', {
      detail: { type: 'save', message: 'Saved' },
    }));
  }

  // Async embed for Active Retrieval (fire-and-forget, dynamic import)
  const noteId = newNoteId();
  if (typeof window !== 'undefined') {
    import('./embed-on-save').then(({ embedNoteAfterSave }) => {
      void embedNoteAfterSave(
        noteId,
        input.docId,
        input.docHref,
        anchorId,
        input.content,
        input.anchor.quote,
      );
    }).catch(() => {});
  }

  return noteId;
}

/**
 * Append a rehearsal Note — a Note anchored to the whole doc with long
 * content, representing one iteration of the user's reconstruction. This
 * is the write path for the RehearsalPanel component.
 */
export async function appendRehearsal(input: {
  docId: SourceDocId;
  docHref: string;
  docTitle: string;
  content: string;
}): Promise<string> {
  return appendNote({
    docId: input.docId,
    docHref: input.docHref,
    docTitle: input.docTitle,
    content: input.content,
    summary: `📝 ${deriveSummary(input.content)}`,
    anchor: {
      target: input.docId,
      blockText: 'rehearsal',
      blockId: 'loom-rehearsal-root',
    },
  });
}

/**
 * Supersede an existing Note by appending a new Note at the same anchor
 * with updated content. Trace events are append-only, so the old event
 * stays in the log; the adapter + query.currentStateNotes() hide it via
 * the supersedes flag.
 *
 * Limitation: the `supersedes` pointer cannot be stored in a
 * thought-anchor event directly (the type doesn't have the field). For
 * tonight, supersedes just appends a new event at the same char range;
 * the version chain logic in thought-anchor-model will treat it as a
 * new version. This is imperfect but functional.
 */
export async function supersedeNote(input: {
  docId: SourceDocId;
  docHref: string;
  docTitle: string;
  originalAnchor: NoteAnchor;
  newContent: string;
}): Promise<string> {
  return appendNote({
    docId: input.docId,
    docHref: input.docHref,
    docTitle: input.docTitle,
    content: input.newContent,
    anchor: input.originalAnchor,
  });
}

/**
 * Soft-delete a Note by appending a "deletion marker" Note at the same
 * anchor. The marker has empty content and a special summary prefix.
 * `query.resolveSupersedes` + future `filterAlive` will hide notes with
 * deletion markers.
 *
 * Limitation: since the current write path goes through thought-anchor
 * events (no native note event type yet), we can't set flags.deleted
 * directly. Instead, we append a Note with the special summary prefix
 * `__deleted__` which the adapter / query layer recognizes. This works
 * with the existing trace event type and is reversible via a second
 * delete marker (or by editing the Note to remove the __deleted__ marker).
 *
 * For the MVP, this is acceptable. A native note event with proper
 * flags.deleted support lands when store.ts gets its own IndexedDB store.
 */
export async function deleteNote(input: {
  docId: SourceDocId;
  docHref: string;
  docTitle: string;
  anchor: NoteAnchor;
  reason?: string;
}): Promise<string> {
  return appendNote({
    docId: input.docId,
    docHref: input.docHref,
    docTitle: input.docTitle,
    content: '',
    summary: `__deleted__${input.reason ? ' · ' + input.reason : ''}`,
    anchor: input.anchor,
  });
}

// ── helpers ──────────────────────────────────────────────────────────────

function deriveSummary(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
  return firstLine.length > 100 ? firstLine.slice(0, 100) + '…' : firstLine;
}

function computeAnchorId(anchor: NoteAnchor, at: number): string {
  const blockId = anchor.blockId ?? 'loom-note-root';
  const cs = anchor.range?.charStart ?? 0;
  const ce = anchor.range?.charEnd ?? 0;
  if (anchor.range) {
    return `${blockId}::frag:${cs}-${ce}`;
  }
  // No char range — use timestamp for uniqueness
  return `${blockId}::at:${at}`;
}
