import Link from 'next/link';
import { notFound } from 'next/navigation';
import { knowledgeCategories } from '../../../lib/knowledge-nav';
import { docsByCategory } from '../../../lib/knowledge';
import { BatchRunner } from '../../../components/BatchRunner';
import { CategoryHero } from '../../../components/CategoryHero';

export function generateStaticParams() {
  return knowledgeCategories.map((c) => ({ category: c.slug }));
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = knowledgeCategories.find((c) => c.slug === category);
  if (!cat) notFound();
  const docs = docsByCategory(category).sort((a, b) => a.title.localeCompare(b.title));

  const batchInput = docs.map((d) => ({
    id: d.id,
    title: d.title,
    href: `/knowledge/${d.categorySlug}/${d.fileSlug}`,
    hasText: d.hasText,
  }));

  return (
    <div className="prose-notion">
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.8rem' }}>
        <Link href="/knowledge">📚 Knowledge</Link>
      </div>

      <CategoryHero
        label={cat.label}
        slug={cat.slug}
        count={docs.length}
        withText={docs.filter((d) => d.hasText).length}
      />
      <h1 style={{ display: 'none' }}>{cat.label}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.6rem', marginTop: '1rem', marginBottom: '1.5rem' }}>
        <BatchRunner
          docs={batchInput}
          endpoint="/api/summarize"
          cachePathTemplate="/knowledge/summaries/{id}.json"
          title="Auto-summarize"
          description="3-bullet summary + key terms"
          icon="✨"
        />
        <BatchRunner
          docs={batchInput}
          endpoint="/api/structure"
          cachePathTemplate="/knowledge/structures/{id}.json"
          title="Auto-structure"
          description="Rewrite as Notion-style Markdown"
          icon="📖"
          concurrency={2}
        />
        <BatchRunner
          docs={batchInput}
          endpoint="/api/quiz"
          cachePathTemplate="/knowledge/quizzes/{id}.json"
          cacheIdTransform="slash-to-underscore"
          title="Auto-quiz"
          description="3 multiple-choice questions per doc"
          icon="🧠"
        />
      </div>

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {docs.map((d) => (
          <li key={d.id} style={{ borderBottom: '1px solid var(--border)', padding: '0.7rem 0' }}>
            <Link href={`/knowledge/${d.categorySlug}/${d.fileSlug}`} style={{ fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none' }}>
              {d.title}
            </Link>
            {d.preview && (
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.4 }}>
                {d.preview.slice(0, 180)}{d.preview.length > 180 ? '…' : ''}
              </div>
            )}
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 3 }}>
              {d.ext.slice(1)} · {(d.size / 1024).toFixed(0)} KB{!d.hasText && ' · binary, no text'}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
