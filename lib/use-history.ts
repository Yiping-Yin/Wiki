'use client';
import { useCallback, useEffect, useState } from 'react';
import { traceStore } from './trace/store';
import type { Trace } from './trace/types';
import { ensureReadingTrace, latestVisitAt } from './trace/source-bound';

const CHANGE_EVENT = 'loom:trace:changed';

export type HistoryEntry = { id: string; title: string; href: string; viewedAt: number };

function emitChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

function toEntries(traces: Trace[]): HistoryEntry[] {
  return traces
    .filter((t) => t.kind === 'reading' && !t.parentId && t.source?.docId)
    .map((t) => ({
      id: t.source!.docId,
      title: t.source!.sourceTitle ?? t.title,
      href: t.source!.href,
      viewedAt: latestVisitAt(t),
    }))
    .sort((a, b) => b.viewedAt - a.viewedAt);
}

export function useHistory(): [HistoryEntry[], (e: Omit<HistoryEntry, 'viewedAt'>) => void, () => void] {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const traces = await traceStore.getAll();
      if (!cancelled) setEntries(toEntries(traces));
    };
    refresh();
    const onChange = () => refresh();
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, []);

  const track = useCallback(async (e: Omit<HistoryEntry, 'viewedAt'>) => {
    const trace = await ensureReadingTrace({
      docId: e.id,
      href: e.href,
      sourceTitle: e.title,
    });
    await traceStore.appendEvent(trace.id, { kind: 'visit', at: Date.now() });
    emitChange();
  }, []);

  const clear = useCallback(async () => {
    const traces = await traceStore.getAll();
    for (const t of traces) {
      if (t.kind !== 'reading' || t.parentId || !t.source?.docId) continue;
      await traceStore.removeEvents(t.id, (ev) => ev.kind === 'visit');
    }
    emitChange();
    setEntries([]);
  }, []);

  return [entries, track, clear];
}
