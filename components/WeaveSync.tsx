'use client';

import { useEffect, useRef } from 'react';
import { canonicalizePanels, isRenderablePanel, panelStore } from '../lib/panel';
import { PANEL_CHANGE_EVENT, type PanelChangeDetail } from '../lib/panel/events';
import { createPendingSyncQueue } from '../lib/sync/pending-queue';
import { TRACE_CHANGE_EVENT, type TraceChangeDetail } from '../lib/trace/events';
import { traceStore } from '../lib/trace/store';
import type { Trace } from '../lib/trace/types';
import { deriveSuggestedWeaves, deriveSuggestedWeavesForSourcePanels, emitWeaveChange, weavePersistedEqual, weaveStore } from '../lib/weave';

function rootReadingTraces(traces: Trace[]) {
  return traces.filter((trace) => trace.kind === 'reading' && !trace.parentId && trace.source?.docId);
}

export function WeaveSync() {
  const pendingDocIdsRef = useRef<Set<string> | null | undefined>(undefined);
  const runningRef = useRef(false);
  const queueStorageRef = useRef(createPendingSyncQueue('loom:weave-sync:pending'));

  useEffect(() => {
    let cancelled = false;

    const syncWeaves = async (docIds: string[] | null) => {
      const allPanels = canonicalizePanels(await panelStore.getAll()).filter(isRenderablePanel);
      const activePanelIds = new Set(allPanels.map((panel) => panel.docId));
      const existingWeaves = await weaveStore.getAll();
      const changedDocIds = new Set<string>();
      const changedWeaveIds = new Set<string>();
      const weavesToPut = [];
      const weaveIdsToDelete: string[] = [];

      if (docIds === null) {
        const tracesByDocId = new Map<string, Trace[]>();
        const tracesMap = await traceStore.getByDocs(allPanels.map((panel) => panel.docId));
        for (const panel of allPanels) {
          tracesByDocId.set(panel.docId, rootReadingTraces(tracesMap.get(panel.docId) ?? []));
        }
        const desired = deriveSuggestedWeaves({
          panels: allPanels,
          tracesByDocId,
          existingWeaves,
        });
        const desiredById = new Map(desired.map((weave: (typeof desired)[number]) => [weave.id, weave] as const));
        const existingById = new Map(existingWeaves.map((weave) => [weave.id, weave] as const));

        for (const weave of desired) {
          if (cancelled) return;
          const existing = existingById.get(weave.id) ?? null;
          if (!weavePersistedEqual(existing, weave)) {
            weavesToPut.push(weave);
            changedWeaveIds.add(weave.id);
            changedDocIds.add(weave.fromPanelId);
            changedDocIds.add(weave.toPanelId);
          }
        }

        for (const existing of existingWeaves) {
          if (cancelled) return;
          const endpointMissing = !activePanelIds.has(existing.fromPanelId) || !activePanelIds.has(existing.toPanelId);
          if (endpointMissing || (existing.status === 'suggested' && !desiredById.has(existing.id))) {
            weaveIdsToDelete.push(existing.id);
            changedWeaveIds.add(existing.id);
            changedDocIds.add(existing.fromPanelId);
            changedDocIds.add(existing.toPanelId);
          }
        }
      } else {
        const affectedDocIds = new Set(docIds);
        const sourcePanels = allPanels.filter((panel) => affectedDocIds.has(panel.docId));
        const tracesByDocId = new Map<string, Trace[]>();
        const tracesMap = await traceStore.getByDocs(sourcePanels.map((panel) => panel.docId));
        for (const panel of sourcePanels) {
          tracesByDocId.set(panel.docId, rootReadingTraces(tracesMap.get(panel.docId) ?? []));
        }
        const desired = deriveSuggestedWeavesForSourcePanels({
          sourcePanels,
          panels: allPanels,
          tracesByDocId,
          existingWeaves,
        });
        const desiredById = new Map(desired.map((weave: (typeof desired)[number]) => [weave.id, weave] as const));
        const existingById = new Map(existingWeaves.map((weave) => [weave.id, weave] as const));

        for (const weave of desired) {
          if (cancelled) return;
          const existing = existingById.get(weave.id) ?? null;
          if (!weavePersistedEqual(existing, weave)) {
            weavesToPut.push(weave);
            changedWeaveIds.add(weave.id);
            changedDocIds.add(weave.fromPanelId);
            changedDocIds.add(weave.toPanelId);
          }
        }

        for (const existing of existingWeaves) {
          if (cancelled) return;
          const endpointMissing = !activePanelIds.has(existing.fromPanelId) || !activePanelIds.has(existing.toPanelId);
          const fromAffected = affectedDocIds.has(existing.fromPanelId);
          if (endpointMissing || (fromAffected && existing.status === 'suggested' && !desiredById.has(existing.id))) {
            weaveIdsToDelete.push(existing.id);
            changedWeaveIds.add(existing.id);
            changedDocIds.add(existing.fromPanelId);
            changedDocIds.add(existing.toPanelId);
          }
        }
      }

      if (weaveIdsToDelete.length > 0) {
        await weaveStore.deleteMany(weaveIdsToDelete);
      }
      if (weavesToPut.length > 0) {
        await weaveStore.putMany(weavesToPut);
      }
      if (changedWeaveIds.size > 0) {
        emitWeaveChange({
          docIds: Array.from(changedDocIds),
          weaveIds: Array.from(changedWeaveIds),
          reason: 'weave-sync',
        });
      }
      queueStorageRef.current.clear();
    };

    const runQueue = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        while (!cancelled && pendingDocIdsRef.current !== undefined) {
          const pending = pendingDocIdsRef.current;
          pendingDocIdsRef.current = undefined;
          await syncWeaves(pending === null ? null : Array.from(pending));
        }
      } finally {
        runningRef.current = false;
      }
    };

    const queueSync = (docIds: string[] | null) => {
      if (docIds === null) {
        pendingDocIdsRef.current = null;
      } else if (pendingDocIdsRef.current !== null) {
        const next = pendingDocIdsRef.current ?? new Set<string>();
        for (const docId of docIds) next.add(docId);
        pendingDocIdsRef.current = next;
      }
      queueStorageRef.current.save(pendingDocIdsRef.current === undefined ? undefined : pendingDocIdsRef.current === null ? null : Array.from(pendingDocIdsRef.current));
      void runQueue();
    };

    const recovered = queueStorageRef.current.load();
    queueSync(recovered ?? null);

    const onTraceChange = (event: Event) => {
      const detail = ((event as CustomEvent<TraceChangeDetail>).detail ?? {}) as TraceChangeDetail;
      const docIds = detail.docIds?.filter(Boolean) ?? [];
      queueSync(docIds.length > 0 ? docIds : null);
    };
    const onPanelChange = (event: Event) => {
      const detail = ((event as CustomEvent<PanelChangeDetail>).detail ?? {}) as PanelChangeDetail;
      const docIds = detail.docIds?.filter(Boolean) ?? [];
      queueSync(docIds.length > 0 ? docIds : null);
    };

    window.addEventListener(TRACE_CHANGE_EVENT, onTraceChange);
    window.addEventListener(PANEL_CHANGE_EVENT, onPanelChange);
    return () => {
      cancelled = true;
      window.removeEventListener(TRACE_CHANGE_EVENT, onTraceChange);
      window.removeEventListener(PANEL_CHANGE_EVENT, onPanelChange);
    };
  }, []);

  return null;
}
