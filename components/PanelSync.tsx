'use client';

import { useEffect } from 'react';
import { useAllTraces } from '../lib/trace';
import { derivePanelFromTraces, emitPanelChange, panelStore } from '../lib/panel';

/**
 * Mirrors trace-level crystallize state into first-class panel objects.
 *
 * Minimal Phase C bridge:
 * - if a root reading trace set is crystallized, upsert a settled panel
 * - if it is no longer crystallized, remove the panel for that doc
 */
export function PanelSync() {
  const { traces, loading } = useAllTraces();

  useEffect(() => {
    if (loading) return;
    let cancelled = false;

    void (async () => {
      const byDoc = new Map<string, typeof traces>();
      for (const trace of traces) {
        if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
        const existing = byDoc.get(trace.source.docId) ?? [];
        existing.push(trace);
        byDoc.set(trace.source.docId, existing);
      }

      const desired = new Map<string, ReturnType<typeof derivePanelFromTraces>>();
      for (const [docId, traceSet] of byDoc) {
        desired.set(docId, derivePanelFromTraces({ docId, traces: traceSet }));
      }

      const existingPanels = await panelStore.getAll();
      const existingByDoc = new Map(existingPanels.map((panel) => [panel.docId, panel] as const));

      for (const [docId, maybePanel] of desired) {
        if (cancelled) return;
        if (maybePanel) {
          await panelStore.put(maybePanel);
        } else if (existingByDoc.has(docId)) {
          await panelStore.delete(existingByDoc.get(docId)!.id);
        }
      }

      for (const existing of existingPanels) {
        if (cancelled) return;
        if (!desired.has(existing.docId)) {
          await panelStore.delete(existing.id);
        }
      }

      emitPanelChange();
    })();

    return () => {
      cancelled = true;
    };
  }, [traces, loading]);

  return null;
}
