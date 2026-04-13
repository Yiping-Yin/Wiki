'use client';
/**
 * ScrollDirection · scroll-down detection + scroll position save.
 * Combines two functions in one scroll listener for performance.
 */
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const SCROLL_KEY_PREFIX = 'loom:scroll:';

export function ScrollDirection() {
  const lastY = useRef(0);
  const ticking = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const isReading = pathname.startsWith('/wiki/') || pathname.startsWith('/knowledge/');

  // Restore scroll position on mount
  useEffect(() => {
    if (!isReading) return;
    const saved = sessionStorage.getItem(SCROLL_KEY_PREFIX + pathname);
    if (saved) {
      const y = parseInt(saved, 10);
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [pathname, isReading]);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;

        // Direction detection
        if (delta > 30 && y > 100) {
          document.body.classList.add('scrolled-down');
        } else if (delta < -20 || y < 50) {
          document.body.classList.remove('scrolled-down');
        }
        lastY.current = y;

        // Save scroll position (debounced)
        if (isReading) {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          saveTimer.current = setTimeout(() => {
            sessionStorage.setItem(SCROLL_KEY_PREFIX + pathname, String(y));
          }, 300);
        }

        ticking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [pathname, isReading]);

  return null;
}
