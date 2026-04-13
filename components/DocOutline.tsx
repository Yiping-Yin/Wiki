'use client';

/**
 * DocOutline · §38 · left-margin document structure
 *
 * Pure heading navigation on the left. Mirrors ThoughtMapTOC on the right:
 * source structure on the left, thought structure on the right.
 */
import { useEffect, useMemo, useState } from 'react';
import { locateAnchorElement } from './thought-anchor-model';

type Item = { id: string; text: string; level: number; parentId?: string };

export function DocOutline() {
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState('');
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewAnchorId, setReviewAnchorId] = useState('');

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;

    let lastSig = '';

    const slugify = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

    const collect = () => {
      const headings = Array.from(main.querySelectorAll('h2, h3')) as HTMLElement[];
      // Deduplicate ids — repeated headings (e.g., two "在文中的意义" sections)
      // would collide on slug alone. Suffix -2, -3, … to keep them unique.
      const usedIds = new Set<string>();
      headings.forEach((h) => {
        let id = h.id;
        if (!id) {
          const base = slugify(h.textContent ?? '');
          if (!base) return;
          id = base;
          let n = 2;
          while (usedIds.has(id)) id = `${base}-${n++}`;
          h.id = id;
        } else if (usedIds.has(id)) {
          const base = id;
          let n = 2;
          while (usedIds.has(id)) id = `${base}-${n++}`;
          h.id = id;
        }
        usedIds.add(id);
      });

      const sig = headings.map((h) => `${h.id}:${h.textContent}`).join('|');
      if (sig === lastSig) return;
      lastSig = sig;

      let currentH2: string | undefined;
      setItems(headings.map((h) => {
        const level = h.tagName === 'H2' ? 2 : 3;
        if (level === 2) currentH2 = h.id;
        return {
          id: h.id,
          text: h.textContent ?? '',
          level,
          parentId: level === 3 ? currentH2 : undefined,
        };
      }));
    };

    // §X · Active-heading detection.
    //
    // The previous implementation used an IntersectionObserver with
    // `rootMargin: '-20% 0% -70% 0%'` — a 10%-tall band at 20-30% from the
    // viewport top. This had a fundamental problem: when the user scrolled
    // BETWEEN two headings (both above/below the band, nothing inside),
    // the observer fired nothing, and `active` got stuck on whichever
    // heading was last reported. So you could scroll far past a section
    // visually, and the sidebar would still highlight the previous heading.
    //
    // Replaced with a scroll-driven scan: on every scroll frame, find the
    // heading whose top is CLOSEST TO BUT STILL ABOVE the user's "read
    // line" (roughly 18% from the viewport top — where the eye rests during
    // reading). No gaps, no stale active.
    const computeActive = () => {
      const hs = Array.from(main.querySelectorAll('h2, h3')) as HTMLElement[];
      if (hs.length === 0) return;
      // The read-line defines what counts as "active". A heading is active
      // when it's visible in the upper portion of the viewport OR above it.
      //
      // Previous value was 0.18 (18% from top) — too tight. A heading at
      // y=150px (inside the top of the visible area) on a 700px viewport
      // would NOT count (150 > 126 = 18% * 700), so active would fall back
      // to the parent H2 above the viewport. Visually the user saw the H3
      // at the top but the sidebar highlighted the parent.
      //
      // Moved to 0.35 (35% from top) — any heading whose TOP is in the
      // upper third of the viewport counts. This matches user intuition:
      // "the heading I can see at the top of my reading area is active."
      const readLine = Math.max(140, window.innerHeight * 0.35);
      let bestEl: HTMLElement | null = null;
      let bestTop = -Infinity;
      for (const h of hs) {
        const top = h.getBoundingClientRect().top;
        // Keep the heading whose top is closest to (but not below) readLine.
        // Among multiple candidates, the one with the LARGEST top (closest
        // to readLine from above) is the most recently-engaged heading.
        if (top <= readLine && top > bestTop) {
          bestEl = h;
          bestTop = top;
        }
      }
      // Fallback: if every heading is below the read line (user at the very
      // top of the doc), use the first heading as active.
      if (!bestEl) bestEl = hs[0];
      if (bestEl && bestEl.id) setActive(bestEl.id);
    };

    collect();
    computeActive();

    let raf = 0;
    const scheduleCollect = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        collect();
        computeActive();
      });
    };
    const scheduleActive = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(computeActive);
    };

    const mut = new MutationObserver(scheduleCollect);
    mut.observe(main, { childList: true, subtree: true, characterData: true });

    window.addEventListener('scroll', scheduleActive, { passive: true });
    window.addEventListener('resize', scheduleActive, { passive: true });

    return () => {
      mut.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', scheduleActive);
      window.removeEventListener('resize', scheduleActive);
    };
  }, []);

  useEffect(() => {
    const onStudy = (e: Event) => {
      const active = (e as CustomEvent).detail?.active ?? false;
      setReviewMode(active);
      if (!active) setReviewAnchorId('');
    };
    const onReviewAnchor = (e: Event) => {
      const anchorId = (e as CustomEvent).detail?.anchorId as string | null | undefined;
      setReviewAnchorId(anchorId ?? '');
    };
    window.addEventListener('loom:study-mode', onStudy);
    window.addEventListener('loom:review:active-anchor', onReviewAnchor);
    return () => {
      window.removeEventListener('loom:study-mode', onStudy);
      window.removeEventListener('loom:review:active-anchor', onReviewAnchor);
    };
  }, []);

  const reviewActiveH2 = useMemo(() => {
    if (!reviewAnchorId) return '';
    const anchorEl = locateAnchorElement(reviewAnchorId);
    if (!anchorEl) return '';
    const anchorTop = anchorEl.getBoundingClientRect().top + window.scrollY;
    let current = '';
    for (const item of items) {
      if (item.level !== 2) continue;
      const headingEl = document.getElementById(item.id);
      if (!headingEl) continue;
      const top = headingEl.getBoundingClientRect().top + window.scrollY;
      if (top <= anchorTop + 1) current = item.id;
      else break;
    }
    return current;
  }, [reviewAnchorId, items]);

  let sectionNo = 0;
  const activeH2 =
    reviewMode
      ? reviewActiveH2 || items.find((it) => it.level === 2)?.id
      : items.find((it) => it.id === active && it.level === 2)?.id
    ?? items.find((it) => it.id === active)?.parentId
    ?? items.find((it) => it.level === 2)?.id;

  const renderedItems = reviewMode
    ? items.filter((it) => it.level === 2)
    : items;

  if (items.length === 0) return <aside className="doc-outline" />;

  // Only show h2 headings — h3 is too granular for a minimal outline
  const h2Items = items.filter((it) => it.level === 2);
  if (h2Items.length === 0) return <aside className="doc-outline" />;

  return (
    <nav
      className="loom-doc-nav"
      style={{
        position: 'sticky' as const,
        top: '5rem',
        alignSelf: 'start',
        maxHeight: 'calc(100vh - 6rem)',
        overflowY: 'auto' as const,
        padding: '1rem 0',
        opacity: 0.35,
        transition: 'opacity 0.3s ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.35'; }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {h2Items.map((it, idx) => {
          const isActive = active === it.id;
          return (
            <a
              key={`${it.id}-${idx}`}
              title={it.text}
              href={`#${it.id}`}
              onClick={(ev) => {
                if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
                const target = document.getElementById(it.id);
                if (!target) return;
                ev.preventDefault();
                const rect = target.getBoundingClientRect();
                const y = rect.top + window.scrollY - Math.max(100, window.innerHeight * 0.20);
                window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
                history.replaceState(null, '', `#${it.id}`);
              }}
              style={{
                display: 'block',
                padding: '4px 8px 4px 0',
                fontSize: '0.68rem',
                lineHeight: 1.4,
                color: isActive ? 'var(--fg)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                borderRight: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'color 0.2s ease, border-color 0.2s ease',
              }}
            >
              {it.text}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
