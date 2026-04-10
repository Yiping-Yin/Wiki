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
      padding: '2.2rem 2.2rem 1.6rem',
      borderRadius: 'var(--r-3)',
      marginBottom: '1.5rem',
      overflow: 'hidden',
      border: '0.5px solid var(--mat-border)',
      background: 'var(--bg-elevated)',
      boxShadow: 'var(--shadow-1)',
      isolation: 'isolate',
    }}>
      <div className="hero-aurora" aria-hidden style={{ inset: '-30% -10%' }} />
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
        <div style={{ marginTop: '0.85rem', display: 'flex', gap: '1.4rem', flexWrap: 'wrap' }}>
          <Stat value={count} label="documents" />
          <Stat value={withText} label="with text" />
          {viewed > 0 && <Stat value={viewed} label="viewed" />}
        </div>

        {visibleSubs.length > 0 && (
          <div style={{
            marginTop: '1.1rem',
            display: 'flex', gap: 6, flexWrap: 'wrap',
          }}>
            {visibleSubs.map((s) => (
              <a
                key={s.label}
                href={`#${encodeURIComponent(s.label)}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '5px 11px', borderRadius: 999,
                  background: 'var(--mat-thin-bg)',
                  border: '0.5px solid var(--mat-border)',
                  fontSize: '0.74rem', fontWeight: 600,
                  color: 'var(--fg)', textDecoration: 'none',
                  backdropFilter: 'var(--mat-blur)',
                  WebkitBackdropFilter: 'var(--mat-blur)',
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

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span className="t-title3" style={{ color: 'var(--fg)', fontWeight: 700 }}>{value}</span>
      <span className="t-footnote" style={{ color: 'var(--muted)' }}>{label}</span>
    </div>
  );
}
