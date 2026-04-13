import { notFound } from 'next/navigation';
import { docsByCategory, getKnowledgeCategories, groupBySubcategory } from '../../../lib/knowledge-store';
import { CategoryLandingClient, type CategoryDocCard, type CategoryGroupCard } from './CategoryLandingClient';

export async function generateStaticParams() {
  const knowledgeCategories = await getKnowledgeCategories();
  return knowledgeCategories.map((c) => ({ category: c.slug }));
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
  const knowledgeCategories = await getKnowledgeCategories();
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
