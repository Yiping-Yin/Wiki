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
    <button
      className="glass sticky-title"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      title={`${title} — click to scroll to top`}
      aria-label={`${title}. Click to scroll to top.`}
      style={{
        position: 'fixed', top: 12, zIndex: 40,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 16px 7px 14px',
        borderRadius: 999,
        border: 'var(--hairline)',
        boxShadow: 'var(--shadow-2)',
        cursor: 'pointer',
        color: 'var(--fg)',
        maxWidth: 'min(560px, calc(100vw - 32px))',
        animation: 'stickyPillIn 0.24s var(--ease)',
        font: 'inherit',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateX(-50%) translateY(-1px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'translateX(-50%) translateY(0)'; }}
    >
      <span aria-hidden style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: 999,
        background: 'var(--accent-soft)', color: 'var(--accent)',
        fontSize: 11, lineHeight: 1, flexShrink: 0,
      }}>↑</span>
      {crumb && (
        <span style={{
          fontSize: '0.7rem', color: 'var(--muted)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: 140, flexShrink: 0,
        }}>{crumb}</span>
      )}
      {crumb && <span aria-hidden style={{ color: 'var(--border-strong)', fontSize: '0.7rem' }}>·</span>}
      <span
        style={{
          fontFamily: 'var(--display)', fontSize: '0.86rem', fontWeight: 600,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          minWidth: 0,
        }}
      >
        {title}
      </span>
    </button>
  );
}
