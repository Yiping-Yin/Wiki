'use client';

import type { Weave } from './types';

const DB_NAME = 'loom-weaves';
const DB_VERSION = 1;
const STORE = 'weaves';

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
        store.createIndex('fromPanelId', 'fromPanelId', { unique: false });
        store.createIndex('toPanelId', 'toPanelId', { unique: false });
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

export const weaveStore = {
  async get(id: string): Promise<Weave | null> {
    if (!isClient()) return null;
    try {
      const result = await tx<Weave | undefined>('readonly', (s) => s.get(id) as IDBRequest<Weave | undefined>);
      return result ?? null;
    } catch {
      return null;
    }
  },

  async getAll(): Promise<Weave[]> {
    if (!isClient()) return [];
    try {
      return await tx<Weave[]>('readonly', (s) => s.getAll() as IDBRequest<Weave[]>);
    } catch {
      return [];
    }
  },

  async put(weave: Weave): Promise<void> {
    if (!isClient()) return;
    await tx<IDBValidKey>('readwrite', (s) => s.put(weave));
  },

  async updateStatus(id: string, status: Weave['status']): Promise<Weave | null> {
    if (!isClient()) return null;
    const existing = await this.get(id);
    if (!existing) return null;
    const next = {
      ...existing,
      status,
      updatedAt: Date.now(),
    };
    await this.put(next);
    return next;
  },

  async delete(id: string): Promise<void> {
    if (!isClient()) return;
    await tx<void>('readwrite', (s) => {
      s.delete(id);
      return Promise.resolve();
    });
  },
};
