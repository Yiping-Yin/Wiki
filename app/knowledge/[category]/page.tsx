import { notFound } from 'next/navigation';
import {
  docsByCategory,
  getCollectionMetadata,
  getSourceLibraryCategories,
} from '../../../lib/knowledge-store';
import {
  folderOverridesFor,
  readKnowledgeOverrides,
  collectionOverrideFor,
} from '../../../lib/knowledge-overrides';
import { coworkRefsByDocId, listCoworksByCategory } from '../../../lib/coworks-store';
import { CategoryLandingClient, type CategoryDocCard } from './CategoryLandingClient';


export async function generateStaticParams() {
  const knowledgeCategories = await getSourceLibraryCategories();
  return knowledgeCategories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const knowledgeCategories = await getSourceLibraryCategories();
  const cat = knowledgeCategories.find((item) => item.slug === category);
  return {
    title: cat ? `${cat.label} · Loom` : 'Sources · Loom',
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

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const knowledgeCategories = await getSourceLibraryCategories();
  const cat = knowledgeCategories.find((c) => c.slug === category);
  if (!cat) notFound();

  const docs = await docsByCategory(category);
  const ingested = await getCollectionMetadata(category);
  const overrides = await readKnowledgeOverrides();
  const collectionOverride = collectionOverrideFor(overrides, category);
  const folderOverrides = folderOverridesFor(overrides, category);

  // Merge ingest-extracted metadata with user overrides. User wins on any
  // field they've corrected; untouched fields fall through to the extraction.
  const collection = ingested || collectionOverride
    ? {
        categorySlug: category,
        ...(ingested ?? {}),
        ...(collectionOverride
          ? {
              ...(collectionOverride.courseName !== undefined
                ? { courseName: collectionOverride.courseName }
                : {}),
              ...(collectionOverride.term !== undefined
                ? { term: collectionOverride.term }
                : {}),
              ...(collectionOverride.teachers !== undefined
                ? { teachers: collectionOverride.teachers }
                : {}),
            }
          : {}),
      }
    : null;

  const coworks = await listCoworksByCategory(category);

  // Inverse lookup of cowork references keyed by doc id. Passed down as
  // plain `{ docId: { id, title }[] }` to keep the client payload small.
  const refsMap = await coworkRefsByDocId();
  const coworkRefs: Record<string, { id: string; title: string }[]> = {};
  for (const doc of docs) {
    const list = refsMap.get(doc.id);
    if (list && list.length > 0) {
      coworkRefs[doc.id] = list.map((c) => ({ id: c.id, title: c.title }));
    }
  }

  return (
    <CategoryLandingClient
      category={cat}
      docs={docs.map(toDocCard)}
      collection={collection}
      folderOverrides={folderOverrides}
      coworks={coworks}
      coworkRefs={coworkRefs}
    />
  );
}
