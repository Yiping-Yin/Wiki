import Link from 'next/link';
import { KesiSwatch } from '../../components/KesiSwatch';

export function KnowledgeHomeStatic({
  groups,
}: {
  groups: Array<{
    label: string;
    items: Array<{
      slug: string;
      label: string;
    }>;
  }>;
}) {
  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      {groups.map((g) => (
        <section key={g.label} style={{ marginBottom: '2.6rem' }}>
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
