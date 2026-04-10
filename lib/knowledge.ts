import manifest from './knowledge-manifest.json';

export type KnowledgeDoc = {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  subOrder?: number;
  fileSlug: string;
  sourcePath: string;
  ext: string;
  size: number;
  hasText: boolean;
  preview: string;
};

export type SubGroup = {
  label: string;
  order: number;
  docs: KnowledgeDoc[];
};

/** Group a category's docs by subcategory (e.g. weeks), naturally sorted. */
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

export const allDocs = manifest as KnowledgeDoc[];

export function docsByCategory(slug: string) {
  return allDocs.filter((d) => d.categorySlug === slug);
}

export function findDoc(category: string, fileSlug: string) {
  return allDocs.find((d) => d.categorySlug === category && d.fileSlug === fileSlug);
}

export function neighborsInCategory(category: string, fileSlug: string) {
  const groups = groupBySubcategory(docsByCategory(category));
  const flat = groups.flatMap((g) => g.docs);
  const i = flat.findIndex((d) => d.fileSlug === fileSlug);
  return {
    prev: i > 0 ? flat[i - 1] : null,
    next: i >= 0 && i < flat.length - 1 ? flat[i + 1] : null,
  };
}

/** Find related docs from OTHER categories based on keyword overlap in title. */
export function relatedDocs(docId: string, limit = 4): KnowledgeDoc[] {
  const doc = allDocs.find((d) => d.id === docId);
  if (!doc) return [];
  // Extract meaningful keywords from the title (>2 chars, not common words)
  const stop = new Set(['the','and','for','with','from','this','that','are','was','were','has','have','its','but','not','all','can','will','one','two','our','out','new','old','use','how','may','she','her','his','him','who','did','get','had','let','say','any','own','too','few','big']);
  const keywords = doc.title.toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !stop.has(w));
  if (keywords.length === 0) return [];

  const scored: { doc: KnowledgeDoc; score: number }[] = [];
  for (const d of allDocs) {
    if (d.id === docId) continue;
    if (d.categorySlug === doc.categorySlug) continue; // only cross-category
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
