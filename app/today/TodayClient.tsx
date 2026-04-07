'use client';
import Link from 'next/link';
import { useHistory } from '../../lib/use-history';

export function TodayClient({ totalDocs }: { totalDocs: number }) {
  const [history, , clear] = useHistory();
  const uniqueViewed = new Set(history.filter((h) => h.id.startsWith('know/')).map((h) => h.id)).size;
  const pct = totalDocs > 0 ? Math.round((uniqueViewed / totalDocs) * 100) : 0;

  return (
    <div>
      <h2>Your progress</h2>
      <div style={{
        margin: '0.6rem 0 1rem', padding: '0.8rem 1rem',
        border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>knowledge docs viewed</span>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{uniqueViewed} / {totalDocs} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.78rem' }}>({pct}%)</span></span>
        </div>
        <div style={{ marginTop: 8, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.4s' }} />
        </div>
      </div>

      {history.length > 0 ? (
        <>
          <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span>Recently viewed</span>
            <button
              onClick={clear}
              style={{
                fontSize: '0.7rem', color: 'var(--muted)', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
              }}
            >clear</button>
          </h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {history.slice(0, 12).map((h) => (
              <li key={h.id + h.viewedAt} style={{ borderBottom: '1px solid var(--border)', padding: '0.5rem 0' }}>
                <Link href={h.href} style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--fg)', textDecoration: 'none' }}>
                  {h.title}
                </Link>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 2 }}>
                  {timeAgo(h.viewedAt)}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem', border: '1px dashed var(--border)', borderRadius: 8 }}>
          No history yet — open any doc and it&apos;ll show here.
        </div>
      )}
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
