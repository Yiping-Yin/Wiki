import Link from 'next/link';
import { knowledgeCategories, knowledgeTotal } from '../../lib/knowledge-nav';

export const metadata = { title: 'My Knowledge · Personal Wiki' };

export default function KnowledgeHome() {
  return (
    <div className="prose-notion">
      <h1>📚 My Knowledge</h1>
      <p style={{ color: 'var(--muted)' }}>
        {knowledgeTotal} documents organized into {knowledgeCategories.length} categories,
        ingested from your local notes &amp; course materials. Source files are read-only and never modified.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.8rem', marginTop: '1.5rem' }}>
        {knowledgeCategories.map((c) => (
          <Link
            key={c.slug}
            href={`/knowledge/${c.slug}`}
            style={{
              border: '1px solid var(--border)', borderRadius: 10, padding: '1rem',
              textDecoration: 'none', color: 'var(--fg)', display: 'block',
              transition: 'border-color 0.15s',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.label}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>{c.count} document{c.count === 1 ? '' : 's'}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
