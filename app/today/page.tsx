import Link from 'next/link';
import { allDocs } from '../../lib/knowledge';
import { knowledgeTotal } from '../../lib/knowledge-nav';
import { TodayClient } from './TodayClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Today · My Wiki' };

function pickDaily() {
  const candidates = allDocs.filter((d) => d.hasText);
  if (candidates.length === 0) return null;
  const seed = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return candidates[seed % candidates.length];
}

export default function TodayPage() {
  const daily = pickDaily();

  return (
    <div className="prose-notion">
      <TodayClient totalDocs={knowledgeTotal} />

      {daily && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{
            margin: '0 0 0.7rem', fontSize: '1.05rem', fontWeight: 700,
            fontFamily: 'var(--display)', letterSpacing: '-0.012em',
            padding: 0, border: 0,
          }}>Discovery</h2>
          <Link
            href={`/knowledge/${daily.categorySlug}/${daily.fileSlug}`}
            className="card-lift"
            style={{
              display: 'block',
              padding: '1.2rem 1.4rem',
              border: 'var(--hairline)', borderRadius: 'var(--r-3)',
              background: 'linear-gradient(135deg, rgba(0,113,227,0.06), rgba(168,85,247,0.06))',
              boxShadow: 'var(--shadow-1)',
              textDecoration: 'none', color: 'var(--fg)',
            }}
          >
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>
              ✨ Document of the day
            </div>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--display)', letterSpacing: '-0.018em' }}>
              {daily.title}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
              {daily.category} · {daily.ext.slice(1)} · {(daily.size / 1024).toFixed(0)} KB
            </div>
            {daily.preview && (
              <p style={{ fontSize: '0.88rem', marginTop: '0.8rem', lineHeight: 1.55, color: 'var(--fg)' }}>
                {daily.preview.slice(0, 240)}{daily.preview.length > 240 ? '…' : ''}
              </p>
            )}
          </Link>
        </div>
      )}
    </div>
  );
}
