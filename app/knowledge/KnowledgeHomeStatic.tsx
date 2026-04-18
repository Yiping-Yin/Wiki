import Link from 'next/link';
import { PatternSwatch } from '../../components/PatternSwatch';
import { QuietScene, QuietSceneColumn } from '../../components/QuietScene';
import { QuietSceneIntro } from '../../components/QuietSceneIntro';
import { StageShell } from '../../components/StageShell';
import { WorkEyebrow, textActionStyle, WorkSurface } from '../../components/WorkSurface';

export function KnowledgeHomeStatic({
  groups,
  totalCollections,
  totalDocs,
}: {
  groups: Array<{
    label: string;
    items: Array<{
      slug: string;
      label: string;
      count: number;
    }>;
  }>;
  totalCollections: number;
  totalDocs: number;
}) {
  return (
    <StageShell
      variant="archive"
      contentVariant="archive"
      innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.5rem' }}
    >
      <QuietScene tone="atlas">
        <QuietSceneColumn>
          <QuietSceneIntro
            eyebrow="Atlas"
            title="Collections stay quiet until a thread warms them."
            meta={
              <span>
                {totalCollections} collections · {totalDocs} docs
              </span>
            }
            summary="Browse the collections below. Each swatch is woven from actual panel and weave activity, so the Atlas stays grounded in work rather than decorative chrome."
          />
        </QuietSceneColumn>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 4 }}>
          {groups.map((group) => (
            <WorkSurface key={group.label} tone="quiet" density="regular">
              <header
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <WorkEyebrow subtle>{group.label}</WorkEyebrow>
                  <div
                    style={{
                      fontFamily: 'var(--display)',
                      fontSize: '1.1rem',
                      fontWeight: 620,
                      letterSpacing: '-0.02em',
                      color: 'var(--fg)',
                    }}
                  >
                    {group.items.length} collection{group.items.length === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="t-caption2" style={{ color: 'var(--muted)' }}>
                  Start anywhere. Return when a thread changes.
                </div>
              </header>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 12,
                }}
              >
                {group.items.map((item) => (
                  <CollectionCard key={item.slug} slug={item.slug} label={item.label} count={item.count} />
                ))}
              </div>
            </WorkSurface>
          ))}
        </div>
      </QuietScene>
    </StageShell>
  );
}

function CollectionCard({
  slug,
  label,
  count,
}: {
  slug: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={`/knowledge/${slug}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '0.92rem 0.98rem',
        textDecoration: 'none',
        color: 'var(--fg)',
        borderRadius: 'var(--r-3)',
        border: '0.5px solid color-mix(in srgb, var(--mat-border) 84%, transparent)',
        background: 'color-mix(in srgb, var(--mat-thick-bg) 78%, transparent)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
        transition: 'transform 0.18s var(--ease), border-color 0.18s var(--ease), box-shadow 0.18s var(--ease)',
      }}
    >
      <PatternSwatch categorySlug={slug} height={32} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            color: 'var(--fg)',
            fontFamily: 'var(--display)',
            fontSize: '0.98rem',
            fontWeight: 560,
            letterSpacing: '-0.015em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        <div className="t-caption2" style={{ color: 'var(--muted)' }}>
          {count} doc{count === 1 ? '' : 's'}
        </div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div className="t-caption2" style={{ color: 'var(--muted)' }}>
          Open collection
        </div>
        <span style={textActionStyle(true)}>Enter</span>
      </div>
    </Link>
  );
}
