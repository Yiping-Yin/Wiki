'use client';
/**
 * Apple-style hero strip for /knowledge/<category> pages.
 * Shows progress (viewed / total) and gradient based on category.
 */
import { useMemo } from 'react';
import { useHistory } from '../lib/use-history';

const GRADIENTS = [
  ['#0071e3', '#1e1b4b'],
  ['#a855f7', '#581c87'],
  ['#ec4899', '#831843'],
  ['#10b981', '#064e3b'],
  ['#f97316', '#7c2d12'],
  ['#06b6d4', '#164e63'],
];

export function CategoryHero({
  label,
  slug,
  count,
  withText,
}: {
  label: string;
  slug: string;
  count: number;
  withText: number;
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

  const pct = count > 0 ? Math.round((viewed / count) * 100) : 0;
  // pick gradient deterministically by slug
  const idx = slug.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % GRADIENTS.length;
  const [c1, c2] = GRADIENTS[idx];

  return (
    <div style={{
      position: 'relative',
      background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
      color: '#fff',
      padding: '2.5rem 2.5rem 2rem',
      borderRadius: 'var(--r-3)',
      marginBottom: '1.5rem',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-2)',
    }}>
      <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7, marginBottom: 6 }}>
        Category
      </div>
      <h1 style={{
        margin: 0, fontSize: '2.2rem', fontWeight: 700,
        letterSpacing: '-0.025em', lineHeight: 1.1,
        fontFamily: 'var(--display)',
      }}>
        {label}
      </h1>
      <div style={{ marginTop: '1rem', display: 'flex', gap: '1.4rem', flexWrap: 'wrap', fontSize: '0.85rem', opacity: 0.92 }}>
        <span><strong style={{ fontSize: '1.05em', color: '#fff' }}>{count}</strong> documents</span>
        <span><strong style={{ fontSize: '1.05em', color: '#fff' }}>{withText}</strong> with text</span>
        <span><strong style={{ fontSize: '1.05em', color: '#fff' }}>{viewed}</strong> viewed</span>
        <span><strong style={{ fontSize: '1.05em', color: '#fff' }}>{pct}%</strong> read</span>
      </div>
      <div style={{ marginTop: '0.9rem', height: 4, background: 'rgba(255,255,255,0.18)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'rgba(255,255,255,0.85)', transition: 'width 0.5s var(--ease)' }} />
      </div>
    </div>
  );
}
