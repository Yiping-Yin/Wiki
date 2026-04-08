'use client';
/**
 * Apple-style pinned title bar that appears after the user scrolls past the
 * page's H1. Uses IntersectionObserver on the first <main h1> for cheap
 * scroll detection.
 *
 * Renders nothing until the H1 scrolls out of view, then slides down a
 * compact glass header with breadcrumb + the H1 text.
 */
import { useEffect, useState } from 'react';

export function StickyTitle() {
  const [pinned, setPinned] = useState(false);
  const [title, setTitle] = useState('');
  const [crumb, setCrumb] = useState('');

  useEffect(() => {
    const h1 = document.querySelector('main h1');
    if (!h1) return;
    setTitle((h1.textContent ?? '').trim());

    // try to extract a breadcrumb (first .prose-notion small text node before h1)
    const crumbEl = document.querySelector('main .prose-notion > div:first-of-type, main .with-toc .prose-notion > div:first-of-type');
    if (crumbEl) setCrumb((crumbEl.textContent ?? '').trim().slice(0, 60));

    const obs = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { rootMargin: '-60px 0px 0px 0px', threshold: 0 },
    );
    obs.observe(h1);
    return () => obs.disconnect();
  }, []);

  if (!pinned || !title) return null;

  return (
    <div
      className="glass sticky-title"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        padding: '0.6rem 1.2rem',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: 'var(--hairline)',
        animation: 'lpFade 0.2s var(--ease)',
      }}
    >
      {/* Push past sidebar width on desktop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 1200, margin: '0 auto', width: '100%', paddingLeft: 'clamp(0px, 4vw, 280px)' }}>
        {crumb && (
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>
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
    </div>
  );
}
