'use client';
/**
 * Mission Control home — answers "what should I do right now?".
 *
 * Sections (top → bottom):
 *   1. Compact greeting hero (gradient, no atlas overlay)
 *   2. Continue reading (last 5 viewed, horizontal row)
 *   3. Pinned ★ (if any)
 *   4. Quick actions (Today / Browse / Notes / LLM)
 *   5. Today's discovery (random doc)
 *   6. Categories (collapsed grid at bottom)
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../lib/use-history';
import { usePins } from '../lib/use-pins';
import { useNotedIds } from '../lib/use-notes';
import { useQuizResults } from '../lib/use-quiz';

type IndexDoc = { id: string; title: string; href: string; category: string };
type Category = { slug: string; label: string; count: number };
type DailyCard = { id: string; title: string; href: string; category: string; preview: string };

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

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

const FILE_ICON: Record<string, { icon: string; color: string }> = {
  '.pdf':  { icon: '📄', color: '#dc2626' },
  '.docx': { icon: '📝', color: '#2563eb' },
  '.pptx': { icon: '📊', color: '#ea580c' },
  '.csv':  { icon: '📊', color: '#16a34a' },
  '.json': { icon: '📋', color: '#7c3aed' },
  '.ipynb':{ icon: '📓', color: '#f59e0b' },
  '.md':   { icon: '📃', color: '#0ea5e9' },
  '.txt':  { icon: '📃', color: '#6b7280' },
};
const wikiArt = { icon: '📖', color: '#0071e3' };
const fileArt = (href: string) => {
  if (href.startsWith('/wiki/')) return wikiArt;
  const m = href.match(/\.[a-z]+$/);
  return (m && FILE_ICON[m[0]]) ?? { icon: '📄', color: '#6b7280' };
};

export function HomeClient({
  knowledgeTotal, categoryCount, llmCount, categories, dailyCard,
}: {
  knowledgeTotal: number;
  categoryCount: number;
  llmCount: number;
  categories: Category[];
  dailyCard: DailyCard | null;
}) {
  const [history] = useHistory();
  const { pins } = usePins();
  const notedIds = useNotedIds();
  const [quizResults] = useQuizResults();
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

  // Continue reading: last 6 unique
  const continueRow = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; title: string; href: string; category: string }[] = [];
    for (const h of history) {
      if (seen.has(h.id) || out.length >= 6) continue;
      seen.add(h.id);
      const meta = docsById.get(h.id);
      out.push({
        id: h.id,
        title: meta?.title ?? h.title,
        href: meta?.href ?? h.href,
        category: meta?.category ?? '',
      });
    }
    return out;
  }, [history, docsById]);

  return (
    <div>
      {/* Compact greeting hero — clean gradient, no atlas overlay */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0071e3 0%, #5856d6 50%, #af52de 100%)',
        color: '#fff',
        padding: '3rem 2.5rem 2.6rem',
      }}>
        {/* Subtle radial highlight */}
        <div aria-hidden style={{
          position: 'absolute', top: -100, right: -100, width: 380, height: 380,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.18), transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ maxWidth: 1100, margin: '0 auto', position: 'relative' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85, fontWeight: 600, marginBottom: 6 }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 style={{
            margin: 0, fontSize: '2.8rem', fontWeight: 700, color: '#fff',
            letterSpacing: '-0.028em', lineHeight: 1.05, fontFamily: 'var(--display)',
            border: 0, padding: 0,
          }}>
            {greeting()}.
          </h1>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1.4rem', flexWrap: 'wrap', fontSize: '0.88rem', opacity: 0.92 }}>
            <span><strong style={{ color: '#fff' }}>{streak}</strong> day streak {streak >= 3 ? '🔥' : ''}</span>
            <span><strong style={{ color: '#fff' }}>{knowledgeTotal + llmCount}</strong> docs available</span>
            <span><strong style={{ color: '#fff' }}>{notedIds.length}</strong> notes</span>
            <span><strong style={{ color: '#fff' }}>{quizResults.length}</strong> quizzes</span>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem 8rem' }}>
        {/* Continue reading */}
        {continueRow.length > 0 && (
          <Section title="Continue reading" subtitle="Pick up where you left off">
            <ScrollRow>
              {continueRow.map((d) => <DocCard key={d.id} title={d.title} href={d.href} category={d.category} />)}
            </ScrollRow>
          </Section>
        )}

        {/* Pinned */}
        {pins.length > 0 && (
          <Section title="★ Pinned" subtitle={`${pins.length} starred docs`}>
            <ScrollRow>
              {pins.map((p) => (
                <DocCard
                  key={p.id}
                  title={p.title}
                  href={p.href}
                  category={docsById.get(p.id)?.category ?? ''}
                  starred
                />
              ))}
            </ScrollRow>
          </Section>
        )}

        {/* Quick actions */}
        <Section title="Quick actions">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
            <ActionCard href="/today" icon="📅" title="Today" subtitle="Daily learning hub" />
            <ActionCard href="/browse" icon="🧭" title="Browse" subtitle="Discover by category" />
            <ActionCard href="/notes" icon="📝" title="Notes" subtitle={`${notedIds.length} written`} />
            <ActionCard href="/quizzes" icon="🧠" title="Quizzes" subtitle={`${quizResults.length} taken`} />
            <ActionCard href="/uploads" icon="📥" title="Uploads" subtitle="Drag any file in" />
            <ActionCard href="/wiki/llm101n" icon="🤖" title="LLM Reference" subtitle={`${llmCount} chapters`} />
          </div>
        </Section>

        {/* Today's discovery */}
        {dailyCard && (
          <Section title="✨ Today's discovery">
            <Link
              href={dailyCard.href}
              className="card-lift"
              style={{
                display: 'block',
                padding: '1.4rem 1.6rem',
                border: 'var(--hairline)', borderRadius: 'var(--r-3)',
                background: 'linear-gradient(135deg, rgba(0,113,227,0.06), rgba(168,85,247,0.06))',
                boxShadow: 'var(--shadow-1)',
                textDecoration: 'none', color: 'var(--fg)',
              }}
            >
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>
                {dailyCard.category}
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--display)', letterSpacing: '-0.018em' }}>
                {dailyCard.title}
              </div>
              {dailyCard.preview && (
                <p style={{ fontSize: '0.88rem', marginTop: '0.7rem', lineHeight: 1.55, color: 'var(--fg)' }}>
                  {dailyCard.preview.slice(0, 240)}{dailyCard.preview.length > 240 ? '…' : ''}
                </p>
              )}
            </Link>
          </Section>
        )}

        {/* Categories */}
        <Section title="Categories" subtitle={`${categoryCount} collections`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.6rem' }}>
            {categories.slice(0, 12).map((c) => (
              <Link key={c.slug} href={`/knowledge/${c.slug}`} className="card-lift" style={{
                border: 'var(--hairline)', borderRadius: 'var(--r-2)', padding: '0.75rem 0.95rem',
                color: 'var(--fg)', textDecoration: 'none',
                background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
              }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.label}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{c.count} docs</div>
              </Link>
            ))}
            {categories.length > 12 && (
              <Link href="/knowledge" className="card-lift" style={{
                border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-2)',
                padding: '0.75rem 0.95rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--muted)', textDecoration: 'none', fontSize: '0.82rem',
              }}>
                +{categories.length - 12} more →
              </Link>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '2.4rem' }}>
      <div style={{ marginBottom: '0.85rem' }}>
        <h2 style={{
          margin: 0, fontSize: '1.3rem', fontWeight: 700,
          fontFamily: 'var(--display)', letterSpacing: '-0.018em',
          padding: 0, border: 0, color: 'var(--fg)',
        }}>{title}</h2>
        {subtitle && <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function ScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="browse-row" style={{
      display: 'flex', gap: '0.8rem', overflowX: 'auto',
      paddingBottom: 6,
      scrollSnapType: 'x mandatory', scrollbarWidth: 'thin',
    }}>{children}</div>
  );
}

