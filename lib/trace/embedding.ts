'use client';
/**
 * Local embedding wrapper for Loom · semantic recall.
 *
 * Uses @huggingface/transformers (Xenova/all-MiniLM-L6-v2) to compute 384-dim
 * sentence embeddings entirely in the browser. The model (~25 MB) is fetched
 * from a CDN on first use and cached by the browser.
 *
 * Embeddings are cached in IndexedDB keyed by trace id. When a trace's
 * `updatedAt` exceeds the cached embedding's `at`, the embedding is recomputed.
 *
 * The pipeline is lazy-initialized — nothing happens unless someone actually
 * calls embedText() or runs the indexer.
 */

import type { Trace } from './types';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const DB_NAME = 'loom-embeddings';
const DB_VERSION = 1;
const STORE = 'vectors';
const VECTOR_DIM = 384;

/* ─────────── Pipeline lazy init ─────────── */

type Embedder = (text: string | string[], opts?: any) => Promise<{ data: Float32Array | number[] }>;

let _pipelinePromise: Promise<Embedder> | null = null;
let _pipelineState: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
let _pipelineError: string | null = null;

export function getEmbeddingPipelineState(): {
  state: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
} {
  return { state: _pipelineState, error: _pipelineError };
}

async function loadPipeline(): Promise<Embedder> {
  if (_pipelinePromise) return _pipelinePromise;
  if (typeof window === 'undefined') throw new Error('embeddings only available on the client');

  _pipelineState = 'loading';
  _pipelineError = null;

  _pipelinePromise = (async () => {
    try {
      // Dynamic import to keep transformers out of the initial bundle
      const tx = await import('@huggingface/transformers');
      const pipe = await tx.pipeline('feature-extraction', MODEL_ID, {
        // Try local model first, fall back to remote
        // dtype: 'fp32',
      });
      _pipelineState = 'ready';
      // Adapt: some versions return { data, dims }, we just need data
      return ((text: string | string[], opts?: any) => pipe(text, opts ?? { pooling: 'mean', normalize: true })) as unknown as Embedder;
    } catch (e: any) {
      _pipelineState = 'error';
      _pipelineError = e.message;
      _pipelinePromise = null;
      throw e;
    }
  })();

  return _pipelinePromise;
}

/* ─────────── DB for cached embeddings ─────────── */

let _embDbPromise: Promise<IDBDatabase> | null = null;

function openEmbDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  if (_embDbPromise) return _embDbPromise;
  _embDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'traceId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _embDbPromise;
}

type EmbeddingRecord = {
  traceId: string;
  vector: Float32Array;
  at: number;
  textLength: number;
};

function dbTx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openEmbDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

export async function getCachedEmbedding(traceId: string): Promise<EmbeddingRecord | null> {
  if (typeof window === 'undefined') return null;
  try {
    const r = await dbTx<EmbeddingRecord | undefined>('readonly', (s) =>
      s.get(traceId) as IDBRequest<EmbeddingRecord | undefined>);
    return r ?? null;
  } catch { return null; }
}

export async function getAllCachedEmbeddings(): Promise<EmbeddingRecord[]> {
  if (typeof window === 'undefined') return [];
  try {
    return await dbTx<EmbeddingRecord[]>('readonly', (s) => s.getAll() as IDBRequest<EmbeddingRecord[]>);
  } catch { return []; }
}

async function putCachedEmbedding(rec: EmbeddingRecord): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await dbTx<IDBValidKey>('readwrite', (s) => s.put(rec));
  } catch {}
}

export async function deleteCachedEmbedding(traceId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await dbTx<undefined>('readwrite', (s) => s.delete(traceId) as IDBRequest<undefined>);
  } catch {}
}

export async function clearAllEmbeddings(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await dbTx<undefined>('readwrite', (s) => s.clear() as IDBRequest<undefined>);
  } catch {}
}

/* ─────────── Public embedding API ─────────── */

/** Embed any text into a 384-dim Float32Array. Lazy-loads the model on first call. */
export async function embedText(text: string): Promise<Float32Array> {
  const pipe = await loadPipeline();
  const out = await pipe(text);
  return new Float32Array(out.data as any);
}

/** Build the searchable text representation of a trace. */
export function traceSearchText(t: Trace): string {
  const parts: string[] = [t.title];
  if (t.crystallizedSummary) parts.push(t.crystallizedSummary);
  if (t.concept?.name) parts.push(t.concept.name);
  // Include first user message + last assistant message for content signal
  const messages = t.events.filter((e): e is Extract<typeof e, { kind: 'message' }> => e.kind === 'message');
  if (messages.length > 0) {
    parts.push(messages[0].content.slice(0, 400));
    if (messages.length > 1) {
      parts.push(messages[messages.length - 1].content.slice(0, 400));
    }
  }
  // Notes
  const notes = t.events.filter((e): e is Extract<typeof e, { kind: 'note' }> => e.kind === 'note');
  for (const n of notes.slice(0, 3)) parts.push(n.content.slice(0, 400));
  return parts.join('\n').slice(0, 2000);
}

/** Get or compute the embedding for a single trace. Cached by updatedAt. */
export async function ensureTraceEmbedding(t: Trace): Promise<Float32Array> {
  const cached = await getCachedEmbedding(t.id);
  if (cached && cached.at >= t.updatedAt) {
    return cached.vector;
  }
  const text = traceSearchText(t);
  const vec = await embedText(text);
  await putCachedEmbedding({
    traceId: t.id,
    vector: vec,
    at: Date.now(),
    textLength: text.length,
  });
  return vec;
}

/** Cosine similarity between two unit vectors. (transformers.js normalizes by default) */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

/* ─────────── Background indexer ─────────── */

let _indexing = false;
let _indexProgress: { done: number; total: number } = { done: 0, total: 0 };
const INDEX_PROGRESS_EVENT = 'loom:embedding:progress';

export function getIndexProgress() {
  return { ..._indexProgress, indexing: _indexing };
}

/** Walk all traces and ensure each has a fresh embedding. Idempotent. */
export async function buildEmbeddingIndex(traces: Trace[]): Promise<{ embedded: number }> {
  if (_indexing) return { embedded: 0 };
  _indexing = true;
  _indexProgress = { done: 0, total: traces.length };
  let embedded = 0;
  try {
    for (const t of traces) {
      const cached = await getCachedEmbedding(t.id);
      if (!cached || cached.at < t.updatedAt) {
        try {
          await ensureTraceEmbedding(t);
          embedded++;
        } catch {}
      }
      _indexProgress.done++;
      window.dispatchEvent(new CustomEvent(INDEX_PROGRESS_EVENT, {
        detail: { done: _indexProgress.done, total: _indexProgress.total },
      }));
    }
  } finally {
    _indexing = false;
  }
  return { embedded };
}

/** Subscribe to indexer progress events. */
export function onIndexProgress(cb: (p: { done: number; total: number }) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => cb((e as CustomEvent).detail);
  window.addEventListener(INDEX_PROGRESS_EVENT, handler);
  return () => window.removeEventListener(INDEX_PROGRESS_EVENT, handler);
}

export const VECTOR_DIMENSION = VECTOR_DIM;
