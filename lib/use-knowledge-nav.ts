'use client';

import { useEffect, useState } from 'react';
import type { KnowledgeCategory, SourceLibraryGroup } from './knowledge-types';
import {
  fetchKnowledgeNav as fetchKnowledgeNavBoth,
  type KnowledgeNavPayload,
} from './knowledge-nav-client';

export type SourceLibraryGroupView = SourceLibraryGroup;
export type { KnowledgeNavPayload } from './knowledge-nav-client';

const KNOWLEDGE_NAV_REFRESH_EVENT = 'knowledge-nav:refresh';

let cache: KnowledgeNavPayload | null = null;
let inflight: Promise<KnowledgeNavPayload> | null = null;
let generation = 0;

function normalizeKnowledgeNav(payload?: Partial<KnowledgeNavPayload> | null): KnowledgeNavPayload {
  return {
    knowledgeCategories: payload?.knowledgeCategories ?? [],
    knowledgeTotal: payload?.knowledgeTotal ?? 0,
    sourceLibraryGroups: payload?.sourceLibraryGroups ?? [],
  };
}

async function fetchKnowledgeNav(): Promise<KnowledgeNavPayload> {
  // Native mode: reads content-root manifests directly. Dev mode: hits the
  // Next.js route. Shared shape either way, normalized below.
  return normalizeKnowledgeNav(await fetchKnowledgeNavBoth());
}

async function loadKnowledgeNav(force = false): Promise<KnowledgeNavPayload> {
  if (!force && cache) return cache;
  if (!force && inflight) return inflight;

  const requestGeneration = generation;
  const request = fetchKnowledgeNav().then((next) => {
    if (requestGeneration === generation) {
      cache = next;
    }
    return next;
  });
  inflight = request.finally(() => {
    if (requestGeneration === generation) {
      inflight = null;
    }
  });
  return inflight;
}

export function invalidateKnowledgeNavCache() {
  generation += 1;
  cache = null;
  inflight = null;
}

export async function refreshKnowledgeNav() {
  generation += 1;
  const requestGeneration = generation;
  try {
    const next = await loadKnowledgeNav(true);
    if (requestGeneration === generation && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(KNOWLEDGE_NAV_REFRESH_EVENT));
    }
    return next;
  } catch {
    return cache ?? normalizeKnowledgeNav();
  }
}

export function useKnowledgeNav() {
  const [data, setData] = useState<KnowledgeNavPayload>(cache ?? normalizeKnowledgeNav());

  useEffect(() => {
    let cancelled = false;
    const requestGeneration = generation;
    const onRefresh = () => {
      if (!cancelled) {
        setData(cache ?? normalizeKnowledgeNav());
      }
    };
    loadKnowledgeNav().then((next) => {
      if (!cancelled && requestGeneration === generation) setData(next);
    }).catch(() => {});
    window.addEventListener(KNOWLEDGE_NAV_REFRESH_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(KNOWLEDGE_NAV_REFRESH_EVENT, onRefresh);
    };
  }, []);

  return data;
}
