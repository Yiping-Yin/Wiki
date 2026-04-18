import { promises as fs } from 'node:fs';
import path from 'node:path';
import { toKnowledgeRelativePath } from './server-config';
import {
  DEFAULT_SOURCE_LIBRARY_ORDER,
  FALLBACK_SOURCE_LIBRARY_GROUP_ID,
  readSourceLibraryMetadata,
} from './source-library-metadata';
import type {
  KnowledgeCategory,
  KnowledgeCategoryKind,
  KnowledgeDoc,
  SourceLibraryGroup,
} from './knowledge-types';

type NavPayload = {
  knowledgeCategories: KnowledgeCategory[];
  knowledgeTotal: number;
};

type StoredKnowledgeCategory = Omit<KnowledgeCategory, 'kind'> & {
  kind?: KnowledgeCategoryKind;
};

let docsPromise: Promise<KnowledgeDoc[]> | null = null;
let navPromise: Promise<NavPayload> | null = null;
let docsCacheKey: string | null = null;
let navCacheKey: string | null = null;
let docsCacheSignature: string | null = null;
let navCacheSignature: string | null = null;

export function invalidateKnowledgeStoreCache() {
  docsPromise = null;
  navPromise = null;
  docsCacheKey = null;
  navCacheKey = null;
  docsCacheSignature = null;
  navCacheSignature = null;
}

function normalizeDoc(doc: KnowledgeDoc): KnowledgeDoc {
  return {
    ...doc,
    sourcePath: toKnowledgeRelativePath(doc.sourcePath),
  };
}

async function loadJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

async function fileSignature(file: string): Promise<string> {
  try {
    const stat = await fs.stat(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'missing';
  }
}

export function knowledgeManifestRoot() {
  return path.join(process.cwd(), 'knowledge', '.cache', 'manifest');
}

export function knowledgeManifestPath() {
  return path.join(knowledgeManifestRoot(), 'knowledge-manifest.json');
}

export function knowledgeNavPath() {
  return path.join(knowledgeManifestRoot(), 'knowledge-nav.json');
}

export async function getAllDocs(): Promise<KnowledgeDoc[]> {
  const manifestPath = knowledgeManifestPath();
  const signature = await fileSignature(manifestPath);
  if (docsCacheKey !== manifestPath || docsCacheSignature !== signature) {
    docsPromise = null;
    docsCacheKey = manifestPath;
    docsCacheSignature = signature;
  }
  if (!docsPromise) {
    docsPromise = (async () => {
      const docs = await loadJsonFile<KnowledgeDoc[]>(manifestPath) ?? [];
      return docs.map(normalizeDoc);
    })();
  }
  return docsPromise;
}

export async function getKnowledgeNav(): Promise<NavPayload> {
  const navPath = knowledgeNavPath();
  const signature = await fileSignature(navPath);
  if (navCacheKey !== navPath || navCacheSignature !== signature) {
    navPromise = null;
    navCacheKey = navPath;
    navCacheSignature = signature;
  }
  if (!navPromise) {
    navPromise = (async () => {
      const payload = await loadJsonFile<{
        knowledgeCategories: StoredKnowledgeCategory[];
        knowledgeTotal: number;
      }>(navPath) ?? { knowledgeCategories: [], knowledgeTotal: 0 };

      return {
        knowledgeTotal: payload.knowledgeTotal,
        knowledgeCategories: payload.knowledgeCategories.map(normalizeKnowledgeCategory),
      };
    })();
  }
  return navPromise;
}

export async function getKnowledgeCategories(): Promise<KnowledgeCategory[]> {
  return (await getKnowledgeNav()).knowledgeCategories;
}

export async function getKnowledgeTotal(): Promise<number> {
  return (await getKnowledgeNav()).knowledgeTotal;
}

function cloneKnowledgeCategory(category: KnowledgeCategory): KnowledgeCategory {
  return {
    ...category,
    subs: category.subs.map((sub) => ({ ...sub })),
    kind: knowledgeCategoryKind(category),
  };
}

function knowledgeCategoryKind(category: KnowledgeCategory): KnowledgeCategoryKind {
  return category.kind === 'wiki' ? 'wiki' : 'source';
}

function normalizeKnowledgeCategory(category: StoredKnowledgeCategory): KnowledgeCategory {
  return {
    ...category,
    subs: (category.subs ?? []).map((sub) => ({ ...sub })),
    kind: category.kind === 'wiki' ? 'wiki' : 'source',
  };
}

export async function getSourceLibraryCategories(): Promise<KnowledgeCategory[]> {
  const categories = await getKnowledgeCategories();
  return categories
    .filter((category) => knowledgeCategoryKind(category) === 'source')
    .map(cloneKnowledgeCategory);
}

export async function getSourceLibraryGroups(): Promise<SourceLibraryGroup[]> {
  const [categories, metadata] = await Promise.all([
    getSourceLibraryCategories(),
    readSourceLibraryMetadata(),
  ]);

  const membershipByCategory = new Map(
    metadata.memberships.map((membership) => [membership.categorySlug, membership]),
  );
  const groups = new Map<string, SourceLibraryGroup>(
    metadata.groups.map((group) => [
      group.id,
      {
        ...group,
        count: 0,
        categories: [],
      },
    ]),
  );

  for (const category of categories) {
    const membership = membershipByCategory.get(category.slug);
    const groupId = membership && groups.has(membership.groupId)
      ? membership.groupId
      : FALLBACK_SOURCE_LIBRARY_GROUP_ID;
    const targetGroup = groups.get(groupId);
    if (!targetGroup) continue;
    targetGroup.categories.push(cloneKnowledgeCategory(category));
  }

  const sortedGroups = Array.from(groups.values())
    .map((group) => {
      const memberships = new Map(
        group.categories.map((category) => [category.slug, membershipByCategory.get(category.slug)?.order ?? DEFAULT_SOURCE_LIBRARY_ORDER]),
      );
      const sortedCategories = [...group.categories].sort((a, b) => {
        const orderDiff = (memberships.get(a.slug) ?? DEFAULT_SOURCE_LIBRARY_ORDER)
          - (memberships.get(b.slug) ?? DEFAULT_SOURCE_LIBRARY_ORDER);
        return orderDiff || a.label.localeCompare(b.label);
      });
      return {
        ...group,
        count: sortedCategories.length,
        categories: sortedCategories,
      };
    })
    .sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));

  return sortedGroups;
}

