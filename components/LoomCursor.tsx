'use client';
/**
 * LoomCursor · §25, §28, §32
 *
 * Replaces the OS text cursor inside Loom's main content area with a custom
 * I-beam that has an accent-color tail at its bottom serif. The cursor IS
 * the affordance — when the user is hovering text, the cursor itself
 * carries Loom's color, telling the eye "this surface is yours to weave."
 *
 * It is purely aesthetic. It does NOT trigger any AI action — that role
 * belongs to SelectionWarp for selection-bound asks, and to ⌘/ for review.
 * The custom cursor is the silent persistent
 * indicator that this surface is alive, in the same way macOS uses cursor
 * variants to signal interactive zones.
 *
 * §31 friendly: a cursor is OS-level (the system pointer), not in-product
 * chrome. It lives in the gap between user and surface, not on the surface.
 */
import { useEffect } from 'react';

const SVG_LIGHT = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="22" viewBox="0 0 16 22"><g fill="none" stroke-linecap="square"><line x1="5.5" y1="3" x2="10.5" y2="3" stroke="#1d1d1f" stroke-width="1"/><line x1="8" y1="3" x2="8" y2="19" stroke="#1d1d1f" stroke-width="1"/><line x1="5" y1="19" x2="11" y2="19" stroke="#9E7C3E" stroke-width="1.6"/></g></svg>`;
const SVG_DARK = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="22" viewBox="0 0 16 22"><g fill="none" stroke-linecap="square"><line x1="5.5" y1="3" x2="10.5" y2="3" stroke="#f5f5f7" stroke-width="1"/><line x1="8" y1="3" x2="8" y2="19" stroke="#f5f5f7" stroke-width="1"/><line x1="5" y1="19" x2="11" y2="19" stroke="#9E7C3E" stroke-width="1.6"/></g></svg>`;

function build() {
  if (typeof document === 'undefined') return '';
  const isDark = document.documentElement.classList.contains('dark');
  const svg = isDark ? SVG_DARK : SVG_LIGHT;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") 8 11, text`;
}

const SELECTOR = [
  'main p',
  'main li',
  'main h1', 'main h2', 'main h3', 'main h4', 'main h5',
  'main blockquote',
  'main td', 'main th',
  'main .prose-notion',
].join(', ');

export function LoomCursor() {
  useEffect(() => {
    const apply = () => {
      const url = build();
      let style = document.getElementById('loom-cursor-style') as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = 'loom-cursor-style';
        document.head.appendChild(style);
      }
      style.textContent = `${SELECTOR} { cursor: ${url}; }`;
    };

    apply();

    // Re-apply on theme change (the dark class flips on <html>)
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') { apply(); break; }
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      obs.disconnect();
      document.getElementById('loom-cursor-style')?.remove();
    };
  }, []);
  return null;
}
