/**
 * View presets · the 6 learning states as View templates.
 *
 * For the MVP (P1), only two presets are implemented: Questioning and
 * Producing. The other four (Reviewing, Verifying, Ingesting, Recursing)
 * are stubbed and deferred to subsequent sessions.
 *
 * A preset is a pure function that takes context (current doc, available
 * Notes) and returns a View with panels configured. The View renderer
 * (render.ts) then resolves each panel's items.
 *
 * See memory/project_loom_unified_architecture.md §View presets for the
 * design intent.
 */
import type { View, ViewPreset, ViewPresetContext, Panel } from './types';

/**
 * Questioning · the default reading state.
 *
 * Layout:
 *   [thoughts panel: all notes on current doc] | [main panel: doc content] | [scratch panel: empty]
 *
 * The thoughts panel shows everything the user has captured on this doc.
 * The main panel is where they're reading.
 * The scratch panel is empty (no scratch notes yet) but available.
 */
export const QUESTIONING_PRESET: ViewPreset = {
  id: 'questioning',
  label: 'Questioning',
  description: 'Reading + capturing thoughts on the current doc',
  build(ctx: ViewPresetContext): View {
    const docId = ctx.docId;
    const panels: Panel[] = [
      {
        id: 'thoughts',
        role: 'thoughts',
        title: 'Thoughts on this doc',
        filter: docId
          ? { kind: 'by-doc', docId }
          : { kind: 'all' },
        items: [],  // resolved by renderer
      },
      {
        id: 'main',
        role: 'main',
        title: docId ?? 'No doc selected',
        // Main panel doesn't show Notes (the doc itself is displayed).
        // But we still pass a filter so any inline annotations on the main
        // can be surfaced. For now, empty filter.
        filter: { kind: 'all' },
        items: [],
      },
      {
        id: 'scratch',
        role: 'scratch',
        title: 'Scratch',
        filter: docId
          ? {
              kind: 'and',
              filters: [
                { kind: 'by-doc', docId },
                // (future) a flag or anchor-role distinguishing scratch from captures
              ],
            }
          : { kind: 'all' },
        items: [],
      },
    ];
    return {
      presetId: 'questioning',
      layout: 'panel-strip',
      zoom: 'content',
      panels,
      activePanelId: 'main',
    };
  },
};

/**
 * Producing · the reconstruction state (Phase 4).
 *
 * Layout:
 *   [source panel: current doc's captured thoughts] | [rehearsal panel: scratch] | [ai panel: examiner hints]
 *
 * The user is actively producing their understanding from memory. Main
 * panel is the rehearsal surface. Left is source material (their own
 * captures, for reference if they get stuck). Right is reserved for AI.
 */
export const PRODUCING_PRESET: ViewPreset = {
  id: 'producing',
  label: 'Producing',
  description: 'Reconstructing understanding from memory',
  build(ctx: ViewPresetContext): View {
    const docId = ctx.docId;
    const panels: Panel[] = [
      {
        id: 'source',
        role: 'reference',
        title: 'Your captures (reference)',
        filter: docId
          ? { kind: 'by-doc', docId }
          : { kind: 'all' },
        items: [],
      },
      {
        id: 'rehearsal',
        role: 'scratch',
        title: 'Rehearsal',
        // For MVP, show nothing (no scratch notes exist yet).
        filter: { kind: 'all' },  // replaced by actual rehearsal filter later
        items: [],
      },
      {
        id: 'ai',
        role: 'ai-chat',
        title: 'AI',
        filter: { kind: 'all' },
        items: [],
      },
    ];
    return {
      presetId: 'producing',
      layout: 'panel-strip',
      zoom: 'content',
      panels,
      activePanelId: 'rehearsal',
    };
  },
};

/**
 * Reviewing · second-pass reading, looking at accumulated captures alongside
 * the source material with stronger visual emphasis on what's already been
 * thought about.
 *
 * Layout:
 *   [thoughts (wider, read-focused)] | [main doc with annotations visible] | [(narrow) past iterations]
 */
export const REVIEWING_PRESET: ViewPreset = {
  id: 'reviewing',
  label: 'Reviewing',
  description: 'Second-pass reading, seeing accumulated understanding',
  build(ctx: ViewPresetContext): View {
    const docId = ctx.docId;
    const panels: Panel[] = [
      {
        id: 'thoughts',
        role: 'thoughts',
        title: 'Past thoughts',
        filter: docId ? { kind: 'by-doc', docId } : { kind: 'all' },
        items: [],
      },
      {
        id: 'main',
        role: 'main',
        title: docId ?? 'No doc selected',
        filter: { kind: 'all' },
        items: [],
      },
      {
        id: 'crystallized',
        role: 'reference',
        title: 'Crystallized',
        filter: docId
          ? {
              kind: 'and',
              filters: [
                { kind: 'by-doc', docId },
                { kind: 'by-crystallized', want: true },
              ],
            }
          : { kind: 'by-crystallized', want: true },
        items: [],
      },
    ];
    return {
      presetId: 'reviewing',
      layout: 'panel-strip',
      zoom: 'content',
      panels,
      activePanelId: 'main',
    };
  },
};

