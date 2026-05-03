import {
  getAllDocs,
  getSourceLibraryCategories,
  getSourceLibraryGroups,
} from '../../lib/knowledge-store';
import { listAllCoworks } from '../../lib/coworks-store';
import { KnowledgeHomeClient } from '../knowledge/KnowledgeHomeClient';

export const metadata = { title: 'Sources · Loom' };

export default async function SourcesPage() {
  const [categories, sourceLibraryGroups, allDocs, writingRecords] = await Promise.all([
    getSourceLibraryCategories(),
    getSourceLibraryGroups(),
    getAllDocs(),
    listAllCoworks(),
  ]);

  const docsByCategory = new Map<string, typeof allDocs>();
  for (const doc of allDocs) {
    if (!docsByCategory.has(doc.categorySlug)) docsByCategory.set(doc.categorySlug, []);
    docsByCategory.get(doc.categorySlug)!.push(doc);
  }

  const groups = sourceLibraryGroups.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.categories.map((category) => {
      const docs = docsByCategory.get(category.slug) ?? [];
      const extractedCount = docs.filter((doc) => doc.hasText).length;
      const latestDoc = docs[0];
      return {
        slug: category.slug,
        label: category.label,
        count: category.count,
        groupId: group.id,
        href: `#${category.slug}`,
        extractedCount,
        pendingCount: Math.max(0, category.count - extractedCount),
        latestDocTitle: latestDoc?.title,
      };
    }),
  }));

  const categoryLabelBySlug = new Map(categories.map((category) => [category.slug, category.label]));
  const writingEntries = writingRecords.slice(0, 6).map((record) => ({
    id: record.id,
    title: record.title,
    href: '/workbench',
    categoryLabel: categoryLabelBySlug.get(record.categorySlug) ?? record.categorySlug,
    updatedAt: record.updatedAt,
    hasTidyDraft: record.hasTidyDraft,
    materialCount: record.materialCount,
  }));

  const totalDocs = categories.reduce((sum, category) => sum + category.count, 0);

  return (
    <KnowledgeHomeClient
      sourceLibraryGroups={groups}
      totalCollections={categories.length}
      totalDocs={totalDocs}
      writingEntries={writingEntries}
    />
  );
}
