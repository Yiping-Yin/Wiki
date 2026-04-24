'use client';
/**
 * Notion / Wikipedia-style hover preview cards for internal links.
 *
 * On hover of any <a href="/wiki/..."> or <a href="/knowledge/..."> for ≥350ms,
 * show a floating card near the cursor with the linked doc's title + preview +
 * category. Card hides on mouseleave or scroll. Metadata pulled lazily via
 * `fetchSearchIndex()` (loom://bundle/search-index.json in native mode,
 * /api/search-index in dev), cached in module memory.
 */
import { useEffect, useRef, useState } from 'react';
import { useSmallScreen } from '../lib/use-small-screen';
import { isNativeMode } from '../lib/is-native-mode';
import { fetchSearchIndex } from '../lib/search-index-client';

type DocMeta = { title: string; href: string; category: string; preview?: string };

let _hrefIndex: Map<string, DocMeta> | null = null;
let _loadPromise: Promise<void> | null = null;

async function loadHrefIndex(): Promise<void> {
  if (_hrefIndex) return;
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    try {
      const r = await fetchSearchIndex();
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
    // Slug is sanitized the same way the server `/api/doc-body` route
    // does before reading the cache file, so URL → filename mapping
    // stays 1:1 under native mode.
    const safeCat = know[1].replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '');
    const safeSlug = know[2].replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '');
    const url = isNativeMode()
      ? `loom://content/knowledge/.cache/docs/${safeCat}__${safeSlug}.json`
      : `/api/doc-body?id=${encodeURIComponent(`know/${safeCat}__${safeSlug}`)}`;
    try {
      const r = await fetch(url);
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
  const smallScreen = useSmallScreen();
  const [hovered, setHovered] = useState<{ x: number; y: number; meta: DocMeta; preview?: string } | null>(null);
  const timer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const insideCard = useRef(false);

  useEffect(() => {
    loadHrefIndex();

    const isInternalDoc = (href: string) =>
      href.startsWith('/wiki/') || href.startsWith('/knowledge/');

    const onMouseOver = (e: MouseEvent) => {
      if (smallScreen) return;
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
      if (smallScreen) return;
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      if (timer.current) window.clearTimeout(timer.current);
      // Delay hide to allow moving onto card
      window.setTimeout(() => {
        if (!insideCard.current) setHovered(null);
      }, 120);
    };

    const openPreview = async (anchor: HTMLAnchorElement) => {
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const path = url.pathname;
      const meta = _hrefIndex?.get(path);
      if (!meta) return;
      const rect = anchor.getBoundingClientRect();
      const preview = await loadPreview(path);
      setHovered({
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.bottom + window.scrollY + 6,
        meta,
        preview,
      });
    };

    const onClick = (e: MouseEvent) => {
      if (!smallScreen) return;
      const a = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
      if (!a || !a.href) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const path = url.pathname;
      if (!isInternalDoc(path)) return;
      const segs = path.split('/').filter(Boolean);
      if (segs[0] === 'wiki' && segs.length !== 2) return;
      if (segs[0] === 'knowledge' && segs.length !== 3) return;
      e.preventDefault();
      e.stopPropagation();
      void openPreview(a);
    };

    const onScroll = () => setHovered(null);

    document.addEventListener('mouseover', onMouseOver);
    document.addEventListener('mouseout', onMouseOut);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('mouseover', onMouseOver);
      document.removeEventListener('mouseout', onMouseOut);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('scroll', onScroll);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [smallScreen]);

  if (!hovered) return null;

  // Clamp to viewport
  const W = 320;
  const left = Math.max(12, Math.min(window.innerWidth - W - 12, hovered.x - W / 2));

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => { insideCard.current = true; }}
      onMouseLeave={() => { insideCard.current = false; setHovered(null); }}
      style={{
        position: smallScreen ? 'fixed' : 'absolute',
        left: smallScreen ? 12 : left,
        right: smallScreen ? 12 : 'auto',
        top: smallScreen ? 'auto' : hovered.y,
        bottom: smallScreen ? 'max(12px, env(safe-area-inset-bottom, 0px) + 8px)' : 'auto',
        zIndex: 95,
        width: smallScreen ? 'auto' : W,
        padding: '0.9rem 1rem',
        color: 'var(--fg)',
        background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
        borderTop: '0.5px solid var(--mat-border)',
        borderBottom: '0.5px solid var(--mat-border)',
        fontSize: '0.85rem', lineHeight: 1.5,
        animation: 'lpFade 0.18s var(--ease-spring)',
        borderRadius: smallScreen ? 14 : 0,
        boxShadow: smallScreen ? 'var(--shadow-1)' : 'none',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontVariant: 'small-caps',
          textTransform: 'lowercase',
          fontSize: '0.72rem',
          letterSpacing: '0.08em',
          color: 'var(--muted)',
          fontWeight: 500,
          marginBottom: 4,
        }}
      >
        {hovered.meta.category}
      </div>
      <div
        style={{
          fontFamily: 'var(--display)',
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: '1.08rem',
          lineHeight: 1.22,
          letterSpacing: '-0.012em',
          marginBottom: 6,
        }}
      >
        {hovered.meta.title}
      </div>
      {hovered.preview && (
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: '0.82rem',
            color: 'var(--fg-secondary)',
            lineHeight: 1.55,
          }}
        >
          {hovered.preview}{hovered.preview.length >= 220 ? '…' : ''}
        </div>
      )}
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <a
          href={hovered.meta.href}
          style={{
            background: 'transparent',
            color: 'var(--accent)',
            border: 0,
            borderBottom: '0.5px solid var(--accent)',
            padding: '3px 0',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontVariant: 'small-caps',
            letterSpacing: '0.06em',
            fontSize: '0.74rem',
            textDecoration: 'none',
            fontWeight: 500,
          }}
          onClick={() => setHovered(null)}
        >open →</a>
      </div>
    </div>
  );
}
