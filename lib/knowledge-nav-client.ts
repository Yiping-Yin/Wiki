/**
 * Client-side equivalent of `/api/knowledge-nav`. Native ship builds have
 * no server, so we read the two manifest files directly from the
 * security-scoped content root via `loom://content/…`, then replicate the
 * small amount of grouping + sort logic that the route performs server-side.
 *
 * Dev mode (localhost:3001) unchanged — falls through to `/api/knowledge-nav`.
 *
 * Used by `lib/use-knowledge-nav.ts` (the shared React hook) which feeds
 * the web-side Sidebar, DropZone, PatternsView, Knowledge home, and every
 * other surface that asks "which categories / source-library groups does
 * the user have?".
 */
import { isNativeMode } from './is-native-mode';
import type {
  KnowledgeCategory,
  SourceLibraryGroup,
  SourceLibraryGroupRecord,
  SourceLibraryMembership,
} from './knowledge-types';

export type KnowledgeNavPayload = {
  knowledgeCategories: KnowledgeCategory[];
  knowledgeTotal: number;
  sourceLibraryGroups: SourceLibraryGroup[];
};

// Mirror of lib/source-library-metadata.ts — duplicated here because that
// module is Node-only (imports fs/crypto). Keep these in sync.
const FALLBACK_GROUP_ID = 'ungrouped';
const FALLBACK_GROUP_LABEL = 'Ungrouped';
const FALLBACK_GROUP_ORDER = 9999;
const DEFAULT_MEMBERSHIP_ORDER = 9999;

// The nav manifest lives under the user's content-root; shelf metadata is
// user data served by Swift from `loom://native/…`. Missing files → 404 →
// graceful empty payload (same as the server's behavior when the cache
// hasn't been built yet).
const NAV_URL = 'loom://content/knowledge/.cache/manifest/knowledge-nav.json';
const GROUPS_URL = 'loom://native/source-library-groups.json';

export async function fetchKnowledgeNav(): Promise<KnowledgeNavPayload> {
  if (isNativeMode()) {
    return fetchFromContentRoot();
  }
  const r = await fetch('/api/knowledge-nav', { cache: 'no-store' });
  if (!r.ok) {
    throw new Error('Failed to load knowledge nav');
  }
  return normalize(await r.json());
}

async function fetchFromContentRoot(): Promise<KnowledgeNavPayload> {
  const [navJson, metaJson] = await Promise.all([
    safeFetchJson<{
      knowledgeCategories?: KnowledgeCategory[];
      knowledgeTotal?: number;
    }>(NAV_URL, { knowledgeCategories: [], knowledgeTotal: 0 }),
    safeFetchJson<{
      groups?: SourceLibraryGroupRecord[];
      memberships?: SourceLibraryMembership[];
    }>(GROUPS_URL, { groups: [], memberships: [] }),
  ]);

  const knowledgeCategories = (navJson.knowledgeCategories ?? []).map((cat) => ({
    ...cat,
    subs: (cat.subs ?? []).map((s) => ({ ...s })),
    kind: cat.kind === 'wiki' ? 'wiki' : 'source',
  })) as KnowledgeCategory[];

  const sourceLibraryGroups = assembleGroups(
    knowledgeCategories.filter((c) => c.kind === 'source'),
    {
      groups: metaJson.groups ?? [],
      memberships: metaJson.memberships ?? [],
    },
  );

  return {
    knowledgeCategories,
    knowledgeTotal: navJson.knowledgeTotal ?? 0,
    sourceLibraryGroups,
  };
}

async function safeFetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

function normalize(payload: Partial<KnowledgeNavPayload> | null): KnowledgeNavPayload {
  return {
    knowledgeCategories: payload?.knowledgeCategories ?? [],
    knowledgeTotal: payload?.knowledgeTotal ?? 0,
    sourceLibraryGroups: payload?.sourceLibraryGroups ?? [],
  };
}

/**
 * Port of `getSourceLibraryGroups()` from lib/knowledge-store.ts — pure
 * computation over already-fetched data, no fs calls. Stays in lockstep
 * with the server implementation; if the server one changes, update here.
 */
function assembleGroups(
  sourceCategories: KnowledgeCategory[],
  metadata: { groups: SourceLibraryGroupRecord[]; memberships: SourceLibraryMembership[] },
): SourceLibraryGroup[] {
  const membershipByCategory = new Map(
    metadata.memberships.map((m) => [m.categorySlug, m]),
  );

  const seedGroups: SourceLibraryGroupRecord[] = [...metadata.groups];
  if (!seedGroups.find((g) => g.id === FALLBACK_GROUP_ID)) {
    seedGroups.push({
      id: FALLBACK_GROUP_ID,
      label: FALLBACK_GROUP_LABEL,
      order: FALLBACK_GROUP_ORDER,
    });
  }

  const groups = new Map<string, SourceLibraryGroup>(
    seedGroups.map((g) => [g.id, { ...g, count: 0, categories: [] }]),
  );

  for (const category of sourceCategories) {
    const membership = membershipByCategory.get(category.slug);
    if (membership?.hidden) continue;
    const groupId = membership && groups.has(membership.groupId)
      ? membership.groupId
      : FALLBACK_GROUP_ID;
    const target = groups.get(groupId);
    if (!target) continue;
    target.categories.push({
      ...category,
      subs: category.subs.map((s) => ({ ...s })),
    });
  }

  return Array.from(groups.values())
    .map((group) => {
      const orders = new Map(
        group.categories.map((c) => [
          c.slug,
          membershipByCategory.get(c.slug)?.order ?? DEFAULT_MEMBERSHIP_ORDER,
        ]),
      );
      const sortedCategories = [...group.categories].sort((a, b) => {
        const ordA = orders.get(a.slug) ?? DEFAULT_MEMBERSHIP_ORDER;
        const ordB = orders.get(b.slug) ?? DEFAULT_MEMBERSHIP_ORDER;
        return (ordA - ordB) || a.label.localeCompare(b.label);
      });
      return {
        ...group,
        count: sortedCategories.length,
        categories: sortedCategories,
      };
    })
    .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
}
