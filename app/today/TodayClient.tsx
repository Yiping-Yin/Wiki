'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../../lib/use-history';
import { useQuizResults, isWeak } from '../../lib/use-quiz';
import { useNotedIds } from '../../lib/use-notes';
import { usePins } from '../../lib/use-pins';

type IndexDoc = { id: string; title: string; href: string; category: string };

let _idxCache: IndexDoc[] | null = null;
async function loadDocs(): Promise<IndexDoc[]> {
  if (_idxCache) return _idxCache;
  try {
    const r = await fetch('/search-index.json');
    if (!r.ok) return [];
    const payload = await r.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const out: IndexDoc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      out.push({ id: String(docIds[internal] ?? internal), title: fields.title, href: fields.href, category: fields.category ?? '' });
    }
    _idxCache = out;
    return out;
  } catch { return []; }
}

const DAY_MS = 86400000;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TodayClient({ totalDocs }: { totalDocs: number }) {
  const [history] = useHistory();
  const [quizResults] = useQuizResults();
  const notedIds = useNotedIds();
  const { pins, unpin } = usePins();
  const [docs, setDocs] = useState<IndexDoc[]>([]);

  useEffect(() => { loadDocs().then(setDocs); }, []);

  const docsById = useMemo(() => {
    const m = new Map<string, IndexDoc>();
    for (const d of docs) m.set(d.id, d);
    return m;
  }, [docs]);

  // Streak
  const streak = useMemo(() => {
    if (history.length === 0) return 0;
    const days = new Set(history.map((h) => Math.floor(h.viewedAt / DAY_MS)));
    let s = 0;
    let day = Math.floor(Date.now() / DAY_MS);
    while (days.has(day)) { s++; day--; }
    return s;
  }, [history]);

  // 30-day activity heatmap
  const heatmap = useMemo(() => {
    const today = Math.floor(Date.now() / DAY_MS);
    const cells: { day: number; count: number }[] = [];
    const counts = new Map<number, number>();
    for (const h of history) {
      const d = Math.floor(h.viewedAt / DAY_MS);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    for (let i = 29; i >= 0; i--) {
      const day = today - i;
      cells.push({ day, count: counts.get(day) ?? 0 });
    }
    return cells;
  }, [history]);

  // Continue reading: last viewed doc
  const lastViewed = history[0];
  const lastViewedMeta = lastViewed
    ? (docsById.get(lastViewed.id) ?? null)
    : null;

  // Spaced repetition: weakest 3 quizzes
  const weakSpots = useMemo(
    () => quizResults.filter(isWeak).sort((a, b) => a.score / a.total - b.score / b.total).slice(0, 3),
    [quizResults],
  );

  // Recent notes (top 4)
  const recentNotes = notedIds.slice(0, 4).map((id) => {
    const wiki = docsById.get(id);
    const know = docsById.get(id);
    return { id, meta: wiki ?? know };
  });

  // Stats
  const uniqueViewed = new Set(history.filter((h) => h.id.startsWith('know/')).map((h) => h.id)).size;
  const pct = totalDocs > 0 ? Math.round((uniqueViewed / totalDocs) * 100) : 0;

  return (
    <div>
      {/* Greeting hero */}
      <div style={{
        marginBottom: '1.6rem', padding: '1.4rem 1.6rem',
        borderRadius: 'var(--r-3)',
        background: 'linear-gradient(135deg, var(--accent), #5856d6)',
        color: '#fff', boxShadow: 'var(--shadow-2)',
      }}>
        <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85, fontWeight: 600, marginBottom: 4 }}>
          {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <h1 style={{
          margin: 0, fontSize: '2rem', fontWeight: 700, color: '#fff',
          letterSpacing: '-0.025em', lineHeight: 1.15, fontFamily: 'var(--display)',
          padding: 0, border: 0,
        }}>
          {greeting()}.
        </h1>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '1.4rem', flexWrap: 'wrap', fontSize: '0.85rem', opacity: 0.92 }}>
          <span><strong style={{ color: '#fff' }}>{streak}</strong> day streak {streak >= 3 ? '🔥' : ''}</span>
          <span><strong style={{ color: '#fff' }}>{uniqueViewed}/{totalDocs}</strong> docs ({pct}%)</span>
          <span><strong style={{ color: '#fff' }}>{quizResults.length}</strong> quizzes</span>
          <span><strong style={{ color: '#fff' }}>{notedIds.length}</strong> notes</span>
        </div>
      </div>

      <AmbientRecs
        recent={history.slice(0, 5).map((h) => ({ title: docsById.get(h.id)?.title ?? h.title }))}
        weak={quizResults.filter(isWeak).slice(0, 4).map((w) => ({ title: docsById.get(w.docId)?.title ?? w.docId, score: w.score, total: w.total }))}
        noted={notedIds.slice(0, 4).map((id) => ({ title: docsById.get(id)?.title ?? id }))}
      />

      {/* Pinned docs */}
      {pins.length > 0 && (
        <Section title="Pinned" subtitle={`${pins.length} starred`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {pins.slice(0, 6).map((p) => (
              <div
                key={p.id}
                className="card-lift"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.75rem 0.95rem',
                  border: 'var(--hairline)', borderRadius: 'var(--r-2)',
                  background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
                  position: 'relative',
                }}
              >
                <span style={{ color: '#f59e0b', fontSize: '1.05rem', flexShrink: 0 }}>★</span>
                <Link
                  href={p.href}
                  style={{
                    flex: 1, minWidth: 0,
                    fontSize: '0.85rem', fontWeight: 600,
                    color: 'var(--fg)', textDecoration: 'none',
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    lineHeight: 1.3,
                  }}
                >
                  {p.title}
                </Link>
                <button
                  onClick={() => unpin(p.id)}
                  title="Unpin"
                  style={{
                    background: 'transparent', border: 0, cursor: 'pointer',
                    color: 'var(--muted)', fontSize: '0.85rem',
                    padding: '0 4px', flexShrink: 0,
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Activity heatmap */}
      <Section title="Last 30 days">
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(30, 1fr)', gap: 4,
          padding: '0.8rem', border: 'var(--hairline)', borderRadius: 'var(--r-2)',
          background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
        }}>
          {heatmap.map((c, i) => {
            const intensity = Math.min(1, c.count / 6);
            const date = new Date(c.day * DAY_MS);
            return (
              <div
                key={i}
                title={`${date.toLocaleDateString()}: ${c.count} views`}
                style={{
                  aspectRatio: '1/1',
                  background: c.count === 0
                    ? 'var(--surface-2)'
                    : `rgba(0, 113, 227, ${0.25 + intensity * 0.75})`,
                  borderRadius: 3,
                }}
              />
            );
          })}
        </div>
      </Section>

      {/* Continue reading */}
      {lastViewed && (
        <Section title="Continue reading">
          <Link
            href={lastViewed.href}
            className="card-lift"
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '1rem 1.2rem',
              border: 'var(--hairline)', borderRadius: 'var(--r-2)',
              background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
              textDecoration: 'none', color: 'var(--fg)',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--r-2)',
              background: 'linear-gradient(135deg, var(--accent), #5856d6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem', flexShrink: 0,
            }}>📖</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                {timeAgo(lastViewed.viewedAt)}
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {lastViewedMeta?.title ?? lastViewed.title}
              </div>
              {lastViewedMeta?.category && (
                <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{lastViewedMeta.category}</div>
              )}
            </div>
            <span style={{ color: 'var(--muted)' }}>→</span>
          </Link>
        </Section>
      )}

      {/* Spaced repetition */}
      {weakSpots.length > 0 && (
        <Section title="Review weak spots" subtitle="Quiz scores below 67%">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {weakSpots.map((w) => {
              const meta = docsById.get(w.docId) ?? docsById.get(`know/${w.docId}`);
              return (
                <Link
                  key={w.docId}
                  href={meta?.href ?? '#'}
                  className="card-lift"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '0.7rem 1rem',
                    border: 'var(--hairline)', borderRadius: 'var(--r-2)',
                    background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
                    textDecoration: 'none', color: 'var(--fg)',
                  }}
                >
                  <span style={{
                    background: '#dc2626', color: '#fff',
                    fontSize: '0.7rem', padding: '3px 8px',
                    borderRadius: 999, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  }}>{w.score}/{w.total}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meta?.title ?? w.docId}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{timeAgo(w.attemptedAt)}</div>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--accent)', fontWeight: 600 }}>Retake →</span>
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      {/* Recent notes */}
      {recentNotes.length > 0 && (
        <Section title="Recent notes">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {recentNotes.filter((n) => n.meta).slice(0, 4).map((n) => (
              <Link
                key={n.id}
                href={n.meta!.href}
                className="card-lift"
                style={{
                  display: 'block',
                  padding: '0.75rem 0.9rem',
                  border: 'var(--hairline)', borderRadius: 'var(--r-2)',
                  background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
                  textDecoration: 'none', color: 'var(--fg)',
                }}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 3 }}>📝 noted</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {n.meta!.title}
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Recent activity */}
      {history.length > 0 && (
        <Section title="Recently viewed">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {history.slice(0, 8).map((h) => (
              <li key={h.id + h.viewedAt} style={{ borderBottom: 'var(--hairline)', padding: '0.5rem 0' }}>
                <Link href={h.href} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', textDecoration: 'none', color: 'var(--fg)' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {h.title}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 8, flexShrink: 0 }}>
                    {timeAgo(h.viewedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function AmbientRecs({
  recent, weak, noted,
}: {
  recent: { title: string }[];
  weak: { title: string; score: number; total: number }[];
  noted: { title: string }[];
}) {
  const [items, setItems] = useState<{ title: string; why: string; action: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasInput, setHasInput] = useState(false);

  useEffect(() => {
    setHasInput(recent.length > 0 || weak.length > 0 || noted.length > 0);
  }, [recent, weak, noted]);

  useEffect(() => {
    if (!hasInput) return;
    const dayKey = `wiki:recs:${new Date().toISOString().slice(0, 10)}`;
    try {
      const cached = localStorage.getItem(dayKey);
      if (cached) {
        setItems(JSON.parse(cached));
        return;
      }
    } catch {}
    let cancelled = false;
    setLoading(true);
    fetch('/api/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recent, weak, noted }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (cancelled || !j?.items) return;
        setItems(j.items);
        try { localStorage.setItem(dayKey, JSON.stringify(j.items)); } catch {}
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hasInput]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hasInput) return null;
  if (!loading && (!items || items.length === 0)) return null;

  return (
    <Section title="✦ Today's focus" subtitle="AI-generated based on your recent activity">
      {loading && !items && (
        <div style={{
          padding: '1rem 1.2rem',
          border: 'var(--hairline)', borderRadius: 'var(--r-2)',
          background: 'linear-gradient(135deg, rgba(0,113,227,0.06), rgba(168,85,247,0.06))',
          fontSize: '0.85rem', color: 'var(--muted)',
        }}>
          ✦ Asking Claude what you should focus on today…
        </div>
      )}
      {items && items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          {items.map((it, i) => (
            <div
              key={i}
              className="card-lift"
              style={{
                padding: '0.95rem 1.1rem',
                border: 'var(--hairline)', borderRadius: 'var(--r-2)',
                background: 'linear-gradient(135deg, rgba(0,113,227,0.05), rgba(168,85,247,0.04))',
                boxShadow: 'var(--shadow-1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ color: 'var(--accent)', fontSize: '0.85rem' }}>✦</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, fontFamily: 'var(--display)', letterSpacing: '-0.012em' }}>
                  {it.title}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5, marginBottom: 7 }}>
                {it.why}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600 }}>
                → {it.action}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ marginBottom: '0.7rem' }}>
        <h2 style={{
          margin: 0, fontSize: '1.05rem', fontWeight: 700,
          fontFamily: 'var(--display)', letterSpacing: '-0.012em',
          padding: 0, border: 0,
        }}>{title}</h2>
        {subtitle && <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
