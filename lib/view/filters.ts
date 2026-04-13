/**
 * View filters · evaluate declarative ViewFilter against a Note[].
 *
 * Filters in lib/view/types.ts are declarative data (serializable). This
 * module turns them into actual Note[] → Note[] operations by delegating to
 * lib/note/query primitives.
 */
import type { Note } from '../note/types';
import {
  filterByAnchorTarget,
  filterByBlock,
  filterCrystallized,
  filterNotCrystallized,
} from '../note/query';
import type { ViewFilter } from './types';

/**
 * Apply a ViewFilter to a Note[]. Pure function, no side effects.
 */
export function applyFilter(notes: Note[], filter: ViewFilter): Note[] {
  switch (filter.kind) {
    case 'all':
      return notes;
    case 'by-doc':
      return filterByAnchorTarget(notes, filter.docId);
    case 'by-note':
      return filterByAnchorTarget(notes, filter.noteId);
    case 'by-block':
      return filterByBlock(notes, {
        blockId: filter.blockId,
        blockText: filter.blockText,
      });
    case 'by-crystallized':
      return filter.want
        ? filterCrystallized(notes)
        : filterNotCrystallized(notes);
    case 'and':
      return filter.filters.reduce(
        (acc, f) => applyFilter(acc, f),
        notes,
      );
    default:
      // Exhaustiveness check — if a new ViewFilter kind is added, TS
      // will fail here.
      const _exhaustive: never = filter;
      return notes;
  }
}

/**
 * Convenience: apply a chain of filters (equivalent to `{kind:'and', filters}`).
 */
export function applyFilters(notes: Note[], filters: ViewFilter[]): Note[] {
  return filters.reduce((acc, f) => applyFilter(acc, f), notes);
}
