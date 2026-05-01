'use client';
import { useEffect, useState } from 'react';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';
import { preloadWikilinks, resolveWikilinkClient } from '../lib/wikilinks-client';

let _initialised = false;
function ensureMarked() {
  if (_initialised) return;
  marked.use(markedKatex({ throwOnError: false, nonStandard: true }));
  marked.setOptions({ gfm: true, breaks: false });
  _initialised = true;
}

export function NoteRenderer({ source, addIds = false }: { source: string; addIds?: boolean }) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      ensureMarked();
      await preloadWikilinks();
      const tokens: { ph: string; target: string }[] = [];
      let i = 0;
      const withPlaceholders = source.replace(/\[\[([^\]]+?)\]\]/g, (_, target) => {
        const ph = `\u0001WL${i++}\u0001`;
        tokens.push({ ph, target });
        return ph;
      });
      let rendered = await marked.parse(withPlaceholders);
      for (const { ph, target } of tokens) {
        const hit = await resolveWikilinkClient(target);
        if (hit) {
          rendered = rendered.replace(ph,
            `<a href="${hit.href}" class="wikilink" data-resolved="1">${escapeHtml(target)}</a>`);
        } else {
          rendered = rendered.replace(ph,
            `<span class="wikilink-broken" title="No matching doc found">${escapeHtml(target)}</span>`);
        }
      }
      // Add stable ids to h2/h3 so TableOfContents can pick them up
      if (addIds) {
        rendered = rendered.replace(/<(h[23])>([^<]+)<\/\1>/g, (_, tag, text) => {
          const id = slugify(text);
          return `<${tag} id="${id}">${text}</${tag}>`;
        });
      }
      const safe = sanitizeHtml(rendered);
      if (!cancelled) setHtml(safe);
    })();
    return () => { cancelled = true; };
  }, [source, addIds]);

  if (!html && source) {
    return (
      <div className="note-rendered prose-rendered" style={{ whiteSpace: 'pre-wrap' }}>
        {source}
      </div>
    );
  }

  return (
    <div
      className="note-rendered prose-rendered"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// Minimal in-browser HTML sanitizer. Strips script/iframe/object/embed/link/
// meta/base/form/style elements, on* event handlers, and javascript:/data:
// URL schemes. Runs only in client (DOMParser available); SSR returns input
// unchanged (component does not render HTML before useEffect anyway).
//
// Long-term, swap for DOMPurify when a sanitizer dep is added.
const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'style',
]);
const URL_ATTRS = new Set(['href', 'src', 'xlink:href', 'action', 'formaction']);
function sanitizeHtml(dirty: string): string {
  if (typeof DOMParser === 'undefined') return dirty;
  const doc = new DOMParser().parseFromString(`<!DOCTYPE html><body>${dirty}`, 'text/html');
  doc.querySelectorAll(Array.from(DANGEROUS_TAGS).join(',')).forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = (attr.value || '').trim();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (URL_ATTRS.has(name) && /^\s*(javascript|data|vbscript):/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}
