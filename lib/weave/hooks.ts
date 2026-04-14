'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Weave } from './types';
import { weaveStore } from './store';

const CHANGE_EVENT = 'loom:weave:changed';

export function emitWeaveChange() {
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

export function useAllWeaves(): { weaves: Weave[]; loading: boolean } {
  const [weaves, setWeaves] = useState<Weave[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const result = await weaveStore.getAll();
    setWeaves(result.sort((a, b) => b.updatedAt - a.updatedAt));
    setLoading(false);
  }, []);
  useChangeSubscription(refresh);
  return { weaves, loading };
}
