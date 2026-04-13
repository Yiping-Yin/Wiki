/**
 * Recall · find past Traces that are relevant to a current context.
 *
 * Two flavors:
 *   - recallForDoc(docId, sourceTitle)  — when the user opens a doc, find
 *     other Traces (on different docs) whose topic resembles this one
 *   - recallForQuery(text)              — as the user types a draft message,
 *     find Traces that have similar content
 *
 * Both exclude the current doc's own Trace, and rank by combined similarity +
 * mastery + recency. Returns at most `limit` results, sorted strongest first.
 */

import { traceStore } from './store';
import type { Trace } from './types';
import {
  embedText,
  getAllCachedEmbeddings,
  cosine,
  getEmbeddingPipelineState,
} from './embedding';

export type RecallHit = {
  trace: Trace;
  /** 0..1 — combined relevance score */
  score: number;
  /** Why this trace was matched (for UI display) */
  reason: string;
};

/* ─────────── tokenization ─────────── */

const STOP = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','of','to','in','on','at','for','from','by','with','as','this',
  'that','these','those','it','its','if','then','than','and','or','but','not','no',
  'so','too','very','can','will','would','should','could','may','might','must',
  'i','me','my','we','our','you','your','he','she','they','them','what','which',
  'who','whom','how','why','when','where','what','so',
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2 && !STOP.has(t)),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  // Use overlap coefficient (more forgiving for short queries)
  return inter / Math.min(a.size, b.size);
}

/** Combine raw similarity with trace's mastery + recency. */
function rankScore(sim: number, t: Trace): number {
  if (sim === 0) return 0;
  const days = (Date.now() - t.updatedAt) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0.4, 1 - days / 180); // half-life ~180 days
  const mastery = Math.max(0.4, t.mastery);
  return sim * mastery * recency;
}

/* ─────────── public API ─────────── */

/** Recall: traces related to the doc the user just opened. */
export async function recallForDoc(
  currentDocId: string,
  currentSourceTitle: string,
  limit = 3,
): Promise<RecallHit[]> {
  const all = await traceStore.getAll();
  if (all.length === 0) return [];

  const queryTokens = tokenize(currentSourceTitle);
  if (queryTokens.size === 0) return [];

  const hits: RecallHit[] = [];
  for (const t of all) {
    // Skip the current doc's own traces
    if (t.source?.docId === currentDocId) continue;
    // Only consider root-level traces (kind='reading' or 'concept' or 'problem'), not orphan free traces
    if (t.parentId !== null) continue;

    const titleSim = similarity(queryTokens, tokenize(t.title));
    const summarySim = t.crystallizedSummary
      ? similarity(queryTokens, tokenize(t.crystallizedSummary))
      : 0;
    const sim = Math.max(titleSim, summarySim * 0.85);

    if (sim < 0.20) continue;

    const score = rankScore(sim, t);
    const reason = titleSim >= summarySim
      ? `title match`
      : `summary match`;

    hits.push({ trace: t, score, reason });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Recall: traces matching the user's live draft query. */
export async function recallForQuery(
  query: string,
  excludeDocId?: string,
  limit = 5,
): Promise<RecallHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 4) return [];

  const queryTokens = tokenize(trimmed);
  if (queryTokens.size < 1) return [];

  const all = await traceStore.getAll();
  if (all.length === 0) return [];

  const hits: RecallHit[] = [];
  for (const t of all) {
    if (excludeDocId && t.source?.docId === excludeDocId) continue;

    let bestSim = 0;
    let bestReason = '';

    // Title
    const titleSim = similarity(queryTokens, tokenize(t.title));
    if (titleSim > bestSim) { bestSim = titleSim; bestReason = 'title'; }

    // Crystallized summary
    if (t.crystallizedSummary) {
      const sim = similarity(queryTokens, tokenize(t.crystallizedSummary));
      if (sim > bestSim) { bestSim = sim; bestReason = 'summary'; }
    }

    // Concept name (for concept-kind)
    if (t.concept?.name) {
      const sim = similarity(queryTokens, tokenize(t.concept.name));
      if (sim > bestSim) { bestSim = sim; bestReason = 'concept'; }
    }

    // Message contents (cap to last 8 messages for speed)
    const messages = t.events
      .filter((e): e is Extract<typeof e, { kind: 'message' }> => e.kind === 'message')
      .slice(-8);
    for (const m of messages) {
      const sim = similarity(queryTokens, tokenize(m.content));
      if (sim > bestSim) { bestSim = sim; bestReason = 'message'; }
    }

    if (bestSim < 0.25) continue;
    hits.push({ trace: t, score: rankScore(bestSim, t), reason: bestReason });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* ─────────── Semantic recall (embedding-based) ─────────── */

/** Combine semantic similarity with mastery and recency. */
function semanticRankScore(sim: number, t: Trace): number {
  if (sim <= 0) return 0;
  const days = (Date.now() - t.updatedAt) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0.4, 1 - days / 180);
  const mastery = Math.max(0.5, t.mastery);
  return sim * mastery * recency;
}

/**
 * Semantic recall · embedding-based.
 *
 * Embeds the query, walks all cached trace embeddings, computes cosine
 * similarity, and returns top hits. Falls back to token recall (recallForDoc /
 * recallForQuery) if no cached embeddings exist or the model fails to load.
 */
export async function semanticRecallForQuery(
  query: string,
  excludeDocId?: string,
  limit = 5,
): Promise<RecallHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < 4) return [];

  const cached = await getAllCachedEmbeddings();
  if (cached.length === 0) {
    // Fall back to token recall — at least something works
    return recallForQuery(query, excludeDocId, limit);
  }

  let queryVec: Float32Array;
  try {
    queryVec = await embedText(trimmed);
  } catch {
    return recallForQuery(query, excludeDocId, limit);
  }

  const all = await traceStore.getAll();
  const traceById = new Map(all.map((t) => [t.id, t]));

  const hits: RecallHit[] = [];
  for (const rec of cached) {
    const t = traceById.get(rec.traceId);
    if (!t) continue;
    if (excludeDocId && t.source?.docId === excludeDocId) continue;
    const sim = cosine(queryVec, rec.vector);
    if (sim < 0.30) continue;
    hits.push({
      trace: t,
      score: semanticRankScore(sim, t),
      reason: `semantic ${(sim * 100).toFixed(0)}%`,
    });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export async function semanticRecallForDoc(
  currentDocId: string,
  currentSourceTitle: string,
  limit = 3,
): Promise<RecallHit[]> {
  const cached = await getAllCachedEmbeddings();
  if (cached.length === 0) {
    return recallForDoc(currentDocId, currentSourceTitle, limit);
  }

  let queryVec: Float32Array;
  try {
    queryVec = await embedText(currentSourceTitle);
  } catch {
    return recallForDoc(currentDocId, currentSourceTitle, limit);
  }

  const all = await traceStore.getAll();
  const traceById = new Map(all.map((t) => [t.id, t]));

  const hits: RecallHit[] = [];
  for (const rec of cached) {
    const t = traceById.get(rec.traceId);
    if (!t) continue;
    if (t.source?.docId === currentDocId) continue;
    if (t.parentId !== null) continue; // root traces only
    const sim = cosine(queryVec, rec.vector);
    if (sim < 0.30) continue;
    hits.push({
      trace: t,
      score: semanticRankScore(sim, t),
      reason: `semantic ${(sim * 100).toFixed(0)}%`,
    });
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Whether the embedding pipeline is ready. UI can use this to decide which path. */
export function isSemanticRecallReady(): boolean {
  return getEmbeddingPipelineState().state === 'ready';
}
