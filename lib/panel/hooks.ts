'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Panel } from './types';
import { panelStore } from './store';

const CHANGE_EVENT = 'loom:panel:changed';

export function emitPanelChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

function useChangeSubscription(refresh: () => void) {
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [refresh]);
}

export function useAllPanels(): { panels: Panel[]; loading: boolean } {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const result = await panelStore.getAll();
    setPanels(result.sort((a, b) => b.updatedAt - a.updatedAt));
    setLoading(false);
  }, []);
  useChangeSubscription(refresh);
  return { panels, loading };
}
