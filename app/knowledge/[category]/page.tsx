import Link from 'next/link';
import { notFound } from 'next/navigation';
import { knowledgeCategories } from '../../../lib/knowledge-nav';
import { docsByCategory } from '../../../lib/knowledge';

export function generateStaticParams() {
  return knowledgeCategories.map((c) => ({ category: c.slug }));
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const cat = knowledgeCategories.find((c) => c.slug === category);
  if (!cat) notFound();
  const docs = docsByCategory(category).sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="prose-notion">
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
        <Link href="/knowledge">📚 Knowledge</Link> ›
      </div>
      <h1>{cat.label}</h1>
      <p style={{ color: 'var(--muted)' }}>{docs.length} documents</p>

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
              {d.ext.slice(1)} · {(d.size / 1024).toFixed(0)} KB
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
