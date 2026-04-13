'use client';
/**
 * lib/note/embeddings · IndexedDB store for note embedding vectors.
 *
 * Each note's content + quote is embedded into a 768-dim vector (nomic-embed-text).
 * Used by ActiveRetrieval to find semantically similar notes across documents.
 *
 * Storage: ~3MB for 1000 notes (768 dims × 4 bytes × 1000).
 */

const DB_NAME = 'loom-embeddings';
const DB_VERSION = 1;
const STORE_NAME = 'vectors';

type EmbeddingRecord = {
  noteId: string;
  docId: string;
  vector: Float32Array;
  text: string;
  at: number;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'noteId' });
        store.createIndex('byDoc', 'docId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putEmbedding(
  noteId: string,
  docId: string,
  vector: Float32Array,
  text: string,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      noteId,
      docId,
      vector,
      text,
      at: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getEmbedding(noteId: string): Promise<EmbeddingRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(noteId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllEmbeddings(): Promise<EmbeddingRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function getEmbeddingsExcludingDoc(docId: string): Promise<EmbeddingRecord[]> {
  const all = await getAllEmbeddings();
  return all.filter((e) => e.docId !== docId);
}

export async function embeddingCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
