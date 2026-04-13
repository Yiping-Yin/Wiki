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
    <section style={{
      position: 'relative',
      padding: '0.35rem 0 1.2rem',
      marginBottom: '1.6rem',
      borderBottom: '0.5px solid var(--mat-border)',
    }}>
      <h1 className="t-largeTitle" style={{
        margin: 0, color: 'var(--fg)', border: 0, padding: 0,
        fontSize: 'clamp(2.1rem, 4vw, 2.8rem)',
      }}>{title}</h1>
      {meaningfulStats && meaningfulStats.length > 0 && (
        <div style={{
          marginTop: '0.7rem',
          display: 'flex', gap: '1rem', flexWrap: 'wrap',
          color: 'var(--muted)',
          alignItems: 'center',
        }}>
          {meaningfulStats.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="t-title3" style={{
                color: 'var(--fg)', fontWeight: 650,
                fontVariantNumeric: 'tabular-nums',
              }}>{s.value}</span>
              <span className="t-footnote" style={{ color: 'var(--muted)' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
      {actions && (
        <div style={{ marginTop: '0.9rem', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </section>
  );
}
