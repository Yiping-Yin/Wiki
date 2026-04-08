'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { useHistory } from '../../lib/use-history';

type DocCard = {
  id: string; title: string; href: string; ext: string; size: number; preview: string;
};
type Category = { slug: string; label: string; count: number; docs: DocCard[] };
type LLMSection = { section: string; chapters: { slug: string; title: string }[] };

const TYPE_META: Record<string, { icon: string; color: string }> = {
  '.pdf':  { icon: '📄', color: '#dc2626' },
  '.docx': { icon: '📝', color: '#2563eb' },
  '.doc':  { icon: '📝', color: '#2563eb' },
  '.pptx': { icon: '📊', color: '#ea580c' },
  '.ppt':  { icon: '📊', color: '#ea580c' },
  '.xlsx': { icon: '📈', color: '#16a34a' },
  '.csv':  { icon: '📊', color: '#16a34a' },
  '.json': { icon: '📋', color: '#7c3aed' },
  '.ipynb':{ icon: '📓', color: '#f59e0b' },
  '.md':   { icon: '📃', color: '#0ea5e9' },
  '.txt':  { icon: '📃', color: '#6b7280' },
};
const metaOf = (ext: string) => TYPE_META[ext.toLowerCase()] ?? { icon: '📄', color: '#6b7280' };

const SECTION_COLOR: Record<string, [string, string]> = {
  Foundations: ['#f97316', '#7c2d12'],
  Transformer: ['#a855f7', '#581c87'],
  Architecture:['#06b6d4', '#164e63'],
  Training:    ['#10b981', '#064e3b'],
  Inference:   ['#7c3aed', '#3730a3'],
  Finetuning:  ['#ec4899', '#831843'],
  Data:        ['#0ea5e9', '#0c4a6e'],
  Agents:      ['#f59e0b', '#78350f'],
  Evaluation:  ['#84cc16', '#365314'],
  Frontier:    ['#a78bfa', '#4c1d95'],
  Safety:      ['#dc2626', '#7f1d1d'],
  Start:       ['#0071e3', '#1e1b4b'],
};

