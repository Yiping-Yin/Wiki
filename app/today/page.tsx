import Link from 'next/link';
import { allDocs } from '../../lib/knowledge';
import { knowledgeCategories, knowledgeTotal } from '../../lib/knowledge-nav';
import { TodayClient } from './TodayClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Today · My Wiki' };

function pickDaily() {
  const candidates = allDocs.filter((d) => d.hasText);
  if (candidates.length === 0) return null;
  // deterministic-per-day so refresh shows the same pick
  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const i = seed % candidates.length;
  return candidates[i];
}

export default function TodayPage() {
  const daily = pickDaily();
  const heroDocs = allDocs.slice(0, 0); // populated client-side via history

  return (
    <div className="prose-notion">
      <h1>📅 Today</h1>
      <p style={{ color: 'var(--muted)' }}>
        Your daily entry into the knowledge base. Each day a new document is suggested.
      </p>

      {daily && (
        <div style={{
          margin: '1.5rem 0', padding: '1.2rem 1.4rem',
          border: '1px solid var(--border)', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(168,85,247,0.06))',
        }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>
            ✨ Document of the day
          </div>
          <Link
            href={`/knowledge/${daily.categorySlug}/${daily.fileSlug}`}
            style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--fg)', textDecoration: 'none', display: 'block' }}
          >
            {daily.title}
          </Link>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
            {daily.category} · {daily.ext.slice(1)} · {(daily.size / 1024).toFixed(0)} KB
          </div>
          {daily.preview && (
            <p style={{ fontSize: '0.88rem', marginTop: '0.8rem', lineHeight: 1.55 }}>
              {daily.preview.slice(0, 280)}{daily.preview.length > 280 ? '…' : ''}
            </p>
          )}
        </div>
      )}

      <TodayClient totalDocs={knowledgeTotal} />

      <h2>Browse by category</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
        {knowledgeCategories.map((c) => (
          <Link key={c.slug} href={`/knowledge/${c.slug}`} style={{
            border: '1px solid var(--border)', borderRadius: 8, padding: '0.6rem 0.8rem',
            textDecoration: 'none', color: 'var(--fg)',
          }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.label}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{c.count} docs</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
