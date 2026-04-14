'use client';

import { useEffect } from 'react';
import { useAllPanels } from '../lib/panel';
import { useAllTraces } from '../lib/trace';
import { deriveSuggestedWeaves, emitWeaveChange, useAllWeaves, weaveStore } from '../lib/weave';

export function WeaveSync() {
  const { traces, loading: tracesLoading } = useAllTraces();
  const { panels, loading: panelsLoading } = useAllPanels();
  const { weaves, loading: weavesLoading } = useAllWeaves();

  useEffect(() => {
    if (tracesLoading || panelsLoading || weavesLoading) return;
    let cancelled = false;

    void (async () => {
      const tracesByDocId = new Map<string, typeof traces>();
      for (const trace of traces) {
        if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
        const current = tracesByDocId.get(trace.source.docId) ?? [];
        current.push(trace);
        tracesByDocId.set(trace.source.docId, current);
      }

      const activePanels = panels.filter((panel) => panel.status !== 'provisional' && panel.status !== 'superseded');
      const desired = deriveSuggestedWeaves({
        panels: activePanels,
        tracesByDocId,
        existingWeaves: weaves,
      });
      const desiredIds = new Set(desired.map((weave) => weave.id));

      for (const weave of desired) {
        if (cancelled) return;
        await weaveStore.put(weave);
      }

      for (const existing of weaves) {
        if (cancelled) return;
        if (!desiredIds.has(existing.id) && existing.status === 'suggested') {
          await weaveStore.delete(existing.id);
        }
      }

      emitWeaveChange();
    })();

    return () => {
      cancelled = true;
    };
  }, [panels, panelsLoading, traces, tracesLoading, weaves, weavesLoading]);

  return null;
}
