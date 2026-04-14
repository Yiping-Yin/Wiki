'use client';

import type { Panel } from './types';

const DB_NAME = 'loom';
const DB_VERSION = 2;
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

  async put(panel: Panel): Promise<void> {
    if (!isClient()) return;
    await tx<IDBValidKey>('readwrite', (s) => s.put(panel));
  },

  async delete(id: string): Promise<void> {
    if (!isClient()) return;
    await tx<void>('readwrite', (s) => {
      s.delete(id);
      return Promise.resolve();
    });
  },

  async deleteByDoc(docId: string): Promise<void> {
    if (!isClient()) return;
    const panels = await this.getByDoc(docId);
    for (const panel of panels) {
      await this.delete(panel.id);
    }
  },
};
