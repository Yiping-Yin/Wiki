/**
 * Loom · Trace public API
 *
 * Import everything from this module:
 *   import { traceStore, useTrace, useCreateTrace, type Trace } from '@/lib/trace';
 */

export type {
  Trace,
  TraceKind,
  TraceEvent,
  TraceSummary,
  TraceCreateInput,
  SourceAnchor,
  Prereq,
} from './types';

export { newTraceId, toSummary } from './types';

export { traceStore } from './store';

export {
  useTrace,
  useTracesForDoc,
  useTraceTree,
  useAllTraces,
  useTraceStats,
  useSearchTraces,
  useCreateTrace,
  useAppendEvent,
  useUpdateTrace,
  useDeleteTrace,
  useRemoveEvents,
} from './hooks';

export { migrateLegacyData, resetMigrationFlag, isMigrated } from './migrate';

export { useBacklinksForDoc } from './backlinks';
export type { Backlink } from './backlinks';

export { checkConceptStatus, checkConceptsBatch } from './concept-status';
export type { ConceptStatus, ConceptStatusResult } from './concept-status';

export {
  recallForDoc,
  recallForQuery,
  semanticRecallForDoc,
  semanticRecallForQuery,
  isSemanticRecallReady,
} from './recall';
export type { RecallHit } from './recall';

export {
  embedText,
  ensureTraceEmbedding,
  getCachedEmbedding,
  getAllCachedEmbeddings,
  clearAllEmbeddings,
  buildEmbeddingIndex,
  getIndexProgress,
  onIndexProgress,
  getEmbeddingPipelineState,
  traceSearchText,
  cosine,
  VECTOR_DIMENSION,
} from './embedding';
