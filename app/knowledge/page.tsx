import { getSourceLibraryGroups } from '../../lib/knowledge-store';
import { KnowledgeHomeClient } from './KnowledgeHomeClient';

export const metadata = { title: 'The Atlas · Loom' };
export const dynamic = 'force-dynamic';

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

export default async function KnowledgeHome() {
  const sourceLibraryGroups = await getSourceLibraryGroups();
  const totalCollections = sourceLibraryGroups.reduce((sum, group) => sum + group.categories.length, 0);
  const totalDocs = sourceLibraryGroups.reduce(
    (sum, group) => sum + group.categories.reduce((groupSum, category) => groupSum + category.count, 0),
    0,
  );

  const clientGroups = sourceLibraryGroups.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.categories.map((category) => ({
      slug: category.slug,
      label: category.label,
      count: category.count,
      groupId: group.id,
    })),
  }));

  return (
    <KnowledgeHomeClient
      sourceLibraryGroups={clientGroups}
      totalCollections={totalCollections}
      totalDocs={totalDocs}
    />
  );
}
