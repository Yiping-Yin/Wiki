'use client';

import { useEffect, useState } from 'react';
import type { AiCliKind } from './ai-cli';
import { AI_CLI_CHANGE_EVENT, AI_CLI_STORAGE_KEY, readAiCliPreference } from './ai-cli';
import { deriveAiAvailability, type AiAvailability, type CliHealth } from './ai-provider-health';

export function useAiHealth(enabled = true) {
  const [preferredCli, setPreferredCli] = useState<AiCliKind>(() => readAiCliPreference());
  const [providers, setProviders] = useState<CliHealth[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPreferredCli(readAiCliPreference());
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== AI_CLI_STORAGE_KEY) return;
      setPreferredCli(readAiCliPreference());
    };
    const onCliChange = () => {
      setPreferredCli(readAiCliPreference());
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(AI_CLI_CHANGE_EVENT, onCliChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(AI_CLI_CHANGE_EVENT, onCliChange);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const ac = new AbortController();

    setLoading(true);
    fetch(`/api/ai-health?preferred=${preferredCli}`, { signal: ac.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`health ${response.status}`);
        return response.json();
      })
      .then((payload: { providers?: CliHealth[] }) => {
        if (cancelled) return;
        setProviders(Array.isArray(payload.providers) ? payload.providers : []);
      })
      .catch(() => {
        if (cancelled) return;
        setProviders([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [enabled, preferredCli]);

  const availability: AiAvailability = deriveAiAvailability(preferredCli, providers);

  return {
    preferredCli,
    providers,
    availability,
    loading,
  };
}
