import Link from 'next/link';
import { knowledgeCategories, knowledgeTotal } from '../lib/knowledge-nav';
import { chapters } from '../lib/nav';

export default function Home() {
  const recent = knowledgeCategories.slice(0, 8);
  return (
    <div className="prose-notion">
      <h1>📚 My Personal Wiki</h1>
      <p style={{ color: 'var(--muted)', fontSize: '1.05rem' }}>
        A unified knowledge base over your local notes, course materials, and a curated LLM reference library.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
        <Link href="/knowledge" style={cardStyle}>
          <div style={{ fontSize: '1.6rem' }}>📚</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>My Knowledge</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            {knowledgeTotal} docs · {knowledgeCategories.length} categories
          </div>
        </Link>
        <Link href="/atlas" style={cardStyle}>
          <div style={{ fontSize: '1.6rem' }}>🗺</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>Atlas</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            Semantic terrain map of every doc
          </div>
        </Link>
        <Link href="/wiki/llm101n" style={cardStyle}>
          <div style={{ fontSize: '1.6rem' }}>🤖</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>LLM Reference</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            {chapters.length} curated chapters on LLMs
          </div>
        </Link>
        <Link href="/graph" style={cardStyle}>
          <div style={{ fontSize: '1.6rem' }}>🕸</div>
          <div style={{ fontWeight: 700, marginTop: 6 }}>Graph</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            Topic dependency network
          </div>
        </Link>
      </div>

      <h2>Categories</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.6rem' }}>
        {recent.map((c) => (
          <Link key={c.slug} href={`/knowledge/${c.slug}`} style={{
            border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem 0.9rem',
            color: 'var(--fg)', textDecoration: 'none',
          }}>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{c.label}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{c.count} docs</div>
          </Link>
        ))}
        {knowledgeCategories.length > 8 && (
          <Link href="/knowledge" style={{
            border: '1px dashed var(--border)', borderRadius: 8, padding: '0.7rem 0.9rem',
            color: 'var(--muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem',
          }}>
            +{knowledgeCategories.length - 8} more →
          </Link>
        )}
      </div>

      <h2>Quick actions</h2>
      <ul>
        <li>Press <kbd>⌘K</kbd> to search across all your knowledge</li>
        <li>Click 💬 (bottom-right) to ask Claude about your notes</li>
        <li>Run <code>npx tsx scripts/ingest-knowledge.ts</code> after adding new files</li>
        <li>Run <code>npx tsx scripts/build-atlas.ts</code> to refresh the semantic map</li>
      </ul>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'block',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1.2rem',
  textDecoration: 'none',
  color: 'var(--fg)',
};
