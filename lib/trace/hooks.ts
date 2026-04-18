'use client';
/**
 * React hooks over the Trace store.
 *
 * All hooks return immediately on SSR with empty/null state, then hydrate from
 * IndexedDB after mount. They subscribe to a global "trace changed" event so
 * any mutation in any component re-renders all subscribers.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Trace, TraceCreateInput, TraceEvent } from './types';
import { emitTraceChange, TRACE_CHANGE_EVENT, type TraceChangeDetail } from './events';
import { traceStore } from './store';

function useChangeSubscription(refresh: () => void) {
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(TRACE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(TRACE_CHANGE_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* ─────────── Read hooks ─────────── */

export function useTrace(id: string | null): { trace: Trace | null; loading: boolean } {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!id) { setTrace(null); setLoading(false); return; }
    const t = await traceStore.get(id);
    setTrace(t);
    setLoading(false);
  }, [id]);
  useEffect(() => {
    refresh();
    const onChange = (event: Event) => {
      const detail = ((event as CustomEvent<TraceChangeDetail>).detail ?? {}) as TraceChangeDetail;
      if (detail.traceIds && id && !detail.traceIds.includes(id)) return;
      refresh();
    };
    window.addEventListener(TRACE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(TRACE_CHANGE_EVENT, onChange);
  }, [id, refresh]);
  return { trace, loading };
}

export function useTracesForDoc(docId: string | null): { traces: Trace[]; loading: boolean } {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!docId) { setTraces([]); setLoading(false); return; }
    const result = await traceStore.getByDoc(docId);
    setTraces(result.sort((a, b) => b.updatedAt - a.updatedAt));
    setLoading(false);
  }, [docId]);
  useEffect(() => {
    refresh();
    const onChange = (event: Event) => {
      const detail = ((event as CustomEvent<TraceChangeDetail>).detail ?? {}) as TraceChangeDetail;
      if (detail.docIds && docId && !detail.docIds.includes(docId)) return;
      refresh();
    };
    window.addEventListener(TRACE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(TRACE_CHANGE_EVENT, onChange);
  }, [docId, refresh]);
  return { traces, loading };
}

export function useTraceTree(rootId: string | null): { traces: Trace[]; loading: boolean } {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!rootId) { setTraces([]); setLoading(false); return; }
    const result = await traceStore.getTree(rootId);
    setTraces(result);
    setLoading(false);
  }, [rootId]);
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(TRACE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(TRACE_CHANGE_EVENT, onChange);
  }, [refresh]);
  return { traces, loading };
}

export function useAllTraces(): { traces: Trace[]; loading: boolean } {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const result = await traceStore.getAll();
    setTraces(result.sort((a, b) => b.updatedAt - a.updatedAt));
    setLoading(false);
  }, []);
  useChangeSubscription(refresh);
  return { traces, loading };
}

export function useTraceStats(): { total: number; byKind: Record<string, number>; totalEvents: number; loading: boolean } {
  const [stats, setStats] = useState({ total: 0, byKind: {} as Record<string, number>, totalEvents: 0, loading: true });
  const refresh = useCallback(async () => {
    const s = await traceStore.stats();
    setStats({ ...s, loading: false });
  }, []);
  useChangeSubscription(refresh);
  return stats;
}

export function useSearchTraces(query: string, limit = 20): { results: Trace[]; loading: boolean } {
  const [results, setResults] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    traceStore.search(query, limit).then((r) => {
      if (!cancelled) { setResults(r); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [query, limit]);
  return { results, loading };
}

/* ─────────── Mutation hooks ─────────── */

export function useCreateTrace() {
  return useCallback(async (input: TraceCreateInput): Promise<Trace> => {
    const t = await traceStore.create(input);
    emitTraceChange({
      docIds: input.source?.docId ? [input.source.docId] : undefined,
      traceIds: [t.id],
      reason: 'create-trace',
    });
    return t;
  }, []);
}

export function useAppendEvent() {
  return useCallback(async (traceId: string, event: TraceEvent): Promise<Trace | null> => {
    const t = await traceStore.appendEvent(traceId, event);
    emitTraceChange({
      docIds: t?.source?.docId ? [t.source.docId] : undefined,
      traceIds: t ? [t.id] : [traceId],
      reason: 'append-event',
    });
    return t;
  }, []);
}

export function useUpdateTrace() {
  return useCallback(async (traceId: string, partial: Partial<Trace>): Promise<Trace | null> => {
    const t = await traceStore.update(traceId, partial);
    emitTraceChange({
      docIds: t?.source?.docId ? [t.source.docId] : undefined,
      traceIds: t ? [t.id] : [traceId],
      reason: 'update-trace',
    });
    return t;
  }, []);
}

export function useDeleteTrace() {
  return useCallback(async (traceId: string): Promise<void> => {
    const tree = await traceStore.getTree(traceId);
    await traceStore.deleteTree(traceId);
    emitTraceChange({
      docIds: Array.from(new Set(tree.map((trace) => trace.source?.docId).filter(Boolean) as string[])),
      traceIds: tree.map((trace) => trace.id),
      reason: 'delete-trace',
    });
  }, []);
}

/**
 * Remove events from a trace's history matching a predicate.
 * Used by LiveArtifact to delete specific recompile versions.
 */
export function useRemoveEvents() {
  return useCallback(async (
    traceId: string,
    predicate: (e: TraceEvent, i: number) => boolean,
  ): Promise<Trace | null> => {
    const t = await traceStore.removeEvents(traceId, predicate);
    emitTraceChange({
      docIds: t?.source?.docId ? [t.source.docId] : undefined,
      traceIds: t ? [t.id] : [traceId],
      reason: 'remove-events',
    });
    return t;
  }, []);
}
