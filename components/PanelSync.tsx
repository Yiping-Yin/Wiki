'use client';

import { useEffect } from 'react';
import { useAllTraces } from '../lib/trace';
import { derivePanelFromTraces, emitPanelChange, panelStore } from '../lib/panel';

/**
 * Mirrors trace-level crystallize state into first-class panel objects.
 *
 * Minimal Phase C bridge:
 * - if a root reading trace set has anchors, upsert a panel
 * - if it has no anchors, remove the panel for that doc
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

      const existingPanels = await panelStore.getAll();
      const existingByDoc = new Map<string, typeof existingPanels>();
      for (const panel of existingPanels) {
        const current = existingByDoc.get(panel.docId) ?? [];
        current.push(panel);
        existingByDoc.set(panel.docId, current);
      }
      const desired = new Map<string, ReturnType<typeof derivePanelFromTraces>>();
      for (const [docId, traceSet] of byDoc) {
        const existing = (existingByDoc.get(docId) ?? [])[0] ?? null;
        desired.set(docId, derivePanelFromTraces({ docId, traces: traceSet, existing }));
      }

      for (const [docId, maybePanel] of desired) {
        if (cancelled) return;
        const existingForDoc = existingByDoc.get(docId) ?? [];
        if (maybePanel) {
          for (const existing of existingForDoc) {
            if (existing.id !== maybePanel.id) {
              await panelStore.delete(existing.id);
            }
          }
          await panelStore.put(maybePanel);
        } else if (existingForDoc.length > 0) {
          for (const existing of existingForDoc) {
            await panelStore.delete(existing.id);
          }
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
