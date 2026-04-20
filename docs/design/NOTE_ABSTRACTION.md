# Note Abstraction — MVP Status

**Established 2026-04-20 after architecture audit.**

## The claim vs the reality

`lib/note/types.ts` declares:

> Every user-created thing in Loom is a Note. Thought-anchors,
> reconstructions, annotations, captures, and highlights are ALL just
> Notes with different `anchor` targets, content, and flags.

This is **aspirational**. The actual implementation is:

- **Reads** (`lib/note/from-trace.ts`): Notes are *projected* from
  `thought-anchor` trace events. No native Note store.
- **Writes** (`lib/note/store.ts`): `appendNote` appends a
  `thought-anchor` trace event, not a Note record.
- **Supersedes chain** (`flags.supersedes`): cannot be stored in a
  trace event. The Note layer pretends it can, but the write path
  drops it.

## Current status: view-over-trace

Notes are a **read-side convenience layer over trace events**. Not a
complete data abstraction. This is MVP.

## What works today

- Read: `notesFromTrace(trace)` returns a `Note[]` view of a trace's
  thought-anchors.
- Append: `appendNote({ docId, content, summary, anchor })` writes a
  thought-anchor event to the doc's reading trace.
- Delete: soft-delete via flags.deleted works within a session because
  the trace adapter honours flags on read — but flags don't round-trip
  through IndexedDB.

## What silently doesn't work

- `flags.supersedes` chains: cannot persist. The Note layer computes
  supersedes client-side but there's no way to re-emit a supersede edge
  to a trace event.
- Cross-doc notes: Notes are anchored to one doc (via
  `anchor.target === docId`). A Note summarizing across docs has no
  home.
- Native Note indexes, queries, aggregations: not supported.

## The decision

**Keep the view-over-trace MVP until a real use case emerges.** Do not
build a native Note store for Note store's sake. The trace layer is
append-only, source of truth, and sufficient for current flows
(capture, Panel derive, anchored display).

## If you're about to add a feature that touches Notes

1. **Read side** — use `notesFromTrace()` or the `useNotes` hook. Treat
   Notes as a read projection, not persistent records.
2. **Write side** — append a `thought-anchor` trace event. Do not
   attempt to persist Note-level flags.
3. **If you genuinely need a feature the trace layer can't express**
   (native edit history, cross-doc notes, per-note metadata), THAT is
   the trigger to promote Note to a real store. At that point, add a
   `notes` IndexedDB store, add migration from thought-anchor events,
   and document the transition.

## Signals that the MVP is no longer enough

- You find yourself wanting to query notes without loading all traces.
- You need per-note metadata that can't be embedded in
  thought-anchor.content.
- You need to delete a note without leaving a deleted thought-anchor
  event behind.
- You need to attach a note to something that isn't a passage anchor
  (a whole doc, a Panel, a query result).

Until one of these genuinely blocks work, the abstraction stays view-only.