export type SubGroup = {
  label: string;
  order: number;
  docs: KnowledgeDoc[];
};

export function groupBySubcategory(docs: KnowledgeDoc[]): SubGroup[] {
  const map = new Map<string, SubGroup>();
  for (const d of docs) {
    const label = d.subcategory ?? '';
    if (!map.has(label)) {
      map.set(label, { label, order: d.subOrder ?? 9999, docs: [] });
    }
    map.get(label)!.docs.push(d);
  }
  const groups = Array.from(map.values());
  for (const g of groups) g.docs.sort((a, b) => a.title.localeCompare(b.title));
  groups.sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
  return groups;
}

export async function docsByCategory(slug: string): Promise<KnowledgeDoc[]> {
  const docs = await getAllDocs();
  return docs.filter((d) => d.categorySlug === slug);
}

export async function findDoc(category: string, fileSlug: string): Promise<KnowledgeDoc | undefined> {
  const docs = await getAllDocs();
  return docs.find((d) => d.categorySlug === category && d.fileSlug === fileSlug);
}

export async function neighborsInCategory(category: string, fileSlug: string) {
  const groups = groupBySubcategory(await docsByCategory(category));
  const flat = groups.flatMap((g) => g.docs);
  const i = flat.findIndex((d) => d.fileSlug === fileSlug);
  return {
    prev: i > 0 ? flat[i - 1] : null,
    next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : null,
  };
}

export async function relatedDocs(docId: string, limit = 4): Promise<KnowledgeDoc[]> {
  const docs = await getAllDocs();
  const doc = docs.find((d) => d.id === docId);
  if (!doc) return [];
  const stop = new Set(['the','and','for','with','from','this','that','are','was','were','has','have','its','but','not','all','can','will','one','two','our','out','new','old','use','how','may','she','her','his','him','who','did','get','had','let','say','any','own','too','few','big']);
  const keywords = doc.title.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !stop.has(w));
  if (keywords.length === 0) return [];

  const scored: { doc: KnowledgeDoc; score: number }[] = [];
  for (const d of docs) {
    if (d.id === docId) continue;
    if (d.categorySlug === doc.categorySlug) continue;
    const titleLower = d.title.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 2;
    }
    if (score > 0) scored.push({ doc: d, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.doc);
}
