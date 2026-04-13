'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { LearningStatusInline } from '../../components/LearningStatusInline';
import { KnowledgeHomeStatic } from './KnowledgeHomeStatic';
import { useHistory } from '../../lib/use-history';
import { useAllTraces, type Trace } from '../../lib/trace';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../lib/learning-status';
import { REVIEW_RESUME_KEY, type ReviewResumePayload } from '../../lib/review-resume';
import { REFRESH_RESUME_KEY, type RefreshResumePayload } from '../../lib/refresh-resume';
import { OVERLAY_RESUME_KEY, type OverlayResumePayload } from '../../lib/overlay-resume';

type KnowledgeHomeDoc = {
  id: string;
  title: string;
  href: string;
  preview: string;
  categorySlug: string;
};

type KnowledgeHomeGroup = {
  label: string;
  count: number;
  items: Array<{
    slug: string;
    label: string;
    count: number;
    weeks: number;
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
  count: number;
  weeks: number;
  touchedAt: number;
  activeDoc: CollectionDocSurface | null;
  activeCount: number;
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
          count: collection.count,
          weeks: collection.weeks,
          touchedAt: activeDoc?.touchedAt ?? 0,
          activeDoc,
          activeCount,
        });
      }
    }

    return surfaces.sort((a, b) => b.touchedAt - a.touchedAt || b.activeCount - a.activeCount || a.label.localeCompare(b.label));
  }, [docsByCategory, groups, tracesByDocId, viewedByDocId]);

  const focusCollection = collectionSurfaces.find((collection) => collection.activeDoc && collection.touchedAt > 0) ?? collectionSurfaces[0] ?? null;

  const openPrimaryAction = (collection: CollectionSurface) => {
    const activeDoc = collection.activeDoc;
    if (!activeDoc) {
      router.push(collection.href);
      return;
    }
    if (activeDoc.learning.nextAction === 'refresh') {
      const reviewPayload: ReviewResumePayload = { href: activeDoc.href, anchorId: null };
      const refreshPayload: RefreshResumePayload = { href: activeDoc.href, source: 'knowledge' };
      try {
        sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(reviewPayload));
        sessionStorage.setItem(REFRESH_RESUME_KEY, JSON.stringify(refreshPayload));
      } catch {}
      router.push(activeDoc.href);
      return;
    }
    if (activeDoc.learning.nextAction === 'rehearse' || activeDoc.learning.nextAction === 'examine') {
      const payload: OverlayResumePayload = {
        href: activeDoc.href,
        overlay: activeDoc.learning.nextAction === 'rehearse' ? 'rehearsal' : 'examiner',
      };
      try {
        sessionStorage.setItem(OVERLAY_RESUME_KEY, JSON.stringify(payload));
      } catch {}
      router.push(activeDoc.href);
      return;
    }
    if (activeDoc.learning.nextAction === 'revisit') {
      const payload: ReviewResumePayload = { href: activeDoc.href, anchorId: null };
      try {
        sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(payload));
      } catch {}
      router.push(activeDoc.href);
      return;
    }
    router.push(activeDoc.href);
  };

  const openKesi = (collection: CollectionSurface) => {
    const docId = collection.activeDoc ? docIdFor(collection.activeDoc) : null;
    router.push(docId ? `/kesi?focus=${encodeURIComponent(docId)}` : '/kesi');
  };

  const openRelations = (collection: CollectionSurface) => {
    const docId = collection.activeDoc ? docIdFor(collection.activeDoc) : null;
    router.push(docId ? `/graph?focus=${encodeURIComponent(docId)}` : '/graph');
  };

  const previewText = (collection: CollectionSurface) => {
    const activeDoc = collection.activeDoc;
    if (!activeDoc) return 'Open the collection and begin weaving.';
    return activeDoc.latestSummary || activeDoc.latestQuote || activeDoc.preview || 'Return to the collection and keep weaving.';
  };

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      {focusCollection && (
        <section
          style={{
            padding: '0.1rem 0 1rem',
            marginBottom: 20,
            borderBottom: '0.5px solid var(--mat-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.65 }} />
            <span
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
              }}
            >
              Continue collection
            </span>
            <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
            {focusCollection.activeDoc && <LearningStatusInline status={focusCollection.activeDoc.learning} compact />}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: '1.18rem',
                  fontWeight: 650,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.25,
                  marginBottom: 6,
                }}
              >
                {focusCollection.label}
              </div>

              <div
                className="t-caption2"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  color: 'var(--muted)',
                  letterSpacing: '0.04em',
                  marginBottom: 8,
                }}
              >
                <span>{focusCollection.count} docs</span>
                {focusCollection.weeks > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{focusCollection.weeks} weeks</span>
                  </>
                )}
                {focusCollection.activeCount > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{focusCollection.activeCount} touched</span>
                  </>
                )}
                {focusCollection.touchedAt > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{formatWhen(focusCollection.touchedAt)}</span>
                  </>
                )}
              </div>

              <div
                style={{
                  color: 'var(--fg-secondary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.55,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {previewText(focusCollection)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignSelf: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => openPrimaryAction(focusCollection)} style={knowledgeActionStyle(true)}>
                {actionLabel(focusCollection.activeDoc?.learning.nextAction ?? 'capture')}
              </button>
              <button type="button" onClick={() => router.push(focusCollection.href)} style={knowledgeActionStyle(false)}>
                Collection
              </button>
              <button type="button" onClick={() => openKesi(focusCollection)} style={knowledgeActionStyle(false)}>
                Kesi
              </button>
              <button type="button" onClick={() => openRelations(focusCollection)} style={knowledgeActionStyle(false)}>
                Relations
              </button>
            </div>
          </div>
        </section>
      )}

      <KnowledgeHomeStatic groups={groups} />
    </div>
  );
}

function knowledgeActionStyle(primary: boolean) {
  return {
    appearance: 'none' as const,
    border: 0,
    background: 'transparent',
    color: primary ? 'var(--accent)' : 'var(--fg-secondary)',
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    padding: 0,
    cursor: 'pointer',
  };
}
