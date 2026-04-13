'use client';
import { useEffect, useRef, useState } from 'react';
import { usePins } from '../lib/use-pins';

export function PinButton({ id, title, href, size = 'sm' }: { id: string; title: string; href: string; size?: 'sm' | 'md' }) {
  const { isPinned, toggle } = usePins();
  const pinned = isPinned(id);
  const dim = size === 'md' ? 24 : 18;
  const [bursting, setBursting] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  // Trigger spring + toast on transition unpinned → pinned
  const prevPinned = useRef(pinned);
  useEffect(() => {
    if (!prevPinned.current && pinned) {
      setBursting(true);
      window.setTimeout(() => setBursting(false), 600);
    }
    prevPinned.current = pinned;
  }, [pinned]);

  const onClick = (e: React.MouseEvent) => {
    // §1 — visual state change is the entire feedback. No toast.
    e.preventDefault(); e.stopPropagation();
    toggle({ id, title, href });
  };

  return (
    <button
      ref={ref}
      onClick={onClick}
      title={pinned ? 'Unpin from /today + sidebar' : 'Pin to /today + sidebar'}
      aria-label={pinned ? 'Unpin' : 'Pin'}
      aria-pressed={pinned}
      style={{
        position: 'relative',
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        padding: 2,
        fontSize: dim * 0.8,
        color: pinned ? 'var(--tint-yellow)' : 'var(--muted)',
        transition: 'transform 0.2s var(--ease-spring), color 0.22s var(--ease)',
        lineHeight: 1,
        animation: bursting ? 'pinBurst 0.55s var(--ease-spring)' : undefined,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.18)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      {pinned ? '★' : '☆'}
      {bursting && (
        <span aria-hidden style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            position: 'absolute',
            width: dim * 2.4, height: dim * 2.4,
            borderRadius: '50%',
            border: '2px solid var(--tint-yellow)',
            animation: 'pinHalo 0.55s var(--ease) forwards',
          }} />
        </span>
      )}
    </button>
  );
}
