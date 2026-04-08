import { allDocs } from '../../lib/knowledge';
import { knowledgeCategories } from '../../lib/knowledge-nav';
import { chapters } from '../../lib/nav';
import { BrowseClient } from './BrowseClient';

export const metadata = { title: 'Browse · My Wiki' };

export default function BrowsePage() {
  // Pre-shape data for the client component
  const docsByCategory = knowledgeCategories.map((c) => ({
    ...c,
    docs: allDocs
      .filter((d) => d.categorySlug === c.slug)
      .slice(0, 12)
      .map((d) => ({
        id: d.id,
        title: d.title,
        href: `/knowledge/${d.categorySlug}/${d.fileSlug}`,
        ext: d.ext,
        size: d.size,
        preview: d.preview,
      })),
  }));

  const llmSections = Array.from(new Set(chapters.map((c) => c.section))).map((sec) => ({
    section: sec,
    chapters: chapters.filter((c) => c.section === sec).slice(0, 8),
  }));

  return <BrowseClient categories={docsByCategory} llmSections={llmSections} totalDocs={allDocs.length} />;
}
