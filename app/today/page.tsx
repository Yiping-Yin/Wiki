import { getAllDocs, getKnowledgeTotal } from '../../lib/knowledge-store';
import { TodayClient } from './TodayClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Today · Loom' };

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

export default async function TodayPage() {
  const [allDocs, knowledgeTotal] = await Promise.all([getAllDocs(), getKnowledgeTotal()]);
  return (
    <TodayClient
      totalDocs={knowledgeTotal}
      docsLite={buildLite(allDocs)}
      daily={null}
    />
  );
}
