'use client';
/**
 * Cosine similarity + batch query for Active Retrieval.
 *
 * Performance: 1000 notes × 768 dims = ~1.5M float ops = <0.2ms on M4.
 * No approximate nearest neighbor needed — brute force is fast enough.
 */
import { getEmbeddingsExcludingDoc } from './embeddings';

export function cosineSim(a: Float32Array, b: Float32Array): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom > 0 ? dot / denom : 0;
}

export type SimilarNote = {
  noteId: string;
  docId: string;
  score: number;
  text: string;
};

export async function findSimilarNotes(
  queryVec: Float32Array,
  excludeDocId: string,
  threshold = 0.78,
  maxResults = 5,
): Promise<SimilarNote[]> {
  const candidates = await getEmbeddingsExcludingDoc(excludeDocId);
  if (candidates.length === 0) return [];

  const scored = candidates
    .map((e) => ({
      noteId: e.noteId,
      docId: e.docId,
      score: cosineSim(queryVec, e.vector),
      text: e.text,
    }))
    .filter((e) => e.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  return scored;
}
