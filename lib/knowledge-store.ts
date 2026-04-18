import { promises as fs } from 'node:fs';
import path from 'node:path';
import { toKnowledgeRelativePath } from './server-config';
import type { KnowledgeCategory, KnowledgeDoc } from './knowledge-types';

const ROOT = process.cwd();
const MANIFEST_ROOT = path.join(ROOT, 'knowledge', '.cache', 'manifest');
const RUNTIME_MANIFEST_PATH = path.join(MANIFEST_ROOT, 'knowledge-manifest.json');
const RUNTIME_NAV_PATH = path.join(MANIFEST_ROOT, 'knowledge-nav.json');

type NavPayload = {
  knowledgeCategories: KnowledgeCategory[];
  knowledgeTotal: number;
};

let docsPromise: Promise<KnowledgeDoc[]> | null = null;
let navPromise: Promise<NavPayload> | null = null;

export function invalidateKnowledgeStoreCache() {
  docsPromise = null;
  navPromise = null;
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

export function knowledgeManifestRoot() {
  return MANIFEST_ROOT;
}

export function knowledgeManifestPath() {
  return RUNTIME_MANIFEST_PATH;
}

export function knowledgeNavPath() {
  return RUNTIME_NAV_PATH;
}

export async function getAllDocs(): Promise<KnowledgeDoc[]> {
  if (!docsPromise) {
    docsPromise = (async () => {
      const docs = await loadJsonFile<KnowledgeDoc[]>(RUNTIME_MANIFEST_PATH) ?? [];
      return docs.map(normalizeDoc);
    })();
  }
  return docsPromise;
}

export async function getKnowledgeNav(): Promise<NavPayload> {
  if (!navPromise) {
    navPromise = (async () => {
      return await loadJsonFile<NavPayload>(RUNTIME_NAV_PATH) ?? { knowledgeCategories: [], knowledgeTotal: 0 };
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
