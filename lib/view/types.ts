/**
 * View types · Loom's unified Personal Layer × View architecture.
 *
 * A View is a declarative description of "what's on screen right now". It
 * consists of a layout, a set of panels, a zoom level, and a cursor. Changing
 * a View does not mutate data — it reconfigures which Notes get rendered
 * where.
 *
 * Every "learning state" in Loom (Questioning, Producing, Verifying, ...) is
 * a View preset. See lib/view/presets.ts for the concrete presets.
 *
 * See memory/project_loom_unified_architecture.md for full design.
 */
import type { Note, NoteId, SourceDocId } from '../note/types';

/** A View's layout option. Currently only panel-strip; overview later. */
export type ViewLayout = 'panel-strip' | 'overview';

/** Zoom level, from closest (content) to farthest (all panels overview). */
export type ViewZoom = 'content' | 'collection' | 'overview';

/**
 * A filter is a pure function Note[] → Note[] composed from lib/note/query
 * primitives. Filters are serializable (can be restored from JSON) because
 * they carry enough metadata for the View render to reconstruct them.
 *
 * Keep filters declarative — no closures over runtime state.
 */
export type ViewFilter =
  | { kind: 'by-doc'; docId: SourceDocId }
  | { kind: 'by-note'; noteId: NoteId }
  | { kind: 'by-block'; blockId?: string; blockText?: string }
  | { kind: 'by-crystallized'; want: boolean }
  | { kind: 'all' }
  | { kind: 'and'; filters: ViewFilter[] };

/**
 * A Panel is a slot in the View. It has a filter (which Notes belong here),
 * a list of items (result of the filter + any additional sorting), a focal
 * item (the currently-featured one), and a display role.
 *
 * The display role tells the renderer how to style this panel. It is
 * advisory — the user can override via drag/promote/demote actions.
 */
export type PanelRole =
  | 'thoughts'
  | 'main'
  | 'scratch'
  | 'reference'
  | 'ai-chat'
  | 'examiner'
  | 'ingestion-materials'
  | 'ingestion-output';

/**
 * A Panel is computed by the render pass: filter is applied to the Note[],
 * items are resolved, focal is picked (either explicit or the newest).
 */
export type Panel = {
  id: string;              // stable id for React key
  role: PanelRole;         // display role hint
  title?: string;          // optional display title
  filter: ViewFilter;      // which Notes this panel contains
  items: Note[];           // resolved items (after filter + sort)
  focal?: NoteId;          // explicit focal; otherwise renderer picks newest
};

/**
 * A View is the top-level config for what's on screen. It names itself
 * (the preset id), describes the layout, and lists panels in display order.
 */
export type View = {
  /** Preset id (e.g. 'questioning', 'producing') or 'custom' for user-tuned. */
  presetId: string;
  layout: ViewLayout;
  zoom: ViewZoom;
  panels: Panel[];
  /** Optional focus hint: which panel should be "active" by default. */
  activePanelId?: string;
};

/**
 * A ViewPreset is a template for producing a View given the current context
 * (the current doc being viewed, the set of available Notes, etc.). Presets
 * are pure functions — call them to get a View. See lib/view/presets.ts.
 */
export type ViewPresetContext = {
  /** The doc currently in focus (if any). */
  docId: SourceDocId | null;
  /** All Notes available in the Personal Layer (adapter output or native). */
  allNotes: Note[];
};

export type ViewPreset = {
  id: string;
  label: string;          // human name ("Questioning", "Producing", ...)
  description: string;    // one-line description for menus/help
  build: (ctx: ViewPresetContext) => View;
};
