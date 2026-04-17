'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  buildHomeDocsById,
  loadHomeDocs,
  type HomeIndexDoc,
} from './homeWorkbenchModel';

let docsCache: HomeIndexDoc[] | null = null;

export async function loadCachedHomeDocs(
  loader: () => Promise<HomeIndexDoc[]> = loadHomeDocs,
): Promise<HomeIndexDoc[]> {
  if (docsCache) return docsCache;
  const docs = await loader();
  docsCache = docs;
  return docs;
}

export function resetHomeWorkbenchDataCache() {
  docsCache = null;
}

export function useHomeWorkbenchData() {
  const [docs, setDocs] = useState<HomeIndexDoc[]>([]);

  useEffect(() => {
    let cancelled = false;

    loadCachedHomeDocs().then((nextDocs) => {
      if (!cancelled) {
        setDocs(nextDocs);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const docsById = useMemo(() => buildHomeDocsById(docs), [docs]);

  return {
    docs,
    docsById,
  };
}
