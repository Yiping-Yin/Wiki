import Link from 'next/link';
import { notFound } from 'next/navigation';
import { docsByCategory, getKnowledgeCategories, groupBySubcategory } from '../../../lib/knowledge-store';
import { CategoryHero } from '../../../components/CategoryHero';

export async function generateStaticParams() {
  const knowledgeCategories = await getKnowledgeCategories();
  return knowledgeCategories.map((c) => ({ category: c.slug }));
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const knowledgeCategories = await getKnowledgeCategories();
  const cat = knowledgeCategories.find((c) => c.slug === category);
  if (!cat) notFound();
  const docs = await docsByCategory(category);
  const groups = groupBySubcategory(docs);

  return (
    <div className="prose-notion">
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.8rem' }}>
        <Link href="/knowledge">Knowledge</Link>
      </div>

      <CategoryHero
        label={cat.label}
        slug={cat.slug}
        count={docs.length}
        withText={docs.filter((d) => d.hasText).length}
        subs={cat.subs}
      />
      <h1 style={{ display: 'none' }}>{cat.label}</h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1.5rem' }}>
        {groups.map((g) => (
          <section
            key={g.label || '_root'}
            id={g.label ? encodeURIComponent(g.label) : undefined}
            style={{
              scrollMarginTop: '2rem',
            borderRadius: 'var(--r-3)',
            border: '0.5px solid var(--mat-border)',
            background: 'var(--bg-elevated)',
            boxShadow: 'var(--shadow-1)',
            overflow: 'hidden',
          }}>
            {g.label && (
              <header style={{
                padding: '0.85rem 1.2rem',
                borderBottom: '0.5px solid var(--mat-border)',
                background: 'linear-gradient(180deg, var(--surface-2), transparent)',
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12,
              }}>
                <div className="t-headline" style={{
                  fontFamily: 'var(--display)',
                  letterSpacing: '-0.014em', color: 'var(--fg)',
                }}>{g.label}</div>
                <div className="t-caption" style={{ color: 'var(--muted)', fontWeight: 600 }}>
                  {g.docs.length} {g.docs.length === 1 ? 'item' : 'items'}
                </div>
              </header>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {g.docs.map((d, i) => (
                <li key={d.id} style={{
                  borderBottom: i < g.docs.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
                }}>
                  <Link href={`/knowledge/${d.categorySlug}/${d.fileSlug}`} style={{
                    display: 'block', padding: '0.85rem 1.2rem',
                    textDecoration: 'none', color: 'var(--fg)',
                    transition: 'background 0.18s var(--ease)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span className="t-headline" style={{ fontFamily: 'var(--display)' }}>{d.title}</span>
                      <span className="t-caption2" style={{
                        color: 'var(--muted)', fontFamily: 'var(--mono)',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                      }}>{d.ext.slice(1)}</span>
                    </div>
                    {d.preview && (
                      <div className="t-footnote" style={{
                        color: 'var(--muted)', marginTop: 4, lineHeight: 1.5,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {d.preview.slice(0, 220)}{d.preview.length > 220 ? '…' : ''}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
