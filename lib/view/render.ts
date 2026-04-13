/**
 * View render · resolve a View preset (with a context) into a concrete View
 * with realized Panel.items. Pure function, no DOM.
 *
 * The renderer takes a ViewPreset + ViewPresetContext and produces a View
 * where each Panel has its items resolved from the Personal Layer through
 * the filter → sort → supersedes-resolution pipeline.
 */
import type { Note } from '../note/types';
import { currentStateNotes, sortByAtDesc } from '../note/query';
import type { Panel, View, ViewPreset, ViewPresetContext } from './types';
import { applyFilter } from './filters';

/**
 * Resolve a single Panel: apply filter, compute current state, sort newest
 * first. The focal defaults to the newest item unless the Panel specifies
 * an explicit focal.
 */
export function resolvePanel(panel: Panel, allNotes: Note[]): Panel {
  const filtered = applyFilter(allNotes, panel.filter);
  const alive = currentStateNotes(filtered);
  const sorted = sortByAtDesc(alive);
  const focal = panel.focal ?? sorted[0]?.id;
  return {
    ...panel,
    items: sorted,
    focal,
  };
}

/**
 * Build a View from a preset + context. This is the main entry point used
 * by page components. Each Panel's items are computed from the allNotes.
 */
export function buildView(
  preset: ViewPreset,
  ctx: ViewPresetContext,
): View {
  const view = preset.build(ctx);
  return {
    ...view,
    panels: view.panels.map((p) => resolvePanel(p, ctx.allNotes)),
  };
}
