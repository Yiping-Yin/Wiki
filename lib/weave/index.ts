'use client';

export type { Weave, WeaveKind, WeaveStatus, WeaveEvidence, WeaveRevision, WeaveContractSource } from './types';
export { WEAVE_KINDS, weaveKindLabel } from './types';
export { weaveStore } from './store';
export { deriveSuggestedWeaves, deriveSuggestedWeavesForSourcePanels } from './derive';
export { useAllWeaves, setWeaveStatus, updateWeaveContract, setWeaveKind } from './hooks';
export { createManualWeave } from './manual';
export { buildWeavePreview, type DirectedWeavePreview, type WeavePreviewItem } from './preview';
export { weavePersistedEqual } from './selectors';
export { emitWeaveChange, WEAVE_CHANGE_EVENT } from './events';
export { buildWeaveContract, applyWeaveContract } from './contract';
export { buildWeaveRevisionActionSeed, sortedWeaveRevisions, weaveRevisionChanges, weaveRevisionCount, weaveRevisionLabel } from './revisions';
