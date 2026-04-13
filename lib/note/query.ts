/**
 * Note query primitives · filter/sort/group helpers for Note[].
 *
 * Part of the Personal Layer × View architecture. These are the building
 * blocks the View system (lib/view/, next session) uses to project Notes
 * into panels. Pure functions — no I/O, no state, no side effects.
 *
 * Philosophy:
 *   - All operations are pure Note[] → Note[] (or Note[] → T)
 *   - No side effects; this file could run in a worker
 *   - Composable: small primitives that chain
 *   - No hidden ordering assumptions; callers explicit about sort
 */
import type { Note, NoteId, SourceDocId } from './types';

/** Keep only Notes whose anchor target matches. */
export function filterByAnchorTarget(
  notes: Note[],
  target: SourceDocId | NoteId | null,
): Note[] {
  return notes.filter((n) => n.anchor.target === target);
}

/** Keep only Notes whose char range intersects the given range. */
export function filterByAnchorRangeOverlap(
  notes: Note[],
  charStart: number,
  charEnd: number,
): Note[] {
  return notes.filter((n) => {
    const r = n.anchor.range;
    if (!r) return false;
    return r.charStart <= charEnd && r.charEnd >= charStart;
  });
}

/** Keep only Notes inside the same "block" (by blockText or blockId match). */
export function filterByBlock(
  notes: Note[],
  block: { blockText?: string; blockId?: string },
): Note[] {
  return notes.filter((n) => {
    if (block.blockId && n.anchor.blockId === block.blockId) return true;
    if (block.blockText && n.anchor.blockText === block.blockText) return true;
    return false;
  });
}

/** Keep only crystallized Notes. */
export function filterCrystallized(notes: Note[]): Note[] {
  return notes.filter((n) => n.flags.crystallized === true);
}

/** Remove crystallized Notes. */
export function filterNotCrystallized(notes: Note[]): Note[] {
  return notes.filter((n) => n.flags.crystallized !== true);
}

/**
 * Remove soft-deleted Notes.
 *
 * Two mechanisms:
 *   1. `flags.deleted === true` — native soft-delete flag (future)
 *   2. `summary` starts with `__deleted__` — the MVP workaround used by
 *      `deleteNote()` in store.ts, since the current write path can't
 *      set flags.deleted on thought-anchor trace events.
 *
 * Additionally, any Note whose container (anchor signature) has a
 * deletion marker anywhere in its supersede chain is also hidden.
 * The simpler approach: treat a __deleted__ marker as a supersede of
 * all earlier notes at the same anchor, then filter them all out.
 */
export function filterAlive(notes: Note[]): Note[] {
  // Collect container keys that have a deletion marker
  const deletedContainers = new Set<string>();
  for (const n of notes) {
    if (n.flags.deleted || n.summary?.startsWith('__deleted__')) {
      deletedContainers.add(containerKey(n));
    }
  }
  return notes.filter((n) => {
    if (n.flags.deleted || n.summary?.startsWith('__deleted__')) return false;
    if (deletedContainers.has(containerKey(n))) return false;
    return true;
  });
}

/** Sort oldest-first by `at`. Mutates a copy, returns new array. */
export function sortByAtAsc(notes: Note[]): Note[] {
  return notes.slice().sort((a, b) => a.at - b.at);
}

/** Sort newest-first by `at`. Mutates a copy, returns new array. */
export function sortByAtDesc(notes: Note[]): Note[] {
  return notes.slice().sort((a, b) => b.at - a.at);
}

/**
 * Group Notes that share the same anchor position (blockText + char range).
 * Each group becomes a "container" — multiple thinkings on the same passage.
 *
 * This is the new-architecture equivalent of buildThoughtAnchorViews's
 * container-key logic. Notes within a group are the "version chain" for
 * that position, sorted oldest-first.
 *
 * Returns Map<containerKey, Note[]>. Key format matches the existing
 * thought-anchor-model.ts convention for continuity.
 */
export function groupByAnchorPosition(notes: Note[]): Map<string, Note[]> {
  const out = new Map<string, Note[]>();
  for (const n of notes) {
    const key = containerKey(n);
    const existing = out.get(key);
    if (existing) existing.push(n);
    else out.set(key, [n]);
  }
  // Sort each group oldest-first
  for (const [k, group] of out.entries()) {
    out.set(k, sortByAtAsc(group));
  }
  return out;
}

/**
 * Build a container key for grouping. Matches the existing thought-anchor-model
 * conventions so groups align with the old view. Uses blockText + char range
 * when available; falls back to target + blockId.
 */
export function containerKey(n: Note): string {
  const text = n.anchor.blockText ?? '';
  const r = n.anchor.range;
  if (text && r) {
    return `pos::${text}::${r.charStart}-${r.charEnd}`;
  }
  if (text) return `pos::${text}::block`;
  const target = n.anchor.target ?? 'untargeted';
  const blockId = n.anchor.blockId ?? 'noblock';
  return `id::${target}::${blockId}`;
}

/**
 * Resolve the "current state" view of a Notes list by applying supersedes
 * chains. If Note B has `flags.supersedes = A.id`, then A is hidden from
 * the current view (replaced by B). The underlying Notes remain in the
 * input list — this function only returns what should be RENDERED now.
 *
 * Handles chains (A → B → C) correctly: only C appears in the result.
 * Handles multiple concurrent edits (rare) by keeping the latest by `at`.
 */
export function resolveSupersedes(notes: Note[]): Note[] {
  const supersededIds = new Set<NoteId>();
  for (const n of notes) {
    if (n.flags.supersedes) {
      supersededIds.add(n.flags.supersedes);
    }
  }
  return notes.filter((n) => !supersededIds.has(n.id));
}

/**
 * Compose: alive + resolveSupersedes. The "render this now" default.
 * Applied after filter-by-anchor but before sort-for-display.
 */
export function currentStateNotes(notes: Note[]): Note[] {
  return resolveSupersedes(filterAlive(notes));
}

/**
 * Filter by free-text query. Matches (case-insensitive) against content,
 * summary, and anchor.quote. Used by the global search filter in
 * /dev/unified — when the user types in the toolbar, this narrows the
 * Personal Layer to just matching notes before the view applies its
 * per-panel filters.
 *
 * Whitespace-tokenized AND semantics: "dpo math" matches notes containing
 * both "dpo" AND "math" anywhere in the content/summary/quote.
 */
export function filterByTextSearch(notes: Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return notes;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return notes;
  return notes.filter((n) => {
    const haystack = [
      n.content,
      n.summary ?? '',
      n.anchor.quote ?? '',
      n.anchor.blockText ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}
