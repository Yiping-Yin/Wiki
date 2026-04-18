import { getKnowledgeCategories, getKnowledgeTotal } from '../../lib/knowledge-store';
import { KnowledgeHomeClient } from './KnowledgeHomeClient';

export const metadata = { title: 'The Atlas · Loom' };

/**
 * /knowledge — pattern-swatch grid view of every collection.
 *
 * §1, §11 — the previous version had a glassed aurora hero with
 * "Your Patterns" eyebrow + large title + 3-stat row + descriptive
 * paragraph. All chrome. The pattern swatches themselves ARE the page —
 * they need no introduction. /about already explains the metaphor.
 *
 * Each collection's swatch (a small woven preview from PatternSwatch)
 * stays — that's §19 in action: the visualization derives from the
 * physical weaving grammar, not from borrowed UI patterns.
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
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default async function KnowledgeHome() {
  const [knowledgeCategories, knowledgeTotal] = await Promise.all([
    getKnowledgeCategories(),
    getKnowledgeTotal(),
  ]);
  const groups = groupTop(knowledgeCategories);

  const clientGroups = groups.map((group) => ({
    label: group.label,
    items: group.items.map((category) => ({
      slug: category.slug,
      label: category.label.replace(/^[^·]+·\s*/, ''),
      count: category.count,
    })),
  }));

  return (
    <KnowledgeHomeClient
      groups={clientGroups}
      totalCollections={knowledgeCategories.length}
      totalDocs={knowledgeTotal}
    />
  );
}