/**
 * Verifying · Phase 5, AI examiner asks questions, user answers.
 *
 * Layout:
 *   [reconstruction (reference)] | [examiner dialogue (main)] | [current captures]
 *
 * The main panel hosts the AI conversation. The left shows the user's
 * past reconstruction for reference. The right shows their captures so
 * they can quickly cite prior work when answering.
 *
 * Status: UI-only placeholder. The examiner itself is not yet built
 * — next session's P1 feature work.
 */
export const VERIFYING_PRESET: ViewPreset = {
  id: 'verifying',
  label: 'Verifying',
  description: 'AI examiner probes for gaps in your understanding',
  build(ctx: ViewPresetContext): View {
    const docId = ctx.docId;
    const panels: Panel[] = [
      {
        id: 'reconstruction',
        role: 'reference',
        title: 'Your reconstruction',
        // TODO: filter for reconstruction-kind Notes once that's distinguishable
        filter: docId ? { kind: 'by-doc', docId } : { kind: 'all' },
        items: [],
      },
      {
        id: 'examiner',
        role: 'examiner',
        title: 'Examiner',
        filter: { kind: 'all' },
        items: [],
      },
      {
        id: 'captures',
        role: 'thoughts',
        title: 'Your captures',
        filter: docId ? { kind: 'by-doc', docId } : { kind: 'all' },
        items: [],
      },
    ];
    return {
      presetId: 'verifying',
      layout: 'panel-strip',
      zoom: 'content',
      panels,
      activePanelId: 'examiner',
    };
  },
};

/**
 * Ingesting · Phase 0, turning raw materials into a learnable workspace.
 *
 * Layout:
 *   [raw materials list] | [AI-generated markdown organization] | [user adjustments]
 *
 * Status: UI-only placeholder. The ingestion pipeline (PDF parsing, AI
 * classification, auto-layout) is not yet built. This preset shows the
 * intended layout so future work has a target.
 */
export const INGESTING_PRESET: ViewPreset = {
  id: 'ingesting',
  label: 'Ingesting',
  description: 'Organizing raw materials into a learnable page',
  build(ctx: ViewPresetContext): View {
    const panels: Panel[] = [
      {
        id: 'materials',
        role: 'ingestion-materials',
        title: 'Materials',
        filter: { kind: 'all' },
        items: [],
      },
      {
        id: 'organized',
        role: 'ingestion-output',
        title: 'Organized',
        filter: { kind: 'all' },
        items: [],
      },
      {
        id: 'adjustments',
        role: 'scratch',
        title: 'Your adjustments',
        filter: { kind: 'all' },
        items: [],
      },
    ];
    return {
      presetId: 'ingesting',
      layout: 'panel-strip',
      zoom: 'content',
      panels,
      activePanelId: 'organized',
    };
  },
};

/**
 * Recursing · Phase 6, a past reconstruction becomes the new source
 * material for higher-level learning (fractal).
 *
 * Layout:
 *   [past reconstructions (browsable)] | [current focal reconstruction (as source)] | [new captures on it]
 *
 * Status: UI-only placeholder. Requires the write path + anchor-to-Note
 * capability before this is actually useful.
 */
export const RECURSING_PRESET: ViewPreset = {
  id: 'recursing',
  label: 'Recursing',
  description: 'Promoting a past reconstruction as a new source',
  build(ctx: ViewPresetContext): View {
    const panels: Panel[] = [
      {
        id: 'past-reconstructions',
        role: 'reference',
        title: 'Past reconstructions',
        filter: { kind: 'by-crystallized', want: true },
        items: [],
      },
      {
        id: 'focal-reconstruction',
        role: 'main',
        title: 'Focal reconstruction',
        filter: { kind: 'all' },
        items: [],
      },
      {
        id: 'new-captures',
        role: 'thoughts',
        title: 'New captures',
        filter: { kind: 'all' },
        items: [],
      },
    ];
    return {
      presetId: 'recursing',
      layout: 'panel-strip',
      zoom: 'content',
      panels,
      activePanelId: 'focal-reconstruction',
    };
  },
};

/** All implemented presets, keyed by id. */
export const PRESETS: Record<string, ViewPreset> = {
  questioning: QUESTIONING_PRESET,
  producing: PRODUCING_PRESET,
  reviewing: REVIEWING_PRESET,
  verifying: VERIFYING_PRESET,
  ingesting: INGESTING_PRESET,
  recursing: RECURSING_PRESET,
};

/** Get a preset by id. Throws if unknown. */
export function getPreset(id: string): ViewPreset {
  const p = PRESETS[id];
  if (!p) throw new Error(`Unknown View preset: ${id}`);
  return p;
}

/** List all presets for menu/switcher UI. */
export function listPresets(): ViewPreset[] {
  return Object.values(PRESETS);
}
