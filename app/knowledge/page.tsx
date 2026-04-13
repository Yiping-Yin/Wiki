import Link from 'next/link';
import { getAllDocs, getKnowledgeCategories } from '../../lib/knowledge-store';
import { KesiSwatch } from '../../components/KesiSwatch';
import { KnowledgeHomeClient } from './KnowledgeHomeClient';
import { KnowledgeHomeStatic } from './KnowledgeHomeStatic';

export const metadata = { title: 'Your Kesi · Loom' };

/**
 * /knowledge — kesi-swatch grid view of every collection.
 *
 * §1, §11 — the previous version had a glassed aurora hero with
 * "Your Kesi · 缂" eyebrow + large title + 3-stat row + descriptive
 * paragraph. All chrome. The kesi swatches themselves ARE the page —
 * they need no introduction. /about already explains the metaphor.
 *
 * Each collection's swatch (a small woven preview from KesiSwatch)
 * stays — that's §19 in action: the visualization derives from the
 * physical kesi grammar, not from borrowed UI patterns.
 */

function groupTop(cats: Awaited<ReturnType<typeof getKnowledgeCategories>>) {
  const groups = new Map<string, typeof cats>();
  for (const c of cats) {
    const m = c.label.match(/^([^·]+?)\s*·/);
    const top = m ? m[1].trim() : 'Other';
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top)!.push(c);
  }
  return Array.from(groups.entries())
    .map(([label, items]) => ({
      label,
      count: items.reduce((s, c) => s + c.count, 0),
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.count - a.count);
}

export default async function KnowledgeHome() {
  const [knowledgeCategories, allDocs] = await Promise.all([
    getKnowledgeCategories(),
    getAllDocs(),
  ]);
  const groups = groupTop(knowledgeCategories);

  const clientGroups = groups.map((group) => ({
    label: group.label,
    count: group.count,
    items: group.items.map((category) => ({
      slug: category.slug,
      label: category.label.replace(/^[^·]+·\s*/, ''),
      count: category.count,
      weeks: category.subs.filter((s) => s.label).length,
      docIds: allDocs
        .filter((doc) => doc.categorySlug === category.slug)
        .map((doc) => `know/${doc.id}`),
    })),
  }));

  return <KnowledgeHomeClient groups={clientGroups} />;
}
