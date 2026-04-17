import type { LearningTarget } from '../../lib/learning-targets';
import type { HistoryEntry } from '../../lib/use-history';

export type HomeIndexDoc = {
  id: string;
  title: string;
  href: string;
  category: string;
};

export type HomeRecentThread = {
  id: string;
  title: string;
  href: string;
  category: string;
};

export type HomeForegroundDraft = {
  eyebrow: string;
  title: string;
  meta: string;
  summary: string;
  detail: string;
};

export function parseHomeSearchIndexPayload(payload: any): HomeIndexDoc[] {
  const stored = payload?.index?.storedFields ?? {};
  const docIds = payload?.index?.documentIds ?? {};
  const docs: HomeIndexDoc[] = [];

  for (const [internal, fields] of Object.entries<any>(stored)) {
    if (!fields?.title || !fields?.href) continue;
    docs.push({
      id: String(docIds[internal] ?? internal),
      title: fields.title,
      href: fields.href,
      category: fields.category ?? '',
    });
  }

  return docs;
}

export async function loadHomeDocs(): Promise<HomeIndexDoc[]> {
  try {
    const response = await fetch('/api/search-index');
    if (!response.ok) return [];
    const payload = await response.json();
    return parseHomeSearchIndexPayload(payload);
  } catch {
    return [];
  }
}

export function buildHomeDocsById(docs: HomeIndexDoc[]) {
  const map = new Map<string, HomeIndexDoc>();
  for (const doc of docs) map.set(doc.id, doc);
  return map;
}

export function buildHomeRecentThreads(
  history: HistoryEntry[],
  docsById: Map<string, HomeIndexDoc>,
  limit = 4,
): HomeRecentThread[] {
  const seen = new Set<string>();
  const items: HomeRecentThread[] = [];

  for (const entry of history) {
    if (seen.has(entry.id) || items.length >= limit) continue;
    seen.add(entry.id);
    const meta = docsById.get(entry.id);
    items.push({
      id: entry.id,
      title: meta?.title ?? entry.title,
      href: meta?.href ?? entry.href,
      category: meta?.category ?? '',
    });
  }

  return items;
}

export function buildHomeGuideMeta({
  recentCount,
  resolvedCount,
  queueCount,
}: {
  recentCount: number;
  resolvedCount: number;
  queueCount: number;
}) {
  return [
    recentCount > 0 ? `${recentCount} recent thread${recentCount === 1 ? '' : 's'}` : 'Desk is quiet',
    resolvedCount > 0 ? `${resolvedCount} resolved` : null,
    queueCount > 0 ? `${queueCount} in queue` : null,
  ].filter(Boolean).join(' · ');
}

export function buildHomeForegroundDraft({
  guideMeta,
  focusTitle,
  focusSummary,
  whyNowDetail,
}: {
  guideMeta: string;
  focusTitle: LearningTarget['title'] | null;
  focusSummary: string | null;
  whyNowDetail: string | null;
}): HomeForegroundDraft {
  if (focusTitle && focusSummary && whyNowDetail) {
    return {
      eyebrow: 'Current return',
      title: focusTitle,
      meta: guideMeta,
      summary: focusSummary,
      detail: whyNowDetail,
    };
  }

  return {
    eyebrow: 'Quiet surface',
    title: 'Nothing urgent is asking for attention.',
    meta: guideMeta,
    summary: 'Open the Shuttle to move anywhere, or enter the Atlas from the Sidebar. Once a source changes, the return appears here.',
    detail: 'The empty state is still a desk: enough structure to begin, without pretending work already exists.',
  };
}
