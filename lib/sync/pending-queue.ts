'use client';

type PendingSyncPayload = {
  full: boolean;
  docIds: string[];
};

function readStorage(key: string): PendingSyncPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingSyncPayload;
    return {
      full: Boolean(parsed?.full),
      docIds: Array.from(new Set((parsed?.docIds ?? []).filter(Boolean))),
    };
  } catch {
    return null;
  }
}

function writeStorage(key: string, payload: PendingSyncPayload | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!payload || (!payload.full && payload.docIds.length === 0)) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {}
}

export function createPendingSyncQueue(key: string) {
  return {
    load(): string[] | null | undefined {
      const payload = readStorage(key);
      if (!payload) return undefined;
      return payload.full ? null : payload.docIds;
    },
    save(docIds: string[] | null | undefined) {
      if (docIds === undefined) return;
      writeStorage(key, docIds === null
        ? { full: true, docIds: [] }
        : { full: false, docIds: Array.from(new Set(docIds.filter(Boolean))) });
    },
    clear() {
      writeStorage(key, null);
    },
  };
}
