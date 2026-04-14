'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { QuietGuideCard } from '../../components/QuietGuideCard';
import { KnowledgeHomeStatic } from './KnowledgeHomeStatic';
import { useHistory } from '../../lib/use-history';
import { useAllTraces, type Trace } from '../../lib/trace';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../lib/learning-status';
import { continuePanelLifecycle } from '../../lib/panel-resume';

type KnowledgeHomeDoc = {
  id: string;
  title: string;
  href: string;
  preview: string;
  categorySlug: string;
};

type KnowledgeHomeGroup = {
  label: string;
  items: Array<{
    slug: string;
    label: string;
  }>;
};

type CollectionDocSurface = KnowledgeHomeDoc & {
  viewedAt: number;
  touchedAt: number;
  latestSummary: string;
  latestQuote?: string;
  learning: LearningSurfaceSummary;
};

type CollectionSurface = {
  slug: string;
  label: string;
  href: string;
  touchedAt: number;
  activeDoc: CollectionDocSurface | null;
};

function docIdFor(doc: KnowledgeHomeDoc) {
  return `know/${doc.id}`;
}

function formatWhen(ts: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < day * 2) return 'yesterday';
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 30) return `${Math.floor(diff / (day * 7))}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function actionLabel(nextAction: LearningSurfaceSummary['nextAction']) {
  if (nextAction === 'refresh') return 'Refresh';
  if (nextAction === 'rehearse') return 'Rehearsal';
  if (nextAction === 'examine') return 'Examiner';
  if (nextAction === 'capture') return 'Open';
  return 'Return';
}

function docSort(a: CollectionDocSurface, b: CollectionDocSurface) {
  const rank = (surface: CollectionDocSurface) => {
    if (surface.learning.finished) return 3;
    if (surface.learning.anchorCount > 0) return 0;
    if (surface.viewedAt > 0) return 1;
    return 2;
  };
  return rank(a) - rank(b) || b.touchedAt - a.touchedAt || a.title.localeCompare(b.title);
}

export function KnowledgeHomeClient({
  groups,
  docs,
}: {
  groups: KnowledgeHomeGroup[];
  docs: KnowledgeHomeDoc[];
}) {
  const router = useRouter();
  const [history] = useHistory();
  const { traces } = useAllTraces();

  const viewedByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      if (!entry.id.startsWith('know/')) continue;
      map.set(entry.id, Math.max(map.get(entry.id) ?? 0, entry.viewedAt));
    }
    return map;
  }, [history]);

  const tracesByDocId = useMemo(() => {
    const map = new Map<string, Trace[]>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      if (!trace.source.docId.startsWith('know/')) continue;
      const current = map.get(trace.source.docId) ?? [];
      current.push(trace);
      map.set(trace.source.docId, current);
    }
    return map;
  }, [traces]);

  const docsByCategory = useMemo(() => {
    const map = new Map<string, KnowledgeHomeDoc[]>();
    for (const doc of docs) {
      const current = map.get(doc.categorySlug) ?? [];
      current.push(doc);
      map.set(doc.categorySlug, current);
    }
    return map;
  }, [docs]);

  const collectionSurfaces = useMemo(() => {
    const surfaces: CollectionSurface[] = [];
    for (const group of groups) {
      for (const collection of group.items) {
        const categoryDocs = docsByCategory.get(collection.slug) ?? [];
        const docSurfaces = categoryDocs
          .map((doc) => {
            const key = docIdFor(doc);
            const viewedAt = viewedByDocId.get(key) ?? 0;
            const traceSet = tracesByDocId.get(key) ?? [];
            const learning = summarizeLearningSurface(traceSet, viewedAt);
            return {
              ...doc,
              viewedAt,
              touchedAt: Math.max(learning.touchedAt, viewedAt),
              latestSummary: learning.latestSummary,
              latestQuote: learning.latestQuote,
              learning,
            } satisfies CollectionDocSurface;
          })
          .sort(docSort);

        const activeDoc = docSurfaces.find((doc) => doc.touchedAt > 0 || doc.learning.anchorCount > 0) ?? docSurfaces[0] ?? null;
        const activeCount = docSurfaces.filter((doc) => doc.touchedAt > 0 || doc.learning.anchorCount > 0).length;
        surfaces.push({
          slug: collection.slug,
          label: collection.label,
          href: `/knowledge/${collection.slug}`,
          touchedAt: activeDoc?.touchedAt ?? 0,
          activeDoc,
        });
      }
    }

    return surfaces.sort((a, b) => b.touchedAt - a.touchedAt || a.label.localeCompare(b.label));
  }, [docsByCategory, groups, tracesByDocId, viewedByDocId]);

  const focusCollection = collectionSurfaces.find((collection) => collection.activeDoc && collection.touchedAt > 0) ?? collectionSurfaces[0] ?? null;

  const openPrimaryAction = (collection: CollectionSurface) => {
    const activeDoc = collection.activeDoc;
    if (!activeDoc) {
      router.push(collection.href);
      return;
    }
    continuePanelLifecycle(router, {
      href: activeDoc.href,
      nextAction: activeDoc.learning.nextAction,
      latestAnchorId: activeDoc.learning.latestAnchorId,
      refreshSource: 'knowledge',
    });
  };

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      {focusCollection && (
        <QuietGuideCard
          eyebrow="Continue collection"
          title={focusCollection.label}
          mode="inline"
          meta={focusCollection.touchedAt > 0 ? <span>{formatWhen(focusCollection.touchedAt)}</span> : undefined}
          actions={[
            { label: 'Continue collection', onClick: () => openPrimaryAction(focusCollection), primary: true },
            { label: 'All material', href: focusCollection.href },
          ]}
        />
      )}

      <KnowledgeHomeStatic groups={groups} />
    </div>
  );
}
