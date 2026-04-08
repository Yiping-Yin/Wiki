'use client';
/**
 * /quizzes — Error book
 * Lists every persisted quiz attempt (from useQuizResults), groups by doc,
 * lets you filter weak/all/perfect, and click "Retake" to jump back to
 * the source document where the quiz lives.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuizResults, isWeak, type QuizResult } from '../../lib/use-quiz';

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
      if (!fields?.href || !fields?.title) continue;
      out.push({ id: String(docIds[internal] ?? internal), title: fields.title, href: fields.href, category: fields.category ?? '' });
    }
    _idxCache = out;
    return out;
  } catch { return []; }
}

type Filter = 'all' | 'weak' | 'perfect';

export default function QuizzesPage() {
  const [results, , clear] = useQuizResults();
  const [docs, setDocs] = useState<IndexDoc[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => { loadDocs().then(setDocs); }, []);

  const docsById = useMemo(() => {
    const m = new Map<string, IndexDoc>();
    for (const d of docs) m.set(d.id, d);
    return m;
  }, [docs]);

  const enriched = useMemo(() => {
    return results.map((r) => {
      // r.docId is one of: "wiki/<slug>" or knowledge id "cat__file" (slash-replaced)
      // search-index ids look like: "wiki/<slug>" or "know/<id>"
      const wiki = docsById.get(r.docId);
      const know = docsById.get(`know/${r.docId}`);
      const meta = wiki ?? know ?? null;
      return { ...r, meta };
    });
  }, [results, docsById]);

  const filtered = useMemo(() => {
    if (filter === 'weak') return enriched.filter(isWeak);
    if (filter === 'perfect') return enriched.filter((r) => r.score === r.total);
    return enriched;
  }, [enriched, filter]);

  const totalTaken = results.length;
  const weakCount = results.filter(isWeak).length;
  const perfectCount = results.filter((r) => r.score === r.total && r.total > 0).length;
  const avgPct = totalTaken > 0
    ? Math.round((results.reduce((s, r) => s + r.score / r.total, 0) / totalTaken) * 100)
    : 0;

  return (
    <div className="prose-notion">
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
        <Link href="/">Home</Link>
      </div>
      <h1>🧠 Quizzes</h1>
      <p style={{ color: 'var(--muted)' }}>
        {totalTaken === 0
          ? 'No quizzes taken yet. Open any doc and click "Quiz me".'
          : `Your error book — ${totalTaken} attempt${totalTaken === 1 ? '' : 's'} across the wiki.`}
      </p>

      {totalTaken > 0 && (
        <>
          {/* Stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.7rem', margin: '1.4rem 0',
          }}>
            <Stat label="Taken" value={`${totalTaken}`} />
            <Stat label="Average" value={`${avgPct}%`} highlight={avgPct >= 80 ? '#16a34a' : avgPct >= 66 ? 'var(--accent)' : '#dc2626'} />
            <Stat label="Perfect" value={`${perfectCount}`} highlight="#16a34a" />
            <Stat label="Weak" value={`${weakCount}`} highlight={weakCount > 0 ? '#dc2626' : 'var(--muted)'} />
          </div>

          {/* Filter */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '1rem 0', flexWrap: 'wrap' }}>
            <SegmentedControl
              value={filter}
              onChange={setFilter as any}
              options={[
                { value: 'all', label: `All ${totalTaken}` },
                { value: 'weak', label: `Weak ${weakCount}` },
                { value: 'perfect', label: `Perfect ${perfectCount}` },
              ]}
            />
            <div style={{ flex: 1 }} />
            <button
              onClick={() => { if (confirm('Clear all quiz history?')) clear(); }}
              style={{
                background: 'transparent', border: 'var(--hairline)',
                borderRadius: 'var(--r-1)', padding: '4px 12px',
                fontSize: '0.75rem', color: 'var(--muted)', cursor: 'pointer',
              }}
            >Clear all</button>
          </div>

          {/* List */}
          {filtered.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
              No quizzes match this filter.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {filtered.sort((a, b) => b.attemptedAt - a.attemptedAt).map((r) => {
                const ratio = r.score / r.total;
                const color = ratio >= 0.85 ? '#16a34a' : ratio >= 0.66 ? 'var(--accent)' : '#dc2626';
                const title = r.meta?.title ?? prettifyId(r.docId);
                const href = r.meta?.href ?? '#';
                return (
                  <div
                    key={r.docId + r.attemptedAt}
                    className="card-lift"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      border: 'var(--hairline)', borderRadius: 'var(--r-2)',
                      padding: '0.85rem 1.05rem', background: 'var(--bg-elevated)',
                      boxShadow: 'var(--shadow-1)',
                    }}
                  >
                    {/* Score circle */}
                    <div style={{
                      width: 50, height: 50, borderRadius: '50%',
                      background: `conic-gradient(${color} ${ratio * 360}deg, var(--surface-2) 0)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: 'var(--bg)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.78rem', fontWeight: 700, color,
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {r.score}/{r.total}
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {r.meta?.category && <span>{r.meta.category}</span>}
                        <span>·</span>
                        <span>{timeAgo(r.attemptedAt)}</span>
                        {ratio < 0.67 && <span style={{ color: '#dc2626', fontWeight: 600 }}>· needs review</span>}
                      </div>
                    </div>

                    {r.meta && (
                      <Link
                        href={href}
                        style={{
                          background: 'var(--accent)', color: '#fff',
                          border: 0, borderRadius: 'var(--r-1)',
                          padding: '6px 14px', fontSize: '0.78rem', fontWeight: 600,
                          textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                        }}
                      >Retake →</Link>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div style={{
      padding: '0.85rem 1rem',
      border: 'var(--hairline)', borderRadius: 'var(--r-2)',
      background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
    }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: highlight ?? 'var(--fg)', marginTop: 2, fontFamily: 'var(--display)', letterSpacing: '-0.018em' }}>{value}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <div style={{
      display: 'inline-flex', background: 'var(--surface-2)',
      borderRadius: 'var(--r-1)', padding: 2, border: 'var(--hairline)',
    }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            background: value === o.value ? 'var(--bg)' : 'transparent',
            color: value === o.value ? 'var(--fg)' : 'var(--muted)',
            border: 0, padding: '4px 12px', borderRadius: 6,
            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
            boxShadow: value === o.value ? 'var(--shadow-1)' : 'none',
            transition: 'all 0.2s var(--ease)',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

function prettifyId(id: string): string {
  return id.replace(/^wiki\//, '').replace(/^.*__/, '').replace(/-/g, ' ');
}
function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
