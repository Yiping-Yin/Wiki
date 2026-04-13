'use client';

import { useMemo } from 'react';
import { KnowledgeHomeStatic } from './KnowledgeHomeStatic';
import { summarizeLearningSurface } from '../../lib/learning-status';
import { useAllTraces, type Trace } from '../../lib/trace';
import { useHistory } from '../../lib/use-history';

type CollectionCardData = {
  slug: string;
  label: string;
  count: number;
  weeks: number;
  docIds: string[];
};

type CollectionGroupData = {
  label: string;
  count: number;
  items: CollectionCardData[];
};

type CollectionProgress = {
  touched: number;
  crystallized: number;
  examined: number;
  stale: number;
};

export function KnowledgeHomeClient({ groups }: { groups: CollectionGroupData[] }) {
  const [history] = useHistory();
  const { traces } = useAllTraces();

  const viewedByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      map.set(entry.id, Math.max(map.get(entry.id) ?? 0, entry.viewedAt));
    }
    return map;
  }, [history]);

  const tracesByDocId = useMemo(() => {
    const map = new Map<string, Trace[]>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const existing = map.get(trace.source.docId) ?? [];
      existing.push(trace);
      map.set(trace.source.docId, existing);
    }
    return map;
  }, [traces]);

  const collectionProgress = useMemo(() => {
    const map = new Map<string, CollectionProgress>();
    for (const group of groups) {
      for (const item of group.items) {
        let touched = 0;
        let crystallized = 0;
        let examined = 0;
        let stale = 0;

        for (const docId of item.docIds) {
          const viewedAt = viewedByDocId.get(docId) ?? 0;
          const learning = summarizeLearningSurface(tracesByDocId.get(docId) ?? [], viewedAt);
          if (learning.opened) touched += 1;
          if (learning.crystallized) crystallized += 1;
          if (learning.examinerCount > 0) examined += 1;
          if (learning.opened && learning.recency === 'stale') stale += 1;
        }

        map.set(item.slug, {
          touched,
          crystallized,
          examined,
          stale,
        });
      }
    }
    return map;
  }, [groups, tracesByDocId, viewedByDocId]);

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      <KnowledgeHomeStatic
        groups={groups.map((group) => ({
          ...group,
          items: group.items.map((item) => {
            const progress = collectionProgress.get(item.slug);
            const detail = progress && progress.touched > 0
              ? `${progress.touched} touched${progress.examined > 0 ? ` · ${progress.examined} examined` : ''}${progress.crystallized > 0 ? ` · ${progress.crystallized} settled` : ''}${progress.stale > 0 ? ` · ${progress.stale} stale` : ''}`
              : null;
            return {
              slug: item.slug,
              label: item.label,
              count: item.count,
              weeks: item.weeks,
              detail,
            };
          }),
        }))}
      />
    </div>
  );
}
