'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Weave } from './types';
import { emitWeaveChange, WEAVE_CHANGE_EVENT } from './events';
import { weaveStore } from './store';

function useChangeSubscription(refresh: () => void) {
  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(WEAVE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(WEAVE_CHANGE_EVENT, onChange);
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

export async function setWeaveStatus(id: string, status: Weave['status']) {
  const updated = await weaveStore.updateStatus(id, status);
  if (updated) {
    emitWeaveChange({
      docIds: [updated.fromPanelId, updated.toPanelId],
      weaveIds: [updated.id],
      reason: 'set-weave-status',
    });
  }
  return updated;
}

export async function updateWeaveContract(
  id: string,
  contract: {
    claim: string;
    whyItHolds: string;
    openTensions: string[];
  },
) {
  const updated = await weaveStore.updateContract(id, contract);
  if (updated) {
    emitWeaveChange({
      docIds: [updated.fromPanelId, updated.toPanelId],
      weaveIds: [updated.id],
      reason: 'update-weave-contract',
    });
  }
  return updated;
}

export async function setWeaveKind(id: string, kind: Weave['kind']) {
  const updated = await weaveStore.updateKind(id, kind);
  if (updated) {
    emitWeaveChange({
      docIds: [updated.fromPanelId, updated.toPanelId],
      weaveIds: [updated.id],
      reason: 'set-weave-kind',
    });
  }
  return updated;
}
