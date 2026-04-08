'use client';
import { useEffect, useState } from 'react';
import { QuickMath } from './QuickMath';
import { BackLinksSidebar } from './BackLinksSidebar';

type Item = { id: string; text: string; level: number };

export function TableOfContents({ docId, docTitle }: { docId?: string; docTitle?: string } = {}) {
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    let intersectObs: IntersectionObserver | null = null;
    const slugify = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    let lastSig = '';
    const collect = () => {
      const headings = Array.from(main.querySelectorAll('h2, h3')) as HTMLElement[];
      // ensure each heading has an id so anchors work even when content was rendered without one
      headings.forEach((h) => {
        if (!h.id) {
          const slug = slugify(h.textContent ?? '');
          if (slug) h.id = slug;
        }
      });
      const sig = headings.map((h) => `${h.id}:${h.textContent}`).join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      setItems(headings.map((h) => ({
        id: h.id,
        text: h.textContent ?? '',
        level: h.tagName === 'H2' ? 2 : 3,
      })));
      if (intersectObs) intersectObs.disconnect();
      intersectObs = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
        { rootMargin: '-20% 0% -70% 0%' },
      );
      headings.forEach((h) => intersectObs!.observe(h));
    };
    collect();
    // Re-scan whenever the main content mutates (async StructuredView, click-to-generate, etc.)
    let raf = 0;
    const mut = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(collect);
    });
    mut.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      mut.disconnect();
      cancelAnimationFrame(raf);
      if (intersectObs) intersectObs.disconnect();
    };
  }, []);

  return (
    <aside className="toc" style={{
      position: 'sticky', top: '2rem', alignSelf: 'flex-start',
      width: 240, padding: '1rem', fontSize: '0.82rem',
      maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto',
    }}>
      {items.length > 0 && (
        <>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.5rem', fontWeight: 700 }}>
            ≡ On this page
          </div>
          {items.map((it) => (
            <a
              key={it.id}
              href={`#${it.id}`}
              style={{
                display: 'block',
                padding: it.level === 3 ? '0.22rem 0 0.22rem 1.5rem' : '0.26rem 0 0.26rem 0.6rem',
              fontSize: it.level === 3 ? '0.78rem' : '0.82rem',
              opacity: it.level === 3 ? 0.85 : 1,
                color: active === it.id ? 'var(--accent)' : 'var(--muted)',
                borderLeft: active === it.id ? '2.5px solid var(--accent)' : '2.5px solid transparent',
                fontWeight: active === it.id ? 600 : 400,
                lineHeight: 1.4,
              }}
            >
              {it.text}
            </a>
          ))}
        </>
      )}

      <QuickMath />

      {docId && docTitle && <BackLinksSidebar id={docId} title={docTitle} />}
    </aside>
  );
}
