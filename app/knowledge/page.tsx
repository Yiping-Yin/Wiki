import Link from 'next/link';
import { getKnowledgeCategories } from '../../lib/knowledge-store';
import { KesiSwatch } from '../../components/KesiSwatch';

export const metadata = { title: 'Your Kesi · Loom' };

/**
 * /knowledge — kesi-swatch grid view of every collection.
 *
 * §1, §11 — the previous version had a glassed aurora hero with
 * "Your Kesi · 缂" eyebrow + large title + 3-stat row + descriptive
 * paragraph. All chrome. The kesi swatches themselves ARE the page —
 * they need no introduction. /about already explains the metaphor.
 *
 * Each collection's swatch (a small woven preview from KesiSwatch)
 * stays — that's §19 in action: the visualization derives from the
 * physical kesi grammar, not from borrowed UI patterns.
 */

function groupTop(cats: Awaited<ReturnType<typeof getKnowledgeCategories>>) {
  const groups = new Map<string, typeof cats>();
  for (const c of cats) {
    const m = c.label.match(/^([^·]+?)\s*·/);
    const top = m ? m[1].trim() : 'Other';
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top)!.push(c);
  }
  return Array.from(groups.entries())
    .map(([label, items]) => ({
      label,
      count: items.reduce((s, c) => s + c.count, 0),
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.count - a.count);
}

export default async function KnowledgeHome() {
  const knowledgeCategories = await getKnowledgeCategories();
  const groups = groupTop(knowledgeCategories);

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      {groups.map((g) => (
        <section key={g.label} style={{ marginBottom: '2.6rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 16,
          }}>
            <span aria-hidden style={{
              width: 18, height: 1,
              background: 'var(--accent)', opacity: 0.55,
            }} />
            <span className="t-caption2" style={{
              color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.10em',
              fontWeight: 700,
            }}>{g.label}</span>
            <span aria-hidden style={{
              flex: 1, height: 1, background: 'var(--mat-border)',
            }} />
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '0.85rem',
          }}>
            {g.items.map((c) => (
              <CollectionCard
                key={c.slug}
                slug={c.slug}
                label={c.label.replace(/^[^·]+·\s*/, '')}
                count={c.count}
                weeks={c.subs.filter((s) => s.label).length}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CollectionCard({
  slug, label, count, weeks,
}: {
  slug: string; label: string; count: number; weeks: number;
}) {
  return (
    <Link
      href={`/knowledge/${slug}`}
      className="loom-collection-card"
      style={{
        display: 'block',
        padding: '0.7rem 0',
        textDecoration: 'none',
        color: 'var(--fg)',
      }}
    >
      {/* The actual woven swatch — this IS the card */}
      <KesiSwatch categorySlug={slug} height={28} />
      <div style={{ marginTop: 10 }}>
        <div style={{
          color: 'var(--fg)',
          fontFamily: 'var(--display)',
          fontSize: '0.94rem',
          fontWeight: 500,
          letterSpacing: '-0.012em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</div>
        <div className="t-caption" style={{
          color: 'var(--muted)', marginTop: 2,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {count} {count === 1 ? 'doc' : 'docs'}
          {weeks > 0 && ` · ${weeks} weeks`}
        </div>
      </div>
    </Link>
  );
}
