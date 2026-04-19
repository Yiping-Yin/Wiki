'use client';

import { useEffect, useState } from 'react';
import type { KnowledgeCategory, SourceLibraryGroup } from './knowledge-types';

export type SourceLibraryGroupView = SourceLibraryGroup;

const KNOWLEDGE_NAV_REFRESH_EVENT = 'knowledge-nav:refresh';

type KnowledgeNavPayload = {
  knowledgeCategories: KnowledgeCategory[];
  knowledgeTotal: number;
  sourceLibraryGroups: SourceLibraryGroupView[];
};

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
  const r = await fetch('/api/knowledge-nav', { cache: 'no-store' });
  if (!r.ok) {
    throw new Error('Failed to load knowledge nav');
  }
  const payload = await r.json() as Partial<KnowledgeNavPayload>;
  return normalizeKnowledgeNav(payload);
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
