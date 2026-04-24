import { getSourceLibraryCategories, getSourceLibraryGroups } from '../../lib/knowledge-store';
import { KnowledgeHomeClient } from '../knowledge/KnowledgeHomeClient';

export const metadata = { title: 'Sources · Loom' };

export default async function SourcesPage() {
  const [categories, sourceLibraryGroups] = await Promise.all([
    getSourceLibraryCategories(),
    getSourceLibraryGroups(),
  ]);

  const groups = sourceLibraryGroups.map((group) => ({
    id: group.id,
    label: group.label,
    items: group.categories.map((category) => ({
      slug: category.slug,
      label: category.label,
      count: category.count,
      groupId: group.id,
    })),
  }));

  const totalDocs = categories.reduce((sum, category) => sum + category.count, 0);

  return (
    <KnowledgeHomeClient
      sourceLibraryGroups={groups}
      totalCollections={categories.length}
      totalDocs={totalDocs}
    />
  );
}
