'use client';
/**
 * Minimal header for /knowledge/<category> pages.
 * Title + optional week/sub navigation chips. Nothing else.
 */

type Sub = { label: string; order: number; count: number };

export function CategoryHero({
  label, subs = [],
}: {
  label: string;
  slug?: string;
  count?: number;
  withText?: number;
  subs?: Sub[];
}) {
  const visibleSubs = subs.filter((s) => s.label);

  return (
    <div style={{
      position: 'relative',
      padding: '0.2rem 0 0',
      marginBottom: '1.35rem',
    }}>
      <h1 className="t-title" style={{ margin: 0, color: 'var(--fg)', border: 0, padding: 0 }}>
        {label}
      </h1>

      {visibleSubs.length > 0 && (
        <div style={{
          marginTop: '0.9rem',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}>
          {visibleSubs.map((s) => (
            <a
              key={s.label}
              href={`#${encodeURIComponent(s.label)}`}
              style={{
                display: 'inline-flex',
                alignItems: 'baseline',
                gap: 6,
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--fg)',
                textDecoration: 'none',
              }}
            >
              <span>{s.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
