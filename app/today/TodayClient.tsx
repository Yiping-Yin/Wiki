'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useHistory } from '../../lib/use-history';
import { useQuizResults, isWeak } from '../../lib/use-quiz';

export function TodayClient({ totalDocs }: { totalDocs: number }) {
  const [history, , clear] = useHistory();
  const [quizResults] = useQuizResults();

  const uniqueViewed = new Set(history.filter((h) => h.id.startsWith('know/')).map((h) => h.id)).size;
  const pct = totalDocs > 0 ? Math.round((uniqueViewed / totalDocs) * 100) : 0;

  // simple streak: number of distinct UTC days with at least one view, going backwards from today
  const streak = useMemo(() => {
    if (history.length === 0) return 0;
    const days = new Set(history.map((h) => Math.floor(h.viewedAt / 86400000)));
    let s = 0;
    let day = Math.floor(Date.now() / 86400000);
    while (days.has(day)) { s++; day--; }
    return s;
  }, [history]);

  const totalQuizzes = quizResults.length;
  const avgScore = totalQuizzes > 0
    ? Math.round((quizResults.reduce((s, r) => s + r.score / r.total, 0) / totalQuizzes) * 100)
    : 0;
  const weakSpots = quizResults.filter(isWeak);
  const recentQuizzes = quizResults.slice(0, 5);

  return (
    <div>
      <h2>Your progress</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem', margin: '0.6rem 0 1.2rem' }}>
        <Stat label="Docs viewed" value={`${uniqueViewed} / ${totalDocs}`} sub={`${pct}%`} />
        <Stat label="Streak" value={`${streak}`} sub={streak === 1 ? 'day' : 'days'} />
        <Stat label="Quizzes taken" value={`${totalQuizzes}`} sub={totalQuizzes > 0 ? `avg ${avgScore}%` : '—'} />
        <Stat label="Weak spots" value={`${weakSpots.length}`} sub={weakSpots.length > 0 ? 'need review' : 'none'} highlight={weakSpots.length > 0 ? '#dc2626' : undefined} />
      </div>

      <div style={{ marginBottom: '1rem', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.4s' }} />
      </div>

      {weakSpots.length > 0 && (
        <>
          <h2>📌 Review weak spots</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {weakSpots.slice(0, 6).map((w) => (
              <li key={w.docId} style={{ borderBottom: '1px solid var(--border)', padding: '0.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--fg)' }}>{prettifyDocId(w.docId)}</span>
                <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                  {w.score}/{w.total} · {timeAgo(w.attemptedAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {recentQuizzes.length > 0 && (
        <>
          <h2>🧠 Recent quizzes</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {recentQuizzes.map((r) => {
              const ratio = r.score / r.total;
              const color = ratio >= 0.85 ? '#16a34a' : ratio >= 0.66 ? 'var(--accent)' : '#dc2626';
              return (
                <li key={r.docId + r.attemptedAt} style={{ borderBottom: '1px solid var(--border)', padding: '0.5rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '0.85rem' }}>{prettifyDocId(r.docId)}</span>
                  <span style={{ fontSize: '0.78rem', color, fontWeight: 600 }}>
                    {r.score}/{r.total} · {timeAgo(r.attemptedAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

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
            {history.slice(0, 10).map((h) => (
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

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: string }) {
  return (
    <div style={{
      padding: '0.7rem 0.9rem',
      border: '1px solid var(--border)', borderRadius: 8,
    }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 700, color: highlight ?? 'var(--fg)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );
}

function prettifyDocId(id: string): string {
  return id.replace(/^wiki\//, 'wiki · ').replace(/^.*__/, '').replace(/-/g, ' ');
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
