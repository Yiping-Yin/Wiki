'use client';

import type { Panel } from './types';
import { canonicalizePanels } from './selectors';

const DB_NAME = 'loom';
const DB_VERSION = 3;
const STORE = 'panels';

let _dbPromise: Promise<IDBDatabase> | null = null;

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  if (!isClient()) return Promise.reject(new Error('IndexedDB not available'));
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('traces')) {
        const traceStore = db.createObjectStore('traces', { keyPath: 'id' });
        traceStore.createIndex('parentId', 'parentId', { unique: false });
        traceStore.createIndex('docId', 'source.docId', { unique: false });
        traceStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        traceStore.createIndex('kind', 'kind', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('docId', 'docId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    if (result instanceof IDBRequest) {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    } else {
      result.then(resolve, reject);
    }
  }));
}

export const panelStore = {
  async get(id: string): Promise<Panel | null> {
    if (!isClient()) return null;
    try {
      const result = await tx<Panel | undefined>('readonly', (s) => s.get(id) as IDBRequest<Panel | undefined>);
      return result ?? null;
    } catch {
      return null;
    }
  },

  async getAll(): Promise<Panel[]> {
    if (!isClient()) return [];
    try {
      return await tx<Panel[]>('readonly', (s) => s.getAll() as IDBRequest<Panel[]>);
    } catch {
      return [];
    }
  },

  async getByDoc(docId: string): Promise<Panel[]> {
    if (!isClient()) return [];
    try {
      return await tx<Panel[]>('readonly', (s) => s.index('docId').getAll(docId) as IDBRequest<Panel[]>);
    } catch {
      return [];
    }
  },

  async getByDocs(docIds: string[]): Promise<Map<string, Panel[]>> {
    const uniqueDocIds = Array.from(new Set(docIds.filter(Boolean)));
    const result = new Map<string, Panel[]>();
    if (!isClient() || uniqueDocIds.length === 0) return result;
    try {
      return await openDB().then((db) => new Promise<Map<string, Panel[]>>((resolve, reject) => {
        const txRef = db.transaction(STORE, 'readonly');
        const store = txRef.objectStore(STORE);
        const index = store.index('docId');
        let pending = uniqueDocIds.length;
        for (const docId of uniqueDocIds) {
          const req = index.getAll(docId) as IDBRequest<Panel[]>;
          req.onsuccess = () => {
            result.set(docId, canonicalizePanels(req.result ?? []));
            pending -= 1;
            if (pending === 0) resolve(result);
          };
          req.onerror = () => reject(req.error);
        }
      }));
    } catch {
      return result;
    }
  },

  async getCanonicalByDoc(docId: string): Promise<Panel | null> {
    const panels = await this.getByDoc(docId);
    return canonicalizePanels(panels)[0] ?? null;
  },

  async put(panel: Panel): Promise<void> {
    if (!isClient()) return;
    await tx<IDBValidKey>('readwrite', (s) => s.put(panel));
  },

  async putMany(panels: Panel[]): Promise<void> {
    const items = panels.filter(Boolean);
    if (!isClient() || items.length === 0) return;
    await openDB().then((db) => new Promise<void>((resolve, reject) => {
      const txRef = db.transaction(STORE, 'readwrite');
      const store = txRef.objectStore(STORE);
      for (const panel of items) store.put(panel);
      txRef.oncomplete = () => resolve();
      txRef.onerror = () => reject(txRef.error);
      txRef.onabort = () => reject(txRef.error);
    }));
  },

  async delete(id: string): Promise<void> {
    if (!isClient()) return;
    await tx<void>('readwrite', (s) => {
      s.delete(id);
      return Promise.resolve();
    });
  },

  async deleteMany(ids: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!isClient() || uniqueIds.length === 0) return;
    await openDB().then((db) => new Promise<void>((resolve, reject) => {
      const txRef = db.transaction(STORE, 'readwrite');
      const store = txRef.objectStore(STORE);
      for (const id of uniqueIds) store.delete(id);
      txRef.oncomplete = () => resolve();
      txRef.onerror = () => reject(txRef.error);
      txRef.onabort = () => reject(txRef.error);
    }));
  },

  async deleteByDoc(docId: string): Promise<void> {
    if (!isClient()) return;
    const panels = await this.getByDoc(docId);
    for (const panel of panels) {
      await this.delete(panel.id);
    }
  },
};
