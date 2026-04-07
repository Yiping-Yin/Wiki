'use client';
import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { preloadWikilinks, resolveWikilinkClient } from '../lib/wikilinks-client';

marked.setOptions({ gfm: true, breaks: true });

export function NoteRenderer({ source }: { source: string }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await preloadWikilinks();
      // 1. Replace [[target]] with placeholder anchors before marked
      const tokens: { ph: string; target: string }[] = [];
      let i = 0;
      const withPlaceholders = source.replace(/\[\[([^\]]+?)\]\]/g, (_, target) => {
        const ph = `\u0001WL${i++}\u0001`;
        tokens.push({ ph, target });
        return ph;
      });
      // 2. Run marked
      let rendered = await marked.parse(withPlaceholders);
      // 3. Resolve each placeholder asynchronously
      for (const { ph, target } of tokens) {
        const hit = await resolveWikilinkClient(target);
        if (hit) {
          rendered = rendered.replace(
            ph,
            `<a href="${hit.href}" class="wikilink" data-resolved="1">${escapeHtml(target)}</a>`,
          );
        } else {
          rendered = rendered.replace(
            ph,
            `<span class="wikilink-broken" title="No matching doc found">${escapeHtml(target)}</span>`,
          );
        }
      }
      if (!cancelled) setHtml(rendered);
    })();
    return () => { cancelled = true; };
  }, [source]);

  return (
    <div
      className="note-rendered"
      style={{
        fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--fg)',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
