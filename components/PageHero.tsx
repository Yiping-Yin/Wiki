/**
 * PageHero · Loom 's restrained page header.
 *
 * Per Loom 's design constitution:
 *   - Verb over label: title is the only required prop
 *   - Trust the reader: no eyebrow caption explaining what the page is
 *   - Single focal point: title + (optional) stats, nothing else
 *   - Glass over surface: aurora overlay on glass, never opaque blocks
 *
 * `eyebrow` and `description` are STILL accepted but only used when meaningfully
 * different from the title (kept for migration; new code should omit them).
 */
import type { ReactNode } from 'react';

export function PageHero({
  eyebrow,
  title,
  description,
  stats,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  stats?: { value: number | string; label: string }[];
  actions?: ReactNode;
}) {
  // Filter out 0/empty stats per constitution rule "empty space is content"
  const meaningfulStats = stats?.filter((s) => {
    if (s.value === 0 || s.value === '0') return false;
    if (typeof s.value === 'string' && !s.value.trim()) return false;
    return true;
  });

  return (
    <section className="material-thick" style={{
      position: 'relative', overflow: 'hidden',
      borderRadius: 'var(--r-3)',
      padding: '2.6rem 2.4rem 2.2rem',
      marginBottom: '1.8rem',
      isolation: 'isolate',
    }}>
      <div className="hero-aurora" aria-hidden style={{ inset: '-30% -10%' }} />
      <div className="hero-grain" aria-hidden />
      <div style={{ position: 'relative' }}>
        <h1 className="t-largeTitle" style={{
          margin: 0, color: 'var(--fg)', border: 0, padding: 0,
          fontSize: 'clamp(2.2rem, 4.2vw, 3rem)',
        }}>{title}</h1>
        {meaningfulStats && meaningfulStats.length > 0 && (
          <div style={{
            marginTop: '0.95rem',
            display: 'flex', gap: '1.6rem', flexWrap: 'wrap',
          }}>
            {meaningfulStats.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span className="t-title3" style={{
                  color: 'var(--fg)', fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}>{s.value}</span>
                <span className="t-footnote" style={{ color: 'var(--muted)' }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}
        {actions && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {actions}
          </div>
        )}
      </div>
    </section>
  );
}
