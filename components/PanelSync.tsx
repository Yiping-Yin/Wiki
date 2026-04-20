'use client';

import { useEffect, useRef } from 'react';
import { canonicalizePanels, derivePanelFromTraces, emitPanelChange, panelPersistedEqual, panelStore } from '../lib/panel';
import { panelRecordSignature, panelTraceSignature } from '../lib/panel/sync-signatures';
import { createPendingSyncQueue } from '../lib/sync/pending-queue';
import { TRACE_CHANGE_EVENT, type TraceChangeDetail } from '../lib/trace/events';
import { traceStore } from '../lib/trace/store';
import type { Trace } from '../lib/trace/types';
import { weaveStore } from '../lib/weave';
import { emitWeaveChange } from '../lib/weave';

function rootReadingTraces(traces: Trace[]) {
  return traces.filter((trace) => trace.kind === 'reading' && !trace.parentId && trace.source?.docId);
}

export function PanelSync() {
  const pendingDocIdsRef = useRef<Set<string> | null | undefined>(undefined);
  const runningRef = useRef(false);
  const lastDocSignaturesRef = useRef<Map<string, string>>(new Map());
  const queueStorageRef = useRef(createPendingSyncQueue('loom:panel-sync:pending'));

  useEffect(() => {
    let cancelled = false;

    const syncDocIds = async (docIds: string[] | null) => {
      const existingPanels = canonicalizePanels(await panelStore.getAll());
      const existingByDoc = new Map(existingPanels.map((panel) => [panel.docId, panel] as const));
      const targetDocIds = docIds ?? Array.from(new Set([
        ...existingByDoc.keys(),
        ...rootReadingTraces(await traceStore.getAll()).map((trace) => trace.source!.docId),
      ]));
      const tracesByDoc = await traceStore.getByDocs(targetDocIds);

      const changedDocIds: string[] = [];
      const panelsToPut = [];
      const panelIdsToDelete: string[] = [];
      const deletedDocIds: string[] = [];

      for (const docId of targetDocIds) {
        if (cancelled) return;
        const traceSet = rootReadingTraces(tracesByDoc.get(docId) ?? []);
        const existing = existingByDoc.get(docId) ?? null;
        const nextSignature = `${panelTraceSignature(traceSet)}||${panelRecordSignature(existing)}`;
        if (lastDocSignaturesRef.current.get(docId) === nextSignature) continue;

        const maybePanel = traceSet.length > 0
          ? derivePanelFromTraces({ docId, traces: traceSet, existing })
          : null;

        if (!maybePanel) {
          if (existing) {
            panelIdsToDelete.push(existing.id);
            deletedDocIds.push(docId);
            changedDocIds.push(docId);
          }
          lastDocSignaturesRef.current.set(docId, `${panelTraceSignature(traceSet)}||${panelRecordSignature(null)}`);
          continue;
        }

        if (!panelPersistedEqual(existing, maybePanel)) {
          panelsToPut.push(maybePanel);
          changedDocIds.push(docId);
        }
        lastDocSignaturesRef.current.set(docId, `${panelTraceSignature(traceSet)}||${panelRecordSignature(maybePanel)}`);
      }

      if (panelIdsToDelete.length > 0) {
        await panelStore.deleteMany(panelIdsToDelete);
      }
      if (deletedDocIds.length > 0) {
        // Cascade: delete weaves that referenced the now-gone panels.
        // weave.fromPanelId / toPanelId are actually docIds (not pl_* ids).
        try {
          const allWeaves = await weaveStore.getAll();
          const orphanWeaveIds = allWeaves
            .filter((weave) => deletedDocIds.includes(weave.fromPanelId) || deletedDocIds.includes(weave.toPanelId))
            .map((weave) => weave.id);
          if (orphanWeaveIds.length > 0) {
            await weaveStore.deleteMany(orphanWeaveIds);
            emitWeaveChange({
              docIds: deletedDocIds,
              weaveIds: orphanWeaveIds,
              reason: 'panel-delete-cascade',
            });
          }
        } catch {
          // Best-effort cascade. If weave store unavailable we leave orphans.
        }
      }
      if (panelsToPut.length > 0) {
        await panelStore.putMany(panelsToPut);
      }
      if (changedDocIds.length > 0) {
        emitPanelChange({ docIds: changedDocIds, reason: 'panel-sync' });
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
          await syncDocIds(pending === null ? null : Array.from(pending));
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

    window.addEventListener(TRACE_CHANGE_EVENT, onTraceChange);
    return () => {
      cancelled = true;
      window.removeEventListener(TRACE_CHANGE_EVENT, onTraceChange);
    };
  }, []);

  return null;
}
