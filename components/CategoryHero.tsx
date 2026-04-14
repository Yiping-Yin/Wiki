'use client';
/**
 * Apple aurora hero for /knowledge/<category> pages.
 * Shows total/viewed/percent progress AND a week-chip strip when subs exist.
 */
import { useMemo } from 'react';
import { useHistory } from '../lib/use-history';

type Sub = { label: string; order: number; count: number };

export function CategoryHero({
  label, slug, count, withText, subs = [],
}: {
  label: string;
  slug: string;
  count: number;
  withText: number;
  subs?: Sub[];
}) {
  const [history] = useHistory();
  const viewed = useMemo(() => {
    const set = new Set<string>();
    for (const h of history) {
      const m = h.id.match(/^know\/([^_]+(?:_[^_]+)*)__(.+)$/);
      if (m && m[1] === slug) set.add(m[2]);
    }
    return set.size;
  }, [history, slug]);

  const visibleSubs = subs.filter((s) => s.label);

  return (
    <div style={{
      position: 'relative',
      padding: '0.2rem 0 0',
      marginBottom: '1.35rem',
    }}>
      <div style={{ position: 'relative' }}>
        <div className="t-caption" style={{
          textTransform: 'uppercase', letterSpacing: '0.10em',
          color: 'var(--muted)', fontWeight: 700, marginBottom: 6,
        }}>
          Collection
        </div>
        <h1 className="t-title" style={{ margin: 0, color: 'var(--fg)', border: 0, padding: 0 }}>
          {label}
        </h1>
        <div
          className="t-footnote"
          style={{
            marginTop: '0.75rem',
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            color: 'var(--muted)',
            alignItems: 'center',
          }}
        >
          <span>{count} {count === 1 ? 'document' : 'documents'}</span>
          <span aria-hidden>·</span>
          <span>{withText} with text</span>
          {viewed > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{viewed} viewed</span>
            </>
          )}
        </div>

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
                <span style={{
                  color: 'var(--muted)', fontVariantNumeric: 'tabular-nums',
                  fontSize: '0.7rem',
                }}>{s.count}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
