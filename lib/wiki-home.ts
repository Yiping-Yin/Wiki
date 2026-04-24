import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './server-config';
import { searchIndexPath } from './derived-index-cache';

export type WikiHomeItem = {
  title: string;
  href: string;
};

export type WikiHomeSection = {
  label: string;
  count: number;
  items: WikiHomeItem[];
};

async function loadSearchIndex() {
  const candidates = [
    searchIndexPath(),
    path.join(CONTENT_ROOT, 'public', 'search-index.json'),
  ];

  for (const candidate of candidates) {
    try {
      const body = await fs.readFile(candidate, 'utf8');
      return JSON.parse(body) as {
        index?: {
          storedFields?: Record<string, { title?: string; href?: string; category?: string }>;
        };
      };
    } catch {
      // Try the next location.
    }
  }

  return { index: { storedFields: {} } };
}

export async function getWikiHomeSections(): Promise<WikiHomeSection[]> {
  const payload = await loadSearchIndex();
  const storedFields = payload.index?.storedFields ?? {};
  const groups = new Map<string, WikiHomeItem[]>();

  for (const value of Object.values(storedFields)) {
    const title = value?.title?.trim();
    const href = value?.href?.trim();
    const category = value?.category?.trim();
    if (!title || !href || !category) continue;
    if (!href.startsWith('/wiki/')) continue;
    groups.set(category, [...(groups.get(category) ?? []), { title, href }]);
  }

  return Array.from(groups.entries())
    .map(([label, items]) => ({
      label,
      count: items.length,
      items: items.sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
