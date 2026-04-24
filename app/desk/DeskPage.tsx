import { getAllDocs, getKnowledgeTotal, getSourceLibraryCategories } from '../../lib/knowledge-store';
import { listAllCoworks } from '../../lib/coworks-store';
import AtlasClient from '../AtlasClient';
import { TodayClient } from '../today/TodayClient';

/** Trim full doc list to a tiny per-doc index the client uses for routing/lookups. */
function buildLite(allDocs: Awaited<ReturnType<typeof getAllDocs>>) {
  return allDocs.map((d) => ({
    id: `know/${d.id}`,
    title: d.title,
    href: `/knowledge/${d.categorySlug}/${d.fileSlug}`,
    category: d.category,
    categorySlug: d.categorySlug,
    subcategory: d.subcategory ?? '',
    subOrder: d.subOrder ?? 9999,
    preview: d.preview ?? '',
  }));
}

export default async function DeskPage() {
  if (process.env.LOOM_NEXT_OUTPUT === 'export') {
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        <AtlasClient />
        <TodayClient
          totalDocs={0}
          docsLite={[]}
          daily={null}
          recentCoworks={[]}
          embedded
        />
      </main>
    );
  }

  const [allDocs, totalDocs, coworks, categories] = await Promise.all([
    getAllDocs(),
    getKnowledgeTotal(),
    listAllCoworks(),
    getSourceLibraryCategories(),
  ]);
  const catLabelBySlug = new Map(categories.map((c) => [c.slug, c.label]));
  const recentCoworks = coworks.slice(0, 5).map((c) => ({
    id: c.id,
    categorySlug: c.categorySlug,
    categoryLabel: catLabelBySlug.get(c.categorySlug) ?? c.categorySlug,
    title: c.title,
    description: c.description,
    updatedAt: c.updatedAt,
    hasTidyDraft: c.hasTidyDraft,
    materialCount: c.materialCount,
  }));
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <AtlasClient />
      <TodayClient
        totalDocs={totalDocs}
        docsLite={buildLite(allDocs)}
        daily={null}
        recentCoworks={recentCoworks}
        embedded
      />
    </main>
  );
}
