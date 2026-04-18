'use client';

import { useCallback, useEffect, useState } from 'react';
import { PANEL_CHANGE_EVENT, type PanelChangeDetail } from './events';
import type { Panel } from './types';
import { canonicalizePanels } from './selectors';
import { panelStore } from './store';

function useChangeSubscription(refresh: () => void) {
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(PANEL_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(PANEL_CHANGE_EVENT, onChange);
  }, [refresh]);
}

export function useAllPanels(): { panels: Panel[]; loading: boolean } {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const result = await panelStore.getAll();
    setPanels(canonicalizePanels(result));
    setLoading(false);
  }, []);
  useChangeSubscription(refresh);
  return { panels, loading };
}

export function usePanel(docId: string | null): { panel: Panel | null; loading: boolean } {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!docId) {
      setPanel(null);
      setLoading(false);
      return;
    }
    const result = await panelStore.getCanonicalByDoc(docId);
    setPanel(result);
    setLoading(false);
  }, [docId]);
  useEffect(() => {
    refresh();
    const onChange = (event: Event) => {
      const detail = ((event as CustomEvent<PanelChangeDetail>).detail ?? {}) as PanelChangeDetail;
      if (detail.docIds && docId && !detail.docIds.includes(docId)) return;
      refresh();
    };
    window.addEventListener(PANEL_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(PANEL_CHANGE_EVENT, onChange);
  }, [docId, refresh]);
  return { panel, loading };
}
