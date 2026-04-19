import { notFound } from 'next/navigation';
import { docsByCategory, getSourceLibraryCategories, groupBySubcategory } from '../../../lib/knowledge-store';
import { CategoryLandingClient, type CategoryDocCard, type CategoryGroupCard } from './CategoryLandingClient';

export const dynamic = 'force-dynamic';

export async function generateStaticParams() {
  const knowledgeCategories = await getSourceLibraryCategories();
  return knowledgeCategories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const knowledgeCategories = await getSourceLibraryCategories();
  const cat = knowledgeCategories.find((item) => item.slug === category);
  return {
    title: cat ? `${cat.label} · Atlas` : 'Atlas · Loom',
  };
}

function toDocCard(doc: Awaited<ReturnType<typeof docsByCategory>>[number]): CategoryDocCard {
  return {
    id: doc.id,
    title: doc.title,
    href: `/knowledge/${doc.categorySlug}/${doc.fileSlug}`,
    categorySlug: doc.categorySlug,
    fileSlug: doc.fileSlug,
    ext: doc.ext,
    preview: doc.preview,
    subcategory: doc.subcategory ?? '',
    subOrder: doc.subOrder ?? 9999,
    hasText: doc.hasText,
    size: doc.size,
  };
}

function toGroupCard(group: ReturnType<typeof groupBySubcategory>[number]): CategoryGroupCard {
  return {
    label: group.label,
    order: group.order,
    docs: group.docs.map(toDocCard),
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const knowledgeCategories = await getSourceLibraryCategories();
  const cat = knowledgeCategories.find((c) => c.slug === category);
  if (!cat) notFound();

  const docs = await docsByCategory(category);
  const groups = groupBySubcategory(docs);

  return (
    <CategoryLandingClient
      category={cat}
      docs={docs.map(toDocCard)}
      groups={groups.map(toGroupCard)}
    />
  );
}
