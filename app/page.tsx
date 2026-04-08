import { allDocs } from '../lib/knowledge';
import { knowledgeCategories, knowledgeTotal } from '../lib/knowledge-nav';
import { chapters } from '../lib/nav';
import { HomeClient } from './HomeClient';

export const dynamic = 'force-dynamic';

function pickDaily() {
  const candidates = allDocs.filter((d) => d.hasText);
  if (candidates.length === 0) return null;
  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return candidates[seed % candidates.length];
}

export default function Home() {
  const daily = pickDaily();
  const dailyCard = daily
    ? {
        id: `know/${daily.id}`,
        title: daily.title,
        href: `/knowledge/${daily.categorySlug}/${daily.fileSlug}`,
        category: daily.category,
        preview: daily.preview,
      }
    : null;

  return (
    <HomeClient
      knowledgeTotal={knowledgeTotal}
      categoryCount={knowledgeCategories.length}
      llmCount={chapters.length}
      categories={knowledgeCategories}
      dailyCard={dailyCard}
    />
  );
}
