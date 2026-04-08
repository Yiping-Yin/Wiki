import Link from 'next/link';
import { knowledgeCategories, knowledgeTotal } from '../lib/knowledge-nav';
import { chapters } from '../lib/nav';
import { LiveAtlasHero } from '../components/LiveAtlasHero';

export default function Home() {
  const recent = knowledgeCategories.slice(0, 8);
  return (
    <div>
      {/* Hero */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4c1d95 50%, #1e1b4b 100%)',
        color: '#fff', padding: '4rem 2rem 5rem',
        marginBottom: '2.5rem',
      }}>
        <LiveAtlasHero />
        <div style={{ position: 'relative', maxWidth: 900, margin: '0 auto', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.8rem',
            }}>📚</div>
            <div>
              <div style={{ color: '#c4b5fd', fontSize: '0.85rem', fontWeight: 500 }}>Personal knowledge base</div>
              <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>My Wiki</h1>
            </div>
          </div>
          <p style={{ color: '#ddd6fe', fontSize: '1.05rem', lineHeight: 1.6, maxWidth: 700, margin: '0 0 1.6rem' }}>
            A unified Notion-style knowledge base over your local notes, course materials,
            and a curated LLM reference library. Built with vector RAG, AI summaries, quizzes,
            persistent notes, and a semantic atlas — all running locally.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              ['📖', `${knowledgeTotal} docs`],
              ['🏷', `${knowledgeCategories.length} categories`],
              ['🤖', `${chapters.length} LLM chapters`],
              ['🗺', 'Semantic atlas'],
              ['🧠', 'AI quiz + notes'],
              ['💬', 'Local Claude RAG'],
            ].map(([icon, label]) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)',
                padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem',
              }}>
                <span>{icon}</span><span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="prose-notion" style={{ paddingTop: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', marginTop: 0 }}>
          <Link href="/today" style={cardStyle}>
            <div style={{ fontSize: '1.5rem' }}>📅</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>Today</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>Daily learning hub</div>
          </Link>
          <Link href="/knowledge" style={cardStyle}>
            <div style={{ fontSize: '1.5rem' }}>📚</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>My Knowledge</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{knowledgeTotal} docs · {knowledgeCategories.length} categories</div>
          </Link>
          <Link href="/atlas" style={cardStyle}>
            <div style={{ fontSize: '1.5rem' }}>🗺</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>Atlas</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>Semantic terrain map</div>
          </Link>
          <Link href="/wiki/llm101n" style={cardStyle}>
            <div style={{ fontSize: '1.5rem' }}>🤖</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>LLM Reference</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{chapters.length} chapters</div>
          </Link>
          <Link href="/graph" style={cardStyle}>
            <div style={{ fontSize: '1.5rem' }}>🕸</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>Graph</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>Force-directed network</div>
          </Link>
          <Link href="/notes" style={cardStyle}>
            <div style={{ fontSize: '1.5rem' }}>📝</div>
            <div style={{ fontWeight: 700, marginTop: 6 }}>My notes</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>Personal annotations</div>
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
          <li>Press <kbd>⌘K</kbd> to search 501 docs</li>
          <li>Press <kbd>?</kbd> for keyboard shortcuts, <kbd>R</kbd> for reading mode</li>
          <li>Click 💬 (bottom-right) to ask Claude about your notes</li>
          <li>Run <code>npm run batch -- --task all --category &lt;slug&gt;</code> to bulk-process a course</li>
        </ul>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: 'block',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1.1rem',
  textDecoration: 'none',
  color: 'var(--fg)',
  background: 'var(--bg)',
  transition: 'border-color 0.15s',
};
