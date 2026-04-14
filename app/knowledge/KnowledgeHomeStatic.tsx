import Link from 'next/link';
import { KesiSwatch } from '../../components/KesiSwatch';

export function KnowledgeHomeStatic({
  groups,
}: {
  groups: Array<{
    label: string;
    count: number;
    items: Array<{
      slug: string;
      label: string;
      count: number;
      weeks: number;
    }>;
  }>;
}) {
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
                label={c.label}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CollectionCard({
  slug, label,
}: {
  slug: string; label: string;
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
      </div>
    </Link>
  );
}
