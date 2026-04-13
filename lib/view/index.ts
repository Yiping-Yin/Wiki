/**
 * lib/view · public API
 *
 * Importing `lib/view` gets you the types, filter eval, render pipeline,
 * and preset registry. Internal files can import from specific modules.
 */
export * from './types';
export { applyFilter, applyFilters } from './filters';
export { buildView, resolvePanel } from './render';
export {
  PRESETS,
  getPreset,
  listPresets,
  QUESTIONING_PRESET,
  PRODUCING_PRESET,
  REVIEWING_PRESET,
  VERIFYING_PRESET,
  INGESTING_PRESET,
  RECURSING_PRESET,
} from './presets';
