'use client';
/**
 * Ultra-thin scroll progress strip pinned to the top of the viewport.
 * Replaces the old StickyTitle floating pill — page title is already in
 * the browser tab and the TOC sidebar tracks the current section, so
 * a second floating title was redundant clutter. Click to jump to top.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function ScrollProgress() {
  const pathname = usePathname();
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setPct(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  const visible = pct > 0.5;

  return (
    <div
      className="scroll-progress"
      role="progressbar"
      aria-label="Page scroll progress"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      title="Click to scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0,
        height: 3, zIndex: 100,
        background: 'transparent',
        cursor: visible ? 'pointer' : 'default',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          width: `${pct}%`, height: '100%',
          background: 'linear-gradient(90deg, var(--accent), #a855f7)',
          transition: 'width 0.08s linear',
          boxShadow: visible ? '0 0 12px rgba(124,58,237,0.45)' : 'none',
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