export function BrowseClient({
  categories, llmSections, totalDocs,
}: {
  categories: Category[];
  llmSections: LLMSection[];
  totalDocs: number;
}) {
  const [history] = useHistory();

  // Recently viewed (any source)
  const recentlyViewed = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; title: string; href: string; ext: string; size: number; preview: string }[] = [];
    for (const h of history) {
      if (seen.has(h.id)) continue;
      seen.add(h.id);
      // try to find in knowledge first
      let d: any = null;
      for (const cat of categories) {
        d = cat.docs.find((x) => `know/${x.id}` === h.id);
        if (d) break;
      }
      if (d) out.push(d);
      else out.push({ id: h.id, title: h.title, href: h.href, ext: h.id.startsWith('wiki') ? '.mdx' : '.pdf', size: 0, preview: '' });
      if (out.length >= 12) break;
    }
    return out;
  }, [history, categories]);

  const totalViewed = useMemo(() => {
    return new Set(history.map((h) => h.id)).size;
  }, [history]);

  return (
    <div>
      {/* Hero */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(135deg, #0071e3 0%, #5856d6 50%, #af52de 100%)',
        color: '#fff',
        padding: '3rem 2.5rem 2.5rem',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.85, marginBottom: 6, fontWeight: 600 }}>
            Browse
          </div>
          <h1 style={{
            margin: 0, fontSize: '2.6rem', fontWeight: 700,
            letterSpacing: '-0.028em', lineHeight: 1.1,
            fontFamily: 'var(--display)',
          }}>
            Your knowledge, explored
          </h1>
          <div style={{ marginTop: '1rem', fontSize: '0.92rem', opacity: 0.92, display: 'flex', gap: '1.4rem', flexWrap: 'wrap' }}>
            <span><strong>{totalDocs}</strong> documents</span>
            <span><strong>{categories.length}</strong> categories</span>
            <span><strong>{totalViewed}</strong> visited</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 2rem 5rem' }}>
        {/* Recently viewed row */}
        {recentlyViewed.length > 0 && (
          <Row title="Recently viewed" subtitle="Pick up where you left off">
            {recentlyViewed.map((d) => <DocCardSmall key={d.id} doc={d} />)}
          </Row>
        )}

        {/* Categories — each gets a row */}
        {categories.filter((c) => c.docs.length > 0).map((cat) => (
          <Row
            key={cat.slug}
            title={cat.label}
            subtitle={`${cat.count} docs`}
            link={`/knowledge/${cat.slug}`}
          >
            {cat.docs.map((d) => <DocCardSmall key={d.id} doc={d} />)}
          </Row>
        ))}

        {/* LLM Reference sections */}
        <div style={{ marginTop: '3rem' }}>
          <h2 style={{
            margin: '0 0 0.4rem', fontSize: '1.4rem', fontWeight: 700,
            letterSpacing: '-0.018em', fontFamily: 'var(--display)',
          }}>LLM Reference</h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--muted)', marginBottom: '1.2rem' }}>
            Curated chapters covering the modern LLM stack
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.85rem',
          }}>
            {llmSections.map((s) => {
              const [c1, c2] = SECTION_COLOR[s.section] ?? ['#0071e3', '#1e1b4b'];
              return (
                <Link
                  key={s.section}
                  href={`/wiki/${s.chapters[0]?.slug ?? 'llm101n'}`}
                  className="card-lift"
                  style={{
                    display: 'block', borderRadius: 'var(--r-3)',
                    background: `linear-gradient(135deg, ${c1}, ${c2})`,
                    color: '#fff', padding: '1.2rem',
                    textDecoration: 'none', boxShadow: 'var(--shadow-2)',
                    minHeight: 130,
                  }}
                >
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.8, fontWeight: 700 }}>
                    {s.chapters.length} chapters
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: 6, fontFamily: 'var(--display)', letterSpacing: '-0.012em' }}>
                    {s.section}
                  </div>
                  <div style={{ fontSize: '0.74rem', opacity: 0.8, marginTop: 8, lineHeight: 1.4 }}>
                    {s.chapters.slice(0, 3).map((c) => c.title.replace(/^\d+\s*·\s*/, '')).join(' · ')}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ title, subtitle, link, children }: {
  title: string; subtitle?: string; link?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
        <div>
          <h2 style={{
            margin: 0, fontSize: '1.35rem', fontWeight: 700,
            letterSpacing: '-0.018em', fontFamily: 'var(--display)',
          }}>{title}</h2>
          {subtitle && <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {link && (
          <Link href={link} style={{ fontSize: '0.82rem', color: 'var(--accent)', fontWeight: 600 }}>
            See all →
          </Link>
        )}
      </div>
      <div
        className="browse-row"
        style={{
          display: 'flex', gap: '0.85rem', overflowX: 'auto',
          paddingBottom: 8, scrollSnapType: 'x mandatory',
          scrollbarWidth: 'thin',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DocCardSmall({ doc }: { doc: DocCard }) {
  const m = metaOf(doc.ext);
  return (
    <Link
      href={doc.href}
      className="card-lift"
      style={{
        display: 'block', flexShrink: 0, width: 180,
        border: 'var(--hairline)', borderRadius: 'var(--r-3)',
        background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
        textDecoration: 'none', color: 'var(--fg)',
        overflow: 'hidden', scrollSnapAlign: 'start',
      }}
    >
      <div style={{
        height: 90,
        background: `linear-gradient(135deg, ${m.color}22, ${m.color}08)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '2.2rem',
      }}>
        {m.icon}
      </div>
      <div style={{ padding: '0.65rem 0.8rem' }}>
        <div style={{
          fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.35,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          minHeight: '2.2em',
        }}>
          {doc.title}
        </div>
      </div>
    </Link>
  );
}
