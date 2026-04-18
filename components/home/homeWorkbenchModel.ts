import type { LearningTarget } from '../../lib/learning-targets';
import type { HistoryEntry } from '../../lib/use-history';
import {
  buildDeskFocusTargetActions,
  type DeskFocusTargetActionDraft,
} from '../../lib/shared/desk-actions';
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

export type HomeForegroundActionDraft =
  | DeskFocusTargetActionDraft
  | { kind: 'open-shuttle'; label: 'Open Shuttle'; primary?: boolean }
  | { kind: 'open-atlas'; label: 'Open Atlas' }
  | { kind: 'open-today'; label: 'Open Today' };

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

export function buildHomeForegroundActions({
  hasFocusTarget,
  primaryLabel,
  secondaryLabel,
}: {
  hasFocusTarget: boolean;
  primaryLabel: string | null;
  secondaryLabel: string | null;
}): HomeForegroundActionDraft[] {
  if (hasFocusTarget && primaryLabel && secondaryLabel) {
    return [
      ...buildDeskFocusTargetActions({
        primaryLabel,
        secondaryLabel,
      }),
      { kind: 'open-shuttle', label: 'Open Shuttle' },
    ];
  }

  return [
    { kind: 'open-shuttle', label: 'Open Shuttle', primary: true },
    { kind: 'open-atlas', label: 'Open Atlas' },
    { kind: 'open-today', label: 'Open Today' },
  ];
}
