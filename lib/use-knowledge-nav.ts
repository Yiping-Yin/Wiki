'use client';

import { useEffect, useState } from 'react';
import type { KnowledgeCategory } from './knowledge-types';

type KnowledgeNavPayload = {
  knowledgeCategories: KnowledgeCategory[];
  knowledgeTotal: number;
};

let cache: KnowledgeNavPayload | null = null;
let inflight: Promise<KnowledgeNavPayload> | null = null;

async function loadKnowledgeNav(): Promise<KnowledgeNavPayload> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const r = await fetch('/api/knowledge-nav');
      if (!r.ok) {
        cache = { knowledgeCategories: [], knowledgeTotal: 0 };
        return cache;
      }
      const payload = await r.json() as KnowledgeNavPayload;
      cache = payload;
      return payload;
    })();
  }
  return inflight;
}

export function useKnowledgeNav() {
  const [data, setData] = useState<KnowledgeNavPayload>(cache ?? { knowledgeCategories: [], knowledgeTotal: 0 });

  useEffect(() => {
    let cancelled = false;
    loadKnowledgeNav().then((next) => {
      if (!cancelled) setData(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return data;
}
