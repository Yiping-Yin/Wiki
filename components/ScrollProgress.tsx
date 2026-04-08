'use client';
import { useEffect, useState } from 'react';

export function ScrollProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 100,
        background: 'transparent', pointerEvents: 'none',
      }}
    >
      <div
        style={{
          width: `${pct}%`, height: '100%',
          background: 'linear-gradient(90deg, var(--accent), #a855f7)',
          transition: 'width 0.08s linear',
          boxShadow: pct > 1 ? '0 0 12px rgba(37,99,235,0.4)' : 'none',
        }}
      />
    </div>
  );
}
