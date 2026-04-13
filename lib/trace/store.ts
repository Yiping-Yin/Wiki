/**
 * Trace store · IndexedDB-backed persistence for Loom Traces.
 *
 * Uses one object store ("traces"), keyed by Trace.id, with secondary indexes
 * on parentId and source.docId.
 *
 * All public methods are async. On the server (no window), they no-op or
 * return null/[]. Real work only happens client-side.
 *
 * Append-only discipline: appendEvent only adds to the events array. Direct
 * mutation of past events is never allowed. update() is for derived metadata
 * and tree pointers only.
 */

import type { Trace, TraceCreateInput, TraceEvent } from './types';
import { newTraceId } from './types';

const DB_NAME = 'loom';
const DB_VERSION = 1;
const STORE = 'traces';

/* ─────────── DB connection ─────────── */

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
        store.createIndex('parentId', 'parentId', { unique: false });
        store.createIndex('docId', 'source.docId', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('kind', 'kind', { unique: false });
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

/* ─────────── Helpers ─────────── */

function recompute(t: Trace): Trace {
  let createdAt = t.createdAt;
  let updatedAt = t.updatedAt;
  let visitCount = 0;
  let totalDurationMs = 0;
  let crystallizedSummary: string | undefined;
  let crystallizedAt: number | undefined;
  let firstEventAt: number | undefined;
  let lastEventAt: number | undefined;

  for (const e of t.events) {
    if (firstEventAt === undefined || e.at < firstEventAt) firstEventAt = e.at;
    if (lastEventAt === undefined || e.at > lastEventAt) lastEventAt = e.at;
    if (e.kind === 'visit') {
      visitCount++;
      totalDurationMs += e.durationMs ?? 0;
    } else if (e.kind === 'crystallize' && !(e as any).anchorId) {
      // Trace-level crystallize only. Anchor-scoped crystallize events
      // (with anchorId set) mark individual thought containers, not the
      // whole trace — they are resolved by thought-anchor-model.ts.
      crystallizedSummary = e.summary;
      crystallizedAt = e.at;
    }
  }
  if (firstEventAt !== undefined) createdAt = Math.min(createdAt || firstEventAt, firstEventAt);
  if (lastEventAt !== undefined) updatedAt = Math.max(updatedAt || lastEventAt, lastEventAt);

  // Heuristic mastery: based on visit count + crystallized + time decay
  let mastery = 0;
  if (visitCount > 0) mastery += Math.min(0.5, visitCount * 0.12);
  if (crystallizedAt) mastery += 0.3;
  if (t.problem?.specLockedAt) mastery += 0.1;
  // Time decay: lose 0.05 per 30 days idle
  const daysIdle = updatedAt ? (Date.now() - updatedAt) / (1000 * 60 * 60 * 24) : 0;
  mastery -= Math.min(0.4, (daysIdle / 30) * 0.05);
  mastery = Math.max(0, Math.min(1, mastery));

  return {
    ...t,
    createdAt,
    updatedAt,
    visitCount,
    totalDurationMs,
    crystallizedSummary,
    crystallizedAt,
    mastery,
  };
}

/* ─────────── Public API ─────────── */

export const traceStore = {
  /** Get one trace by id. Returns null on SSR or if not found. */
  async get(id: string): Promise<Trace | null> {
    if (!isClient()) return null;
    try {
      const result = await tx<Trace | undefined>('readonly', (s) => s.get(id) as IDBRequest<Trace | undefined>);
      return result ?? null;
    } catch { return null; }
  },

  /** Get all traces (use sparingly — pagination not yet implemented). */
  async getAll(): Promise<Trace[]> {
    if (!isClient()) return [];
    try {
      return await tx<Trace[]>('readonly', (s) => s.getAll() as IDBRequest<Trace[]>);
    } catch { return []; }
  },

  /** Get all traces bound to a specific source doc. */
  async getByDoc(docId: string): Promise<Trace[]> {
    if (!isClient()) return [];
    try {
      return await tx<Trace[]>('readonly', (s) => {
        const idx = s.index('docId');
        return idx.getAll(docId) as IDBRequest<Trace[]>;
      });
    } catch { return []; }
  },

  /** Get direct children of a trace. */
  async getChildren(parentId: string): Promise<Trace[]> {
    if (!isClient()) return [];
    try {
      return await tx<Trace[]>('readonly', (s) => {
        const idx = s.index('parentId');
        return idx.getAll(parentId) as IDBRequest<Trace[]>;
      });
    } catch { return []; }
  },

  /** Get root + all descendants of a tree. */
  async getTree(rootId: string): Promise<Trace[]> {
    if (!isClient()) return [];
    const result: Trace[] = [];
    const visited = new Set<string>();
    const walk = async (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const t = await this.get(id);
      if (!t) return;
      result.push(t);
      for (const childId of t.childIds) await walk(childId);
    };
    await walk(rootId);
    return result;
  },

  /** Create a new trace. */
  async create(input: TraceCreateInput): Promise<Trace> {
    if (!isClient()) throw new Error('Cannot create trace on server');
    const now = Date.now();
    const trace: Trace = {
      id: newTraceId(),
      kind: input.kind,
      title: input.title,
      parentId: input.parentId ?? null,
      childIds: [],
      source: input.source,
      events: input.initialEvents ?? [],
      createdAt: now,
      updatedAt: now,
      visitCount: 0,
      totalDurationMs: 0,
      mastery: 0,
      problem: input.problem,
      concept: input.concept,
    };
    const recomputed = recompute(trace);
    await tx<IDBValidKey>('readwrite', (s) => s.put(recomputed));
    // If this trace has a parent, append its id to the parent's childIds
    if (recomputed.parentId) {
      const parent = await this.get(recomputed.parentId);
      if (parent && !parent.childIds.includes(recomputed.id)) {
        await this.update(parent.id, { childIds: [...parent.childIds, recomputed.id] });
      }
    }
    return recomputed;
  },

  /** Append an event to a trace's history. Append-only — never mutates past events. */
  async appendEvent(traceId: string, event: TraceEvent): Promise<Trace | null> {
    if (!isClient()) return null;
    const t = await this.get(traceId);
    if (!t) return null;
    const updated = recompute({ ...t, events: [...t.events, event] });
    await tx<IDBValidKey>('readwrite', (s) => s.put(updated));
    return updated;
  },

  /**
   * Remove events from a trace's history. Append-only is the *default*
   * (§7), but the user is the owner of their own history and may delete
   * specific events (e.g. an unwanted Live Note recompile version) just
   * like git allows amend/rebase. The deletion is destructive — the
   * removed events are gone from the event log permanently.
   */
  async removeEvents(traceId: string, predicate: (e: TraceEvent, i: number) => boolean): Promise<Trace | null> {
    if (!isClient()) return null;
    const t = await this.get(traceId);
    if (!t) return null;
    const events = t.events.filter((e, i) => !predicate(e, i));
    if (events.length === t.events.length) return t;
    const updated = recompute({ ...t, events });
    await tx<IDBValidKey>('readwrite', (s) => s.put(updated));
    return updated;
  },

  /** Update non-event fields (title, problem.spec, tree pointers, etc). */
  async update(traceId: string, partial: Partial<Trace>): Promise<Trace | null> {
    if (!isClient()) return null;
    const t = await this.get(traceId);
    if (!t) return null;
    // Never let `update` rewrite events array — that's appendEvent's job
    const { events: _ignored, ...safe } = partial as any;
    const updated = recompute({ ...t, ...safe });
    await tx<IDBValidKey>('readwrite', (s) => s.put(updated));
    return updated;
  },

  /** Delete a trace and all its descendants. */
  async deleteTree(traceId: string): Promise<void> {
    if (!isClient()) return;
    const tree = await this.getTree(traceId);
    const ids = tree.map((t) => t.id);
    await tx<void>('readwrite', (s) => {
      return new Promise<void>((resolve, reject) => {
        let pending = ids.length;
        if (pending === 0) { resolve(); return; }
        for (const id of ids) {
          const r = s.delete(id);
          r.onsuccess = () => { if (--pending === 0) resolve(); };
          r.onerror = () => reject(r.error);
        }
      }) as any;
    });
    // Also remove this trace from its parent's childIds
    const root = tree[0];
    if (root?.parentId) {
      const parent = await this.get(root.parentId);
      if (parent) {
        await this.update(parent.id, {
          childIds: parent.childIds.filter((id) => id !== root.id),
        });
      }
    }
  },

  /** Substring + token search across title, summary, and message content. */
  async search(query: string, limit = 20): Promise<Trace[]> {
    if (!isClient() || !query.trim()) return [];
    const all = await this.getAll();
    const q = query.toLowerCase();
    const scored: { t: Trace; score: number }[] = [];
    for (const t of all) {
      let score = 0;
      const title = t.title.toLowerCase();
      if (title.includes(q)) score += title.startsWith(q) ? 5 : 3;
      if (t.crystallizedSummary?.toLowerCase().includes(q)) score += 2;
      for (const e of t.events) {
        if (e.kind === 'message' && e.content.toLowerCase().includes(q)) score += 1;
        if (e.kind === 'note' && e.content.toLowerCase().includes(q)) score += 1;
      }
      if (score > 0) scored.push({ t, score });
    }
    return scored
      .sort((a, b) => b.score - a.score || b.t.updatedAt - a.t.updatedAt)
      .slice(0, limit)
      .map((x) => x.t);
  },

  /** Wipe everything. Use with care. */
  async clear(): Promise<void> {
    if (!isClient()) return;
    await tx<void>('readwrite', (s) => s.clear() as any);
  },

  /** Stats for the dev inspector / Library view. */
  async stats(): Promise<{ total: number; byKind: Record<string, number>; totalEvents: number }> {
    if (!isClient()) return { total: 0, byKind: {}, totalEvents: 0 };
    const all = await this.getAll();
    const byKind: Record<string, number> = {};
    let totalEvents = 0;
    for (const t of all) {
      byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
      totalEvents += t.events.length;
    }
    return { total: all.length, byKind, totalEvents };
  },
};
