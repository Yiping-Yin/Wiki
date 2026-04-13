# `lib/note/` · Personal Layer foundation

Landed 2026-04-12. This is the **first foothold** of the unified
`Personal Layer × View` architecture (see
`memory/project_loom_unified_architecture.md`).

## What this is

A small, read-only data layer that projects Loom's existing `trace` events
into the new unified `Note` type. Current UI (ChatFocus, ReviewThoughtMap,
AnchorDots, etc.) continues to use the old `Trace` + `TraceEvent` API
unchanged. New UI, built in subsequent sessions, will use these `Note`
primitives to render things in the new architecture.

## What's here

| File | Lines | Purpose |
|---|---|---|
| `types.ts` | ~170 | The `Note` type, `NoteAnchor`, `NoteFlags`, id helpers |
| `from-trace.ts` | ~180 | Adapter: `Trace[] → Note[]` (read-only, no mutation) |
| `query.ts` | ~180 | Filter/sort/group primitives: `filterByAnchorTarget`, `groupByAnchorPosition`, `resolveSupersedes`, `currentStateNotes`, etc. |

## What's deliberately NOT here yet

- ❌ `store.ts` — native Note write path (append-only IndexedDB store). Comes next session.
- ❌ `supersede.ts` — standalone edit-chain helpers (logic is inlined in `query.ts` as `resolveSupersedes` for now).
- ❌ Any UI components — next session starts building `NoteRenderer`, `Panel`, `PanelStrip`.
- ❌ View system — `lib/view/` doesn't exist yet.
- ❌ Actions (capture, transform, edit) — come after the View system.

## Why read-only first

Two reasons:

1. **Zero risk to existing users.** Current Loom continues to work unchanged. The adapter is a new code path, the old path is untouched.
2. **Unblocks the next session.** Next session can immediately start building UI against real Note data (via the adapter) without waiting for write-path or data migration work.

When writes come (next session or the one after), `store.ts` will produce natively-typed Notes that coexist with the adapter output. Eventually, once the adapter is no longer needed (all events have been converted), it can be removed.

## How to use (from new code)

```ts
import { notesFromTraces } from './from-trace';
import { filterByAnchorTarget, currentStateNotes, groupByAnchorPosition } from './query';
import type { Note } from './types';

// Get all traces for a doc (existing API)
const traces = await traceStore.getByDoc(docId);

// Project to Notes
const allNotes: Note[] = notesFromTraces(traces);

// Filter to this doc, apply current state (supersedes + alive)
const relevant = currentStateNotes(filterByAnchorTarget(allNotes, docId));

// Group by anchor position (same as old thought-anchor-model container key)
const byContainer = groupByAnchorPosition(relevant);
// → Map<containerKey, Note[]> where each value is the version chain
```

## Relationship to existing `components/thought-anchor-model.ts`

`thought-anchor-model.ts` is the CURRENT way to read thought-anchor events. It builds `ThoughtAnchorView[]` which are pre-aggregated per-container with version chains inlined.

`lib/note/` is the NEW way. It returns flat `Note[]` and lets the caller decide how to filter/group/sort.

Both work on the same underlying data. During the transition, existing UI uses `thought-anchor-model`, new UI uses `lib/note/`. No migration needed for data, only for code.

## North star checks (for future contributors)

Before extending this module, verify:

- [ ] A (no organization actions): are we requiring the user to classify?
- [ ] B (location by source): are we inventing user-chosen positions?
- [ ] C (zero cognitive footprint): does the user need to think about `Note` as a concept, or does it feel like "just a note"?
- [ ] D (edit rights on AI output): can the user edit anything produced?
- [ ] E (annotate rights on source): does the user have a capture/anchor path for any doc passage? (NOT: can they mutate the source file.)

If any answer is uncomfortable, stop and read `memory/feedback_learn_not_organize.md`.

## Session that landed this

2026-04-12 early morning, after 16 rounds of design refinement that produced
the unified architecture. This is ~530 lines of the first real building block
of the new Loom. Everything above it — Views, panels, actions, features —
builds on this foundation.
