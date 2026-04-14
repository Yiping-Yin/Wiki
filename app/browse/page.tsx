import { getAllDocs, getKnowledgeCategories } from '../../lib/knowledge-store';
import { chapters } from '../../lib/nav';
import { BrowseClient } from './BrowseClient';

export const metadata = { title: 'Reference · Loom' };

export default async function BrowsePage() {
  const [allDocs, knowledgeCategories] = await Promise.all([getAllDocs(), getKnowledgeCategories()]);
  // Pre-shape data for the client component.
  // Sort by subOrder so the row reads Week 0 → Week N naturally.
  const docsByCategory = knowledgeCategories.map((c) => ({
    ...c,
    docs: allDocs
      .filter((d) => d.categorySlug === c.slug)
      .sort((a, b) => (a.subOrder ?? 9999) - (b.subOrder ?? 9999))
      .slice(0, 14)
      .map((d) => ({
        id: d.id,
        title: d.title,
        href: `/knowledge/${d.categorySlug}/${d.fileSlug}`,
        ext: d.ext,
        size: d.size,
        preview: d.preview,
        subcategory: d.subcategory ?? '',
      })),
  }));

  const llmSections = Array.from(new Set(chapters.map((c) => c.section))).map((sec) => ({
    section: sec,
    chapters: chapters.filter((c) => c.section === sec).slice(0, 8),
  }));

  return <BrowseClient categories={docsByCategory} llmSections={llmSections} />;
}
