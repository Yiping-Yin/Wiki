'use client';
/**
 * Notion / Wikipedia-style hover preview cards for internal links.
 *
 * On hover of any <a href="/wiki/..."> or <a href="/knowledge/..."> for ≥350ms,
 * show a floating card near the cursor with the linked doc's title + preview +
 * category. Card hides on mouseleave or scroll. Metadata pulled lazily from
 * /search-index.json, cached in module memory.
 */
import { useEffect, useRef, useState } from 'react';

type DocMeta = { title: string; href: string; category: string; preview?: string };

let _hrefIndex: Map<string, DocMeta> | null = null;
let _loadPromise: Promise<void> | null = null;

async function loadHrefIndex(): Promise<void> {
  if (_hrefIndex) return;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const r = await fetch('/search-index.json');
      if (!r.ok) return;
      const payload = await r.json();
      const stored = payload.index?.storedFields ?? {};
      const m = new Map<string, DocMeta>();
      for (const [, fields] of Object.entries<any>(stored)) {
        if (!fields?.href || !fields?.title) continue;
        m.set(fields.href, {
          href: fields.href,
          title: fields.title,
          category: fields.category ?? '',
        });
      }
      _hrefIndex = m;
    } catch {}
  })();
  return _loadPromise;
}

const previewCache = new Map<string, string>();
async function loadPreview(href: string): Promise<string | undefined> {
  if (previewCache.has(href)) return previewCache.get(href);
  // For knowledge docs, fetch the body file (cheap, cached, ~tens of KB)
  const know = href.match(/^\/knowledge\/([^/]+)\/([^/]+)/);
  if (know) {
    try {
      const id = `${know[1]}__${know[2]}`;
      const r = await fetch(`/knowledge/docs/${id}.json`);
      if (r.ok) {
        const j = await r.json();
        const snippet = (j.body ?? '').slice(0, 220).trim();
        previewCache.set(href, snippet);
        return snippet;
      }
    } catch {}
  }
  // For wiki chapters, use the title only — no body fetch
  return undefined;
}

export function LinkPreview() {
  const [hovered, setHovered] = useState<{ x: number; y: number; meta: DocMeta; preview?: string } | null>(null);
  const timer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const insideCard = useRef(false);

  useEffect(() => {
    loadHrefIndex();

    const isInternalDoc = (href: string) =>
      href.startsWith('/wiki/') || href.startsWith('/knowledge/');

    const onMouseOver = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
      if (!a || !a.href) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const path = url.pathname;
      if (!isInternalDoc(path)) return;
      // Only handle 2-segment chapter / 3-segment doc paths
      const segs = path.split('/').filter(Boolean);
      if (segs[0] === 'wiki' && segs.length !== 2) return;
      if (segs[0] === 'knowledge' && segs.length !== 3) return;

      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(async () => {
        await loadHrefIndex();
        const meta = _hrefIndex?.get(path);
        if (!meta) return;
        const rect = a.getBoundingClientRect();
        const preview = await loadPreview(path);
        setHovered({
          x: rect.left + rect.width / 2 + window.scrollX,
          y: rect.bottom + window.scrollY + 6,
          meta,
          preview,
        });
      }, 350);
    };

    const onMouseOut = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      if (timer.current) window.clearTimeout(timer.current);
      // Delay hide to allow moving onto card
      window.setTimeout(() => {
        if (!insideCard.current) setHovered(null);
      }, 120);
    };

    const onScroll = () => setHovered(null);

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      window.removeEventListener('scroll', onScroll);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!hovered) return null;

  // Clamp to viewport
  const W = 320;
  const left = Math.max(12, Math.min(window.innerWidth - W - 12, hovered.x - W / 2));

  return (
    <div
      ref={cardRef}
      className="glass"
      onMouseEnter={() => { insideCard.current = true; }}
      onMouseLeave={() => { insideCard.current = false; setHovered(null); }}
      style={{
        position: 'absolute', left, top: hovered.y, zIndex: 95,
        width: W, padding: '0.95rem 1.1rem',
        color: 'var(--fg)',
        borderRadius: 'var(--r-3)',
        boxShadow: 'var(--shadow-3)',
        fontSize: '0.85rem', lineHeight: 1.5,
        animation: 'lpFade 0.18s var(--ease-spring)',
      }}
    >
      <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>
        {hovered.meta.category}
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.35, marginBottom: 6 }}>
        {hovered.meta.title}
      </div>
      {hovered.preview && (
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          {hovered.preview}{hovered.preview.length >= 220 ? '…' : ''}
        </div>
      )}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <a
          href={hovered.meta.href}
          style={{
            background: 'var(--accent)', color: '#fff', border: 0,
            borderRadius: 5, padding: '3px 10px', fontSize: '0.75rem',
            textDecoration: 'none', fontWeight: 600,
          }}
        >Open →</a>
      </div>
    </div>
  );
}
