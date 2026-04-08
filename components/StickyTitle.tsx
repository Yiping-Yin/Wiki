'use client';
/**
 * Apple-style pinned title bar that appears after the user scrolls past the
 * page's H1. Tracks pathname so it re-runs on navigation.
 *
 * Crumb extraction is conservative: only the element IMMEDIATELY before the
 * h1, AND only if it looks like a breadcrumb (contains › or starts with a
 * common emoji prefix). Otherwise the crumb is omitted.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export function StickyTitle() {
  const pathname = usePathname();
  const [pinned, setPinned] = useState(false);
  const [title, setTitle] = useState('');
  const [crumb, setCrumb] = useState('');

  useEffect(() => {
    setPinned(false);
    setTitle('');
    setCrumb('');

    // Wait a tick for the new page to mount
    const t = setTimeout(() => {
      const h1 = document.querySelector('main h1');
      if (!h1) return;

      // If h1 is hidden (display: none) — e.g. CategoryHero overrides — try the visible alternative
      const isVisible = (el: Element) => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      const visibleH1 = isVisible(h1)
        ? h1
        : document.querySelector('main h1, main [role="heading"][aria-level="1"]');
      if (!visibleH1) return;

      setTitle((visibleH1.textContent ?? '').trim());

      // Look for a real breadcrumb: the previous sibling of h1, IF it
      // contains a › character or a Knowledge link.
      const prev = h1.previousElementSibling;
      if (prev) {
        const t = (prev.textContent ?? '').trim();
        if (t.length > 0 && t.length < 80 && (t.includes('›') || t.includes('Knowledge') || t.includes('Home'))) {
          setCrumb(t);
        }
      }

      const obs = new IntersectionObserver(
        ([entry]) => setPinned(!entry.isIntersecting),
        { rootMargin: '-60px 0px 0px 0px', threshold: 0 },
      );
      obs.observe(h1);
      return () => obs.disconnect();
    }, 80);

    return () => clearTimeout(t);
  }, [pathname]);

  if (!pinned || !title) return null;

  return (
    <div
      className="glass sticky-title"
      style={{
        position: 'fixed', top: 0, right: 0, zIndex: 40,
        padding: '0.55rem 1.2rem',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: 'var(--hairline)',
        animation: 'lpFade 0.2s var(--ease)',
      }}
    >
      {crumb && (
        <span style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>
          {crumb}
        </span>
      )}
      <span
        style={{
          fontFamily: 'var(--display)', fontSize: '0.95rem', fontWeight: 600,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: 1, minWidth: 0,
        }}
        title={title}
      >
        {title}
      </span>
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Back to top"
        style={{
          background: 'transparent', border: 'var(--hairline)',
          borderRadius: 'var(--r-1)', padding: '4px 10px',
          cursor: 'pointer', color: 'var(--muted)', fontSize: '0.72rem',
          whiteSpace: 'nowrap',
        }}
      >↑ top</button>
    </div>
  );
}
