/**
 * Concept status heuristic.
 *
 * Given a concept name, search the user's Trace store for related panels and
 * decide whether they "know" it, partially know it, or have never seen it.
 *
 *   ●  known    — has a recent crystallized trace with high mastery
 *   ◐  stale    — has some history but old or low mastery
 *   ✗  unknown  — no relevant trace at all
 */

import { traceStore } from './store';
import type { Trace } from './types';

const STALE_DAYS = 30;
const KNOWN_MASTERY_THRESHOLD = 0.6;

export type ConceptStatus = 'known' | 'stale' | 'unknown';

export type ConceptStatusResult = {
  status: ConceptStatus;
  /** The best matching Trace, if any. */
  bestMatch?: Trace;
  /** Score 0..1 of how confidently this concept is "known". */
  score: number;
};

/** Lower-cased token set from a string. */
function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2),
  );
}

/** Jaccard-ish similarity between two token sets. */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.max(a.size, b.size);
}

/** Check the status of a single concept against the user's Trace library. */
export async function checkConceptStatus(concept: string): Promise<ConceptStatusResult> {
  const all = await traceStore.getAll();
  if (all.length === 0) return { status: 'unknown', score: 0 };

  const conceptTokens = tokenize(concept);
  let bestMatch: Trace | null = null;
  let bestScore = 0;

  for (const t of all) {
    // Score against title (strongest signal)
    const titleSim = similarity(conceptTokens, tokenize(t.title));
    // Score against crystallized summary
    const summarySim = t.crystallizedSummary
      ? similarity(conceptTokens, tokenize(t.crystallizedSummary))
      : 0;
    // Score against concept name (if this is a Concept-kind trace)
    const conceptNameSim = t.concept?.name
      ? similarity(conceptTokens, tokenize(t.concept.name))
      : 0;

    const sim = Math.max(titleSim, summarySim, conceptNameSim);
    if (sim > bestScore) {
      bestScore = sim;
      bestMatch = t;
    }
  }

  if (!bestMatch || bestScore < 0.25) {
    return { status: 'unknown', score: 0 };
  }

  const now = Date.now();
  const daysSinceTouch = (now - bestMatch.updatedAt) / (1000 * 60 * 60 * 24);
  const isFresh = daysSinceTouch < STALE_DAYS;
  const hasMastery = bestMatch.mastery >= KNOWN_MASTERY_THRESHOLD;

  // Combined score: similarity × (mastery floor 0.3) × freshness factor
  const freshnessFactor = isFresh ? 1 : Math.max(0.3, 1 - (daysSinceTouch - STALE_DAYS) / 60);
  const combinedScore = bestScore * Math.max(0.3, bestMatch.mastery) * freshnessFactor;

  const status: ConceptStatus =
    isFresh && hasMastery && bestScore > 0.45 ? 'known' :
    bestScore > 0.30 ? 'stale' :
    'unknown';

  return { status, bestMatch, score: combinedScore };
}

/** Batch version — checks many concepts in parallel against the same trace store. */
export async function checkConceptsBatch(concepts: string[]): Promise<Map<string, ConceptStatusResult>> {
  const all = await traceStore.getAll();
  const result = new Map<string, ConceptStatusResult>();

  if (all.length === 0) {
    for (const c of concepts) result.set(c, { status: 'unknown', score: 0 });
    return result;
  }

  // Pre-tokenize all traces once
  const indexed = all.map((t) => ({
    trace: t,
    titleTokens: tokenize(t.title),
    summaryTokens: t.crystallizedSummary ? tokenize(t.crystallizedSummary) : new Set<string>(),
    conceptTokens: t.concept?.name ? tokenize(t.concept.name) : new Set<string>(),
  }));

  for (const concept of concepts) {
    const conceptTokens = tokenize(concept);
    let bestMatch: Trace | null = null;
    let bestScore = 0;

    for (const item of indexed) {
      const sim = Math.max(
        similarity(conceptTokens, item.titleTokens),
        similarity(conceptTokens, item.summaryTokens),
        similarity(conceptTokens, item.conceptTokens),
      );
      if (sim > bestScore) {
        bestScore = sim;
        bestMatch = item.trace;
      }
    }

    if (!bestMatch || bestScore < 0.25) {
      result.set(concept, { status: 'unknown', score: 0 });
      continue;
    }

    const daysSinceTouch = (Date.now() - bestMatch.updatedAt) / (1000 * 60 * 60 * 24);
    const isFresh = daysSinceTouch < STALE_DAYS;
    const hasMastery = bestMatch.mastery >= KNOWN_MASTERY_THRESHOLD;
    const freshnessFactor = isFresh ? 1 : Math.max(0.3, 1 - (daysSinceTouch - STALE_DAYS) / 60);
    const combinedScore = bestScore * Math.max(0.3, bestMatch.mastery) * freshnessFactor;

    const status: ConceptStatus =
      isFresh && hasMastery && bestScore > 0.45 ? 'known' :
      bestScore > 0.30 ? 'stale' :
      'unknown';

    result.set(concept, { status, bestMatch, score: combinedScore });
  }

  return result;
}