function DocCard({ title, href, category, starred }: { title: string; href: string; category: string; starred?: boolean }) {
  const art = fileArt(href);
  return (
    <Link
      href={href}
      className="card-lift"
      style={{
        display: 'block', flexShrink: 0, width: 200,
        border: 'var(--hairline)', borderRadius: 'var(--r-3)',
        background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
        textDecoration: 'none', color: 'var(--fg)',
        overflow: 'hidden', scrollSnapAlign: 'start',
      }}
    >
      <div style={{
        height: 84,
        background: `linear-gradient(135deg, ${art.color}22, ${art.color}08)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2rem', position: 'relative',
      }}>
        {art.icon}
        {starred && (
          <span style={{ position: 'absolute', top: 6, right: 8, color: '#f59e0b', fontSize: '0.85rem' }}>★</span>
        )}
      </div>
      <div style={{ padding: '0.65rem 0.85rem' }}>
        <div style={{
          fontWeight: 600, fontSize: '0.84rem', lineHeight: 1.32,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          minHeight: '2.2em',
        }}>
          {title}
        </div>
        {category && (
          <div style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {category}
          </div>
        )}
      </div>
    </Link>
  );
}

function ActionCard({ href, icon, title, subtitle }: { href: string; icon: string; title: string; subtitle: string }) {
  return (
    <Link href={href} className="card-lift" style={{
      display: 'block', padding: '1.05rem 1.15rem',
      border: 'var(--hairline)', borderRadius: 'var(--r-3)',
      background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
      textDecoration: 'none', color: 'var(--fg)',
    }}>
      <div style={{ fontSize: '1.4rem' }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: '0.92rem', marginTop: 6, fontFamily: 'var(--display)', letterSpacing: '-0.012em' }}>{title}</div>
      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>
    </Link>
  );
}
