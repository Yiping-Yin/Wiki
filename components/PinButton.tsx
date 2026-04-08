'use client';
import { usePins } from '../lib/use-pins';

export function PinButton({ id, title, href, size = 'sm' }: { id: string; title: string; href: string; size?: 'sm' | 'md' }) {
  const { isPinned, toggle } = usePins();
  const pinned = isPinned(id);
  const dim = size === 'md' ? 24 : 18;

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle({ id, title, href }); }}
      title={pinned ? 'Unpin from /today + sidebar' : 'Pin to /today + sidebar'}
      aria-label={pinned ? 'Unpin' : 'Pin'}
      style={{
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        padding: 2,
        fontSize: dim * 0.8,
        color: pinned ? '#f59e0b' : 'var(--muted)',
        transition: 'transform 0.2s var(--ease-spring), color 0.2s var(--ease)',
        lineHeight: 1,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.18)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {pinned ? '★' : '☆'}
    </button>
  );
}
