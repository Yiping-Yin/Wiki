/**
 * Resolve [[wikilink]] tokens to URLs by matching against the search index titles.
 * Used by the notes renderer (and potentially future blocks).
 */
import { allDocs } from './knowledge';
import { chapters } from './nav';

type Resolved = { href: string; title: string } | null;

let _index: Map<string, { href: string; title: string }> | null = null;

function buildIndex() {
  if (_index) return _index;
  const m = new Map<string, { href: string; title: string }>();
  for (const c of chapters) {
    m.set(c.slug.toLowerCase(), { href: `/wiki/${c.slug}`, title: c.title });
    m.set(c.title.toLowerCase(), { href: `/wiki/${c.slug}`, title: c.title });
  }
  for (const d of allDocs) {
    m.set(d.fileSlug.toLowerCase(), { href: `/knowledge/${d.categorySlug}/${d.fileSlug}`, title: d.title });
    m.set(d.title.toLowerCase(), { href: `/knowledge/${d.categorySlug}/${d.fileSlug}`, title: d.title });
  }
  _index = m;
  return m;
}

export function resolveWikilink(target: string): Resolved {
  const idx = buildIndex();
  const key = target.trim().toLowerCase();
  const hit = idx.get(key);
  if (hit) return hit;
  // fuzzy: substring match
  for (const [k, v] of idx) {
    if (k.includes(key) && key.length >= 4) return v;
  }
  return null;
}
