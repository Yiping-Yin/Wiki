'use client';
import { useCallback, useMemo } from 'react';
import { emitTraceChange } from './trace/events';
import { useAllTraces } from './trace';
import { ensureReadingTrace } from './trace/source-bound';
import { traceStore } from './trace/store';

export type PinnedDoc = { id: string; title: string; href: string; pinnedAt: number };

export function usePins(): {
  pins: PinnedDoc[];
  isPinned: (id: string) => boolean;
  toggle: (entry: Omit<PinnedDoc, 'pinnedAt'>) => void;
  unpin: (id: string) => void;
} {
  const { traces } = useAllTraces();

  const pins = useMemo(() => {
    return traces
      .filter((t) => t.kind === 'reading' && !t.parentId && !!t.source?.docId && !!t.pinnedAt)
      .map((t) => ({
        id: t.source!.docId,
        title: t.source!.sourceTitle ?? t.title,
        href: t.source!.href,
        pinnedAt: t.pinnedAt!,
      }))
      .sort((a, b) => b.pinnedAt - a.pinnedAt);
  }, [traces]);

  const isPinned = useCallback((id: string) => pins.some((p) => p.id === id), [pins]);

  const toggle = useCallback(async (entry: Omit<PinnedDoc, 'pinnedAt'>) => {
    const trace = await ensureReadingTrace({
      docId: entry.id,
      href: entry.href,
      sourceTitle: entry.title,
    });
    await traceStore.update(trace.id, { pinnedAt: trace.pinnedAt ? undefined : Date.now() });
    emitTraceChange({ docIds: [entry.id], traceIds: [trace.id], reason: 'pin-toggle' });
  }, []);

  const unpin = useCallback(async (id: string) => {
    const traces = await traceStore.getByDoc(id);
    const trace = traces.find((t) => t.kind === 'reading' && !t.parentId);
    if (!trace) return;
    await traceStore.update(trace.id, { pinnedAt: undefined });
    emitTraceChange({ docIds: [id], traceIds: [trace.id], reason: 'pin-remove' });
  }, []);

  return { pins, isPinned, toggle, unpin };
}
