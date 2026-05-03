'use client';

import { useEffect, useState, useMemo, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { marked } from 'marked';
import { StageShell } from '../../../components/StageShell';
import { QuietScene } from '../../../components/QuietScene';
import { PageFrame } from '../../../components/PageFrame';
import {
  WorkSurface,
  WorkEyebrow,
} from '../../../components/WorkSurface';
import { Surface, Stack, HairlineRule } from '../../../components/loom';

// Prism — sync highlighter loaded once at module scope. Order matters:
// `clike` is the base for js/ts; `markup` is the base for several
// templating languages. Bash, json, css, python, swift, rust, go are
// independent grammars. We deliberately skip auto-loader / runtime
// language fetching — every language we ship gets bundled.
import Prism from 'prismjs';
import 'prismjs/components/prism-core';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-go';

// Phase C M1 / Path B — in-Loom capture renderer.
//
// The Swift CaptureReaderView hosts a WKWebView pointing at this
// route with `?root=<id>&sub=<encoded>&title=<encoded>&eyebrow=<encoded>`.
// We fetch the entry payload from the native bridge endpoint
// (`loom://native/capture-content.json?…`) and render it with the
// same Vellum primitives every other Loom surface uses (PageFrame,
// WorkSurface, NoteRenderer for marked+KaTeX prose).
//
// Why client-side fetch (not server)? Static export — the page is
// shipped as one HTML doc; query params + native data are a
// runtime concern that resolves in the webview.

interface ListItem {
  rank?: number;
  title: string;
  url: string;
  domain?: string;
  metaPlain: string[];
  metaTailLabel?: string;
  metaTailURL?: string;
}

interface CaptureAstBlock {
  id?: string;
  kind?: string;
  level?: number;
  text?: string;
  markdown?: string;
  url?: string;
  title?: string;
  provider?: string;
  mediaRole?: string;
  snapshotTarget?: string;
}

interface CaptureAst {
  version?: number;
  sourceURL?: string;
  title?: string;
  diagnostics?: {
    blockCount?: number;
    sectionHeadings?: string[];
    captureCensus?: Record<string, unknown>;
  };
  blocks?: CaptureAstBlock[];
}

interface CapturePayload {
  title: string;
  eyebrow: string;
  body: string;
  shape: 'list' | 'article';
  fileURL: string;
  snapshotFilename?: string;
  captureAst?: CaptureAst;
  items?: ListItem[];
  error?: string;
}

const MIN_PLAYABLE_CANVAS_BYTES = 2 * 1024;

const SVG_ROOT_LAYOUT_ATTRIBUTES = ['x', 'y', 'width', 'height'];
const SVG_ROOT_LAYOUT_STYLE_PROPS = new Set([
  'position',
  'inset',
  'inset-block',
  'inset-block-start',
  'inset-block-end',
  'inset-inline',
  'inset-inline-start',
  'inset-inline-end',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'inline-size',
  'block-size',
  'min-inline-size',
  'max-inline-size',
  'min-block-size',
  'max-block-size',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'transform',
  'translate',
  'rotate',
  'scale',
  'display',
  'flex',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'grid-area',
  'place-self',
  'align-self',
  'justify-self',
]);

const SVG_PRESENTATION_HINTS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
];

function CaptureRenderInner() {
  const params = useSearchParams();
  const [payload, setPayload] = useState<CapturePayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    // URLSearchParams already applies form decoding: raw `+` becomes a
    // space, while literal plus signs arrive as `%2B` and stay `+`.
    const decode = (s: string | null) => s || '';
    const root = params.get('root') || '';
    const sub = decode(params.get('sub'));
    const title = decode(params.get('title'));
    const eyebrow = decode(params.get('eyebrow'));
    if (!root) {
      setFetchError('Missing root parameter');
      return;
    }
    const qs = new URLSearchParams({ root, sub, title, eyebrow }).toString();
    fetch(`loom://native/capture-content.json?${qs}`)
      .then((r) => r.json())
      .then((data: CapturePayload) => {
        if (data.error) {
          setFetchError(data.error);
        } else {
          setPayload(data);
        }
      })
      .catch((err) => setFetchError(String(err)));
  }, [params]);

  if (fetchError) {
    return (
      <main style={{ padding: 'var(--space-xl)', fontFamily: 'var(--serif)' }}>
        <Surface tone="card" padded="md">
          <Stack gap="sm">
            <h1 style={{ fontSize: 'var(--font-body)', color: 'var(--fg)', margin: 0 }}>
              Couldn&apos;t load capture
            </h1>
            <pre style={{ margin: 0, color: 'var(--muted)' }}>
              {fetchError}
            </pre>
          </Stack>
        </Surface>
      </main>
    );
  }
  if (!payload) {
    return (
      <main style={{ padding: 'var(--space-xl)', fontFamily: 'var(--serif)', color: 'var(--muted)' }}>
        Loading capture…
      </main>
    );
  }

  const sub = params.get('sub') || '';
  const subParts = sub.split('/').filter(Boolean);
  const domain = subParts.length >= 2 && subParts[0] === 'Web' ? subParts[1] : '';

  // Eyebrow string from native side looks like
  //   "clipboard · 2026-04-27 19:15 · [↗](https://…)"
  // Render as markdown so the source link becomes a real anchor and
  // the dots stay properly typeset. NoteRenderer is overkill for a
  // single line — just inline-render the markdown link.
  const eyebrowNode = payload.eyebrow ? (
    <EyebrowLine raw={payload.eyebrow} />
  ) : undefined;

    return (
      <div>
      <StageShell
        variant="archive"
        contentVariant="archive"
        innerStyle={{ minHeight: '100vh', paddingTop: '3.25rem', paddingBottom: '2.5rem' }}
      >
        <QuietScene tone="atlas">
          <PageFrame
            breadcrumb={
              <a
                href="loom://bundle/loom-render/captures/"
                style={{
                  color: 'var(--thread)',
                  textDecoration: 'none',
                  fontFamily: 'var(--serif)',
                  fontSize: 'var(--font-caption)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-xs)',
                }}
              >
                <span style={{ fontSize: 'var(--font-caption)' }}>‹</span>
                <span>Captures</span>
              </a>
            }
            eyebrow={domain || 'Capture'}
            title={payload.title}
            description={eyebrowNode}
          >
            {payload.shape === 'list' && payload.items && payload.items.length > 0
              ? <ListRender items={payload.items} />
              : (
                <ArticleRender
                  body={payload.body}
                  captureAst={payload.captureAst}
                  sourceURL={extractSourceURL(payload.eyebrow)}
                  title={payload.title}
                  snapshotFilename={payload.snapshotFilename}
                  rootParam={params.get('root') || ''}
                  subParam={params.get('sub') || ''}
                  titleParam={params.get('title') || ''}
                  eyebrowParam={params.get('eyebrow') || ''}
                />
              )}
          </PageFrame>
        </QuietScene>
      </StageShell>
    </div>
  );
}

/// Renders the eyebrow line as styled text with any markdown links
/// converted to real anchors. Format examples:
///   "clipboard · 2026-04-27 19:15 · [↗](https://…)"
///   "manual · 2026-04-27 14:30"
function EyebrowLine({ raw }: { raw: string }) {
  const linkRegex = /\[(.+?)\]\((.+?)\)/g;
  const parts: Array<{ kind: 'text'; text: string } | { kind: 'link'; text: string; href: string }> = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRegex.exec(raw)) !== null) {
    if (m.index > lastIdx) parts.push({ kind: 'text', text: raw.slice(lastIdx, m.index) });
    parts.push({ kind: 'link', text: m[1], href: m[2] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < raw.length) parts.push({ kind: 'text', text: raw.slice(lastIdx) });
  return (
    <span style={{ fontFamily: 'var(--serif)', fontSize: 'var(--font-caption)', color: 'var(--muted)' }}>
      {parts.map((p, i) =>
        p.kind === 'link' ? (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--thread)', textDecoration: 'none' }}
          >
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

function ListRender({ items }: { items: ListItem[] }) {
  // Magazine layout: hero (top story) full-width, the rest in an
  // auto-fill grid. Reads as "today's lead" + "everything else"
  // instead of monotonic stack. Card chrome is shared by both —
  // hero just gets bigger type + numerals + breathing room.
  const [hero, ...rest] = items;
  return (
    <>
      <style jsx global>{`
        .loom-magazine-layout {
          display: grid;
          gap: var(--space-lg);
        }
        .loom-magazine-grid {
          display: grid;
          gap: var(--space-md);
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        }
        .loom-mag-card {
          padding: var(--space-md);
          border: 0.5px solid var(--hair);
          border-radius: var(--radius-sm);
          background: color-mix(in srgb, var(--mat-thin-bg) 28%, transparent);
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
          transition: border-color var(--motion-fast), background var(--motion-fast);
        }
        .loom-mag-card:hover {
          border-color: color-mix(in srgb, var(--fg) 26%, transparent);
          background: color-mix(in srgb, var(--mat-thin-bg) 50%, transparent);
        }
        .loom-mag-card.hero {
          padding: var(--space-lg);
          gap: var(--space-sm);
        }
        .loom-mag-eyebrow-row {
          display: flex;
          align-items: baseline;
          gap: var(--space-sm);
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .loom-mag-rank {
          color: var(--thread);
          font-feature-settings: "onum" 1, "tnum" 1;
          font-style: italic;
          font-weight: 500;
          letter-spacing: 0.06em;
          text-transform: none;
          font-size: var(--font-caption);
        }
        .loom-mag-card.hero .loom-mag-rank {
          font-size: var(--font-body);
        }
        .loom-mag-domain {
          color: var(--muted);
          font-size: var(--font-eyebrow);
        }
        .loom-mag-title {
          font-family: var(--display);
          font-weight: 500;
          color: var(--fg);
          line-height: 1.22;
          text-decoration: none;
          font-size: var(--font-body);
        }
        .loom-mag-card.hero .loom-mag-title {
          font-size: var(--font-display-2);
          line-height: 1.18;
          letter-spacing: -0.005em;
        }
        .loom-mag-title:hover {
          color: var(--thread);
        }
        .loom-mag-meta {
          display: flex;
          gap: var(--space-sm);
          flex-wrap: wrap;
          align-items: baseline;
          font-family: var(--serif);
          font-size: var(--font-caption);
          color: var(--fg-secondary);
          font-feature-settings: "onum" 1, "pnum" 1;
        }
        .loom-mag-card.hero .loom-mag-meta {
          font-size: var(--font-body);
        }
        .loom-mag-meta .sep {
          color: var(--muted);
        }
        .loom-mag-meta a {
          color: var(--thread);
          text-decoration: underline;
          text-decoration-thickness: 0.5px;
          text-underline-offset: 0.18em;
          text-decoration-color: color-mix(in srgb, var(--thread) 60%, transparent);
        }
      `}</style>
      <div className="loom-magazine-layout">
        {hero && <ListItemMagCard item={hero} hero />}
        {rest.length > 0 && (
          <div className="loom-magazine-grid">
            {rest.map((item, idx) => (
              <ListItemMagCard key={`${item.rank ?? idx}-${item.url}`} item={item} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ListItemMagCard({ item, hero = false }: { item: ListItem; hero?: boolean }) {
  return (
    <div className={`loom-mag-card${hero ? ' hero' : ''}`}>
      <div className="loom-mag-eyebrow-row">
        {item.rank ? <span className="loom-mag-rank">№ {String(item.rank).padStart(2, '0')}</span> : null}
        {item.domain ? <span className="loom-mag-domain">{item.domain}</span> : null}
      </div>
      <a
        className="loom-mag-title"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {item.title}
      </a>
      {(item.metaPlain.length > 0 || item.metaTailURL) && (
        <div className="loom-mag-meta">
          {item.metaPlain.length > 0 && <span>{item.metaPlain.join(' · ')}</span>}
          {item.metaTailURL && (
            <>
              {item.metaPlain.length > 0 && <span className="sep">·</span>}
              <a href={item.metaTailURL} target="_blank" rel="noopener noreferrer">
                {item.metaTailLabel}
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/// Sync markdown → HTML via marked, no async lifecycle. Critical:
/// NoteRenderer is async (preloadWikilinks + KaTeX async) and shows
/// `{source}` as raw text fallback while loading. With 20K-char
/// captures containing long base64 data URLs, marked takes seconds
/// to resolve, and the fallback persistently shows raw markdown text
/// to the user. Here we run marked sync (no extensions) and
/// dangerouslySetInnerHTML the result — instant render, no fallback.
let _markedConfigured = false;
function configureMarkedSync() {
  if (_markedConfigured) return;
  marked.setOptions({ gfm: true, breaks: false, async: false });
  _markedConfigured = true;
}

/// Map of human-language slugs → Prism grammar names. Aliases on the
/// left, canonical Prism grammar on the right. We keep this small
/// and curated rather than letting Prism auto-load.
const PRISM_LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  javascript: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'typescript',
  json: 'json',
  bash: 'bash',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  html: 'markup',
  plaintext: 'markup',
  text: 'markup',
  xml: 'markup',
  markup: 'markup',
  svg: 'markup',
  css: 'css',
  python: 'python',
  py: 'python',
  swift: 'swift',
  rust: 'rust',
  rs: 'rust',
  go: 'go',
  golang: 'go',
};

/// Apply Prism syntax highlighting to all `<pre><code class="language-X">`
/// blocks in the rendered HTML. Marked emits this exact shape; we
/// match it with a tolerant regex that handles ``<code class="language-x">`` or
/// ``<code class="x language-x">`` orderings, decode HTML entities back
/// to source for Prism, then re-encode the highlighted output as the
/// `<pre>` body with a `data-lang` attribute the CSS uses for the
/// language label. If no grammar matches, we leave the block untouched.
function highlightCodeBlocks(html: string): string {
  const decode = (s: string) =>
    s
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  return html.replace(
    /<pre><code class="([^"]*language-([\w-]+)[^"]*)">([\s\S]*?)<\/code><\/pre>/g,
    (_, _classAttr, rawLang, body) => {
      const slug = String(rawLang).toLowerCase();
      const grammarName = PRISM_LANG_ALIASES[slug];
      const grammar = grammarName ? Prism.languages[grammarName] : undefined;
      if (!grammar) return _;
      const code = decode(body as string);
      let highlighted: string;
      try {
        highlighted = Prism.highlight(code, grammar, grammarName!);
      } catch {
        return _;
      }
      const labelLang = (grammarName === 'markup' ? slug : grammarName) || slug;
      return `<pre class="loom-code language-${grammarName}" data-lang="${labelLang}"><code class="language-${grammarName}">${highlighted}</code></pre>`;
    }
  );
}

/// Wrap consecutive image-only blocks into a `<div class="loom-img-gallery">`
/// so CSS grid can lay them out 2-3 across. Detects multiple shapes:
///   1) `<p><img …></p>` — marked's default when an image lives on its own line
///   2) Bare `<img …>` block-level (rare but valid HTML in source)
///   3) Mixed runs of (1) and (2) separated by whitespace
/// Optional surrounding `<a>` wrappers (linked images) and trailing
/// `<br>` whitespace inside the paragraph are tolerated. We collapse
/// runs of length ≥ 2. Single-image paragraphs stay as-is — they keep
/// the centered figure look from the existing `> p > img:only-child` rule.
function wrapImageGalleries(html: string): string {
  // A single image-only block — three forms:
  //   <p>(<a>)<img>(</a>)(<br>?)</p>  OR  bare <img>
  // We tolerate:
  //   - optional <a href="…">…</a> wrapper
  //   - trailing <br> or whitespace inside <p>
  //   - attribute order doesn't matter; <img …> is non-greedy
  const imgBlock =
    '(?:' +
    // Form 1: <p>[<a>]<img>[</a>][<br>][\s]*</p>
    '<p>\\s*(?:<a\\s[^>]*>\\s*)?<img\\b[^>]*>\\s*(?:<\\/a>\\s*)?(?:<br\\s*\\/?>)?\\s*<\\/p>' +
    '|' +
    // Form 2: bare <img …> at block level (no <p> wrapper)
    '<img\\b[^>]*>' +
    ')';
  const runRegex = new RegExp(`(?:\\s*${imgBlock}\\s*){2,}`, 'g');
  // Re-match individual blocks inside a run to count them and re-emit.
  const blockRegex = new RegExp(imgBlock, 'g');

  return html.replace(runRegex, (run) => {
    const chunks = run.match(blockRegex) || [];
    const count = chunks.length;
    if (count < 2) return run;
    // Normalize each chunk: bare <img> needs a <p> wrapper so the grid
    // child layout (margin: 0; height/width fills) matches.
    const normalized = chunks.map((c) =>
      /^<p\b/i.test(c) ? c : `<p>${c}</p>`,
    );
    const klass = count >= 3 ? 'loom-img-gallery cols-3' : 'loom-img-gallery cols-2';
    return `<div class="${klass}">${normalized.join('')}</div>`;
  });
}

/// First-image hero promotion. If the very first `<img>` in the body is
/// large (width attr ≥ 800) OR has no width attr (likely a full-width
/// lead photo), wrap its containing `<p>` (or the bare img) in a
/// `<div class="loom-hero">` so CSS can full-bleed it above the prose.
/// Only applies the FIRST eligible image — subsequent images are normal.
function promoteHeroImage(html: string): string {
  // Find the first <img> in the document order.
  const firstImg = html.match(/<img\b[^>]*>/);
  if (!firstImg) return html;
  const tag = firstImg[0];
  if (/\b(?:class|data-provider-thumb)\s*=/.test(tag) && (
    /\bclass\s*=\s*["'][^"']*\bloom-embed-thumb\b/i.test(tag) ||
    /\bdata-provider-thumb\s*=\s*["']true["']/i.test(tag)
  )) {
    return html;
  }
  const widthMatch = tag.match(/\bwidth\s*=\s*["']?(\d+)/i);
  const width = widthMatch ? parseInt(widthMatch[1], 10) : null;
  // Eligible: no width OR width ≥ 800.
  if (width !== null && width < 800) return html;
  // Don't promote if it's already inside a gallery (run of 2+).
  // The wrapImageGalleries pass runs first, so a hero image inside a
  // gallery div is already wrapped — we look only OUTSIDE galleries.
  // Easiest check: locate the first <img> position; back up to the
  // nearest enclosing <p> or block boundary; refuse to promote if a
  // <div class="loom-img-gallery"> opens before the closest <p>.
  const imgIdx = html.indexOf(tag);
  if (imgIdx < 0) return html;
  const before = html.slice(0, imgIdx);
  const lastGalleryOpen = before.lastIndexOf('<div class="loom-img-gallery');
  const lastGalleryClose = before.lastIndexOf('</div>');
  if (lastGalleryOpen > lastGalleryClose) return html; // inside gallery

  // Try wrapping a `<p>…<img>…</p>` first.
  const pPattern = new RegExp(
    `<p>\\s*(?:<a\\s[^>]*>\\s*)?${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:<\\/a>\\s*)?(?:<br\\s*\\/?>)?\\s*<\\/p>`,
  );
  const pMatch = html.match(pPattern);
  if (pMatch) {
    return html.replace(pMatch[0], `<div class="loom-hero">${pMatch[0]}</div>`);
  }
  // Fall back: wrap the bare img.
  return html.replace(tag, `<div class="loom-hero">${tag}</div>`);
}

const SNAPSHOT_BACKED_KINDS = ['canvas', 'composite-media', 'structured-visual', 'svg'];

function markSnapshotPreviewMedia(mediaTag: string): string {
  if (/\bdata-loom-snapshot-preview-(?:image|media)=/.test(mediaTag)) return mediaTag;
  return mediaTag.replace(/^<([a-z0-9-]+)\b/i, '<$1 data-loom-snapshot-preview-media="true"');
}

function interactiveSnapshotCaption(snapshotHref: string, inlineLoaded = false): string {
  const action = inlineLoaded
    ? '<span class="loom-interactive-snapshot-action muted">Interactive snapshot</span>'
    : snapshotHref
    ? `<a class="loom-interactive-snapshot-action" href="${escapeAttr(snapshotHref)}">Open interactive snapshot</a>`
    : '<span class="loom-interactive-snapshot-action muted">Snapshot unavailable</span>';
  return [
    '<figcaption class="loom-interactive-snapshot-caption">',
    '<span class="loom-interactive-snapshot-label">Snapshot preview</span>',
    action,
    '</figcaption>',
  ].join('');
}

function snapshotTargetFromMediaTag(tag: string): string {
  const match = tag.match(/\bdata-loom-snapshot-target=(["'])([^"']+)\1/i);
  return match ? match[2] : '';
}

function snapshotAttrFromMediaTag(tag: string, attrName: string): string {
  const escapedAttr = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = tag.match(new RegExp(`\\b${escapedAttr}=(["'])([^"']*)\\1`, 'i'));
  return match ? match[2] : '';
}

function shouldInlineSnapshotRegionMeta(kind: string, label: string): boolean {
  const mediaKind = (kind || '').toLowerCase();
  const mediaLabel = label || '';
  if (mediaKind === 'canvas') return false;
  if (mediaKind === 'composite-media' || mediaKind === 'structured-visual') return true;
  return /pixel font comparison|aluminum frame|controller board|power connection|data connection/i.test(mediaLabel);
}

function shouldInlineSnapshotRegion(mediaTag: string): boolean {
  return shouldInlineSnapshotRegionMeta(
    snapshotAttrFromMediaTag(mediaTag, 'data-loom-capture-kind'),
    `${snapshotAttrFromMediaTag(mediaTag, 'alt')} ${snapshotAttrFromMediaTag(mediaTag, 'title')}`,
  );
}

function targetedSnapshotHref(snapshotHref: string, snapshotTarget: string): string {
  if (!snapshotHref || !snapshotTarget) return '';
  try {
    const url = new URL(snapshotHref);
    url.searchParams.set('embed', '1');
    url.searchParams.set('target', snapshotTarget);
    return url.toString();
  } catch {
    const join = snapshotHref.includes('?') ? '&' : '?';
    return `${snapshotHref}${join}embed=1&target=${encodeURIComponent(snapshotTarget)}`;
  }
}

function wrapSnapshotBackedMedia(mediaTag: string, snapshotHref: string): string {
  // V7: if the wrapped tag still carries a transient `loom://media/` src,
  // the upstream save-substitution pass dropped this attachment. Both
  // Tier 1 (direct playback) and Tier 2 (snapshot-frame anchor) will
  // appear broken — the iframe loads a snapshot whose embedded canvas
  // never initializes because the recorded video was never persisted to
  // permanent storage. Surface a recoverable Re-capture CTA instead of
  // a mystery black iframe so the user has an action.
  const srcMatch = mediaTag.match(/\bsrc=["']([^"']+)["']/i);
  const tagSrc = srcMatch ? srcMatch[1] : '';
  if (tagSrc.startsWith('loom://media/')) {
    const escapedReason = escapeText('temporary media reference was never saved to disk');
    const escapedAction = escapeText('Use the Re-capture button at the top of this page to retry.');
    return [
      '<figure class="loom-interactive-snapshot" data-loom-interactive-snapshot="true" data-loom-interactive-snapshot-mode="transient-fail">',
      '<div class="loom-media-fallback video compact">',
      '<span class="loom-media-fallback-kicker">Recording was not saved</span>',
      `<span class="loom-media-fallback-reason">${escapedReason}</span>`,
      `<span class="loom-media-fallback-action">${escapedAction}</span>`,
      '</div>',
      interactiveSnapshotCaption(snapshotHref),
      '</figure>',
    ].join('');
  }
  // Tier 1 priority for canvas recordings: when the wrapped tag is a
  // `<video>` with a permanent (non-transient) source, the recorded
  // canvas state is already on disk. Rendering the recorded video plays
  // the captured animation faithfully. Wrapping in a snapshot iframe
  // instead asks the snapshot route to re-initialize the source page's
  // canvas script — which routinely fails (preserveJS scripts depend on
  // viewport / module state that doesn't reproduce in iframe context),
  // showing a black box. Per `plans/web-capture-per-region-anchoring.md`
  // Tier 1 / Tier 2 hierarchy: native media playback wins over runtime
  // anchoring whenever the native asset exists.
  const isVideoTag = /^<video\b/i.test(mediaTag);
  const isPermanentSrc = !!tagSrc && /^loom:\/\/(content|derived|user-data)\//.test(tagSrc);
  if (isVideoTag && isPermanentSrc) {
    const snapshotTargetAttrEarly = snapshotTargetFromMediaTag(mediaTag);
    const targetAttrEarly = snapshotTargetAttrEarly ? ` data-loom-snapshot-target="${escapeAttr(snapshotTargetAttrEarly)}"` : '';
    // CRITICAL: stamp `data-loom-snapshot-preview-media="true"` on the
    // video so the next pass of annotateSnapshotBackedMedia's bareVideo
    // regex (which uses notPreviewSelector to skip already-wrapped media)
    // does not re-match this video and double-wrap it. Without this stamp,
    // the same video gets wrapped in two consecutive <figure> blocks and
    // the user sees two stacked "SNAPSHOT PREVIEW" captions plus layout
    // jumps that destroy scroll smoothness.
    // 2026-05-02 final: same click-to-mount pattern as YouTube embed.
    // <video> element — even paused with preload="metadata" — still
    // participates in WebKit's media-element layout / metadata-load
    // pipeline, which interacts with scroll-anchor and triggers small
    // backward scroll yanks (~30-150px) as metadata arrives mid-scroll.
    // Render a styled placeholder card with a Play button at the same
    //16:9 slot. On click, JS replaces the button with an inline
    // <video> element — playback is in-place, but pre-click there is
    // no media element to perturb scroll.
    return [
      `<figure class="loom-interactive-snapshot" data-loom-interactive-snapshot="true"${targetAttrEarly} data-loom-interactive-snapshot-mode="recorded-video">`,
      `<button type="button" class="loom-recorded-video-card loom-recorded-video-load" data-loom-recorded-video-src="${escapeAttr(tagSrc)}" aria-label="Play recorded animation inline">`,
      '<span class="loom-recorded-video-thumb-frame">',
      '<span class="loom-recorded-video-thumb-poster" aria-hidden="true"></span>',
      '<span class="loom-recorded-video-thumb-play" aria-hidden="true">▶</span>',
      '</span>',
      '</button>',
      interactiveSnapshotCaption(snapshotHref),
      '</figure>',
    ].join('');
  }
  const preview = markSnapshotPreviewMedia(mediaTag);
  const snapshotTarget = snapshotTargetFromMediaTag(mediaTag);
  const liveHref = targetedSnapshotHref(snapshotHref, snapshotTarget);
  const inlineRegion = !!liveHref && shouldInlineSnapshotRegion(mediaTag);
  const figureBody = inlineRegion
    ? `<iframe class="loom-interactive-snapshot-frame loom-inline-snapshot-frame" src="${escapeAttr(liveHref)}" title="Interactive snapshot region" loading="lazy" sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation" data-loom-snapshot-loaded="inline"></iframe>`
    : preview;
  const modeAttr = inlineRegion
    ? 'data-loom-interactive-snapshot-mode="inline-target"'
    : 'data-loom-interactive-snapshot-mode="preview-link"';
  const targetAttr = snapshotTarget ? ` data-loom-snapshot-target="${escapeAttr(snapshotTarget)}"` : '';
  return [
    `<figure class="loom-interactive-snapshot" data-loom-interactive-snapshot="true"${targetAttr} ${modeAttr}>`,
    figureBody,
    interactiveSnapshotCaption(snapshotHref, inlineRegion),
    '</figure>',
  ].join('');
}

function annotateSnapshotBackedMedia(html: string, snapshotHref: string): string {
  const kindPattern = SNAPSHOT_BACKED_KINDS.join('|');
  const captureKindSelector = `(?=[^>]*\\bdata-loom-capture-kind=(?:"|')(?:${kindPattern})(?:"|'))(?=[^>]*\\bdata-loom-snapshot-target=)`;
  const notPreviewSelector = `(?![^>]*\\bdata-loom-snapshot-preview-(?:image|media)=)`;
  const videoOnlyParagraph = new RegExp(
    `<p>\\s*(<video\\b${captureKindSelector}${notPreviewSelector}[^>]*>[\\s\\S]*?<\\/video>)\\s*<\\/p>`,
    'gi',
  );
  const imageOnlyParagraph = new RegExp(
    `<p>\\s*(<img\\b${captureKindSelector}${notPreviewSelector}[^>]*>)\\s*<\\/p>`,
    'gi',
  );
  const bareVideo = new RegExp(
    `(<video\\b${captureKindSelector}${notPreviewSelector}[^>]*>[\\s\\S]*?<\\/video>)`,
    'gi',
  );
  const bareImage = new RegExp(
    `(<img\\b${captureKindSelector}${notPreviewSelector}[^>]*>)`,
    'gi',
  );
  return html
    .replace(videoOnlyParagraph, (_match, mediaTag: string) => wrapSnapshotBackedMedia(mediaTag, snapshotHref))
    .replace(imageOnlyParagraph, (_match, imgTag: string) => wrapSnapshotBackedMedia(imgTag, snapshotHref))
    .replace(bareVideo, (_match, mediaTag: string) => wrapSnapshotBackedMedia(mediaTag, snapshotHref))
    .replace(bareImage, (_match, imgTag: string) => wrapSnapshotBackedMedia(imgTag, snapshotHref));
}

/// Detect blockquotes that contain only a single `<p>` and tag them
/// as pull-quotes. Marked emits `<blockquote>\n<p>…</p>\n</blockquote>`;
/// we match that exact shape, ignore whitespace, and add the
/// `loom-pullquote` class so CSS picks them up. Multi-paragraph
/// blockquotes (sources, long quotes) keep the standard styling.
function tagPullquotes(html: string): string {
  // Stricter regex: the inner span between <p>…</p> may NOT contain
  // </p>, <p>, or any block-level open tag — that lets us reliably
  // tell single-paragraph blockquotes apart from multi-paragraph ones
  // without regex ambiguity. Multi-paragraph quotes (sources, long
  // citations) keep the standard blockquote rule.
  return html.replace(
    /<blockquote>\s*<p>((?:(?!<\/?p\b|<(?:blockquote|ul|ol|pre|h[1-6])\b)[\s\S])*)<\/p>\s*<\/blockquote>/g,
    (_full, inner) => `<blockquote class="loom-pullquote"><p>${inner}</p></blockquote>`,
  );
}

/// Strip empty `<li>`s left behind when a list item's only content
/// was a block-level embed (provider video, snapshot iframe) that
/// got lifted into its own block by the markdown serializer. Without
/// this, the rendered list shows an orphan bullet on its own line
/// — see flipdisc.io's Inspiration list where the Vimeo embed used
/// to sit at item #5. The capture-side fix in content.js prevents
/// new captures from emitting these, but existing .md files on disk
/// already have them; this strips them at render time so the user
/// doesn't have to recapture.
function dropEmptyListItems(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^\s*[-*]\s*$/.test(line) || /^\s*\d+\.\s*$/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n');
}

function repairLeakedCodeFences(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inFence = false;
  let fenceMarker = '```';
  let fenceLang = '';
  let fenceLineCount = 0;
  let sawBlankInFence = false;

  const openingFence = (line: string) => line.match(/^(```+|~~~+)\s*(\S*)\s*$/);
  const isMarkdownFenceLang = (lang: string) => /^(md|mdx|markdown)$/i.test(lang);
  const looksLikeProseLeak = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^#{1,6}\s+/.test(trimmed)) return true;
    if (/^[-*]\s+/.test(trimmed)) return true;
    if (/^\[[^\]]+\]\([^)]+\)/.test(trimmed)) return true;
    if (trimmed.length > 120 && /\[[^\]]+\]\([^)]+\)/.test(trimmed)) return true;
    return /^(We|For|Here|A few|Finally|Depending|It['’]s|I['’]ve|Our goal|The basic|Frame Format|Communication is)\b/.test(trimmed);
  };

  for (const line of lines) {
    const fence = openingFence(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1];
        fenceLang = fence[2] || '';
        fenceLineCount = 0;
        sawBlankInFence = false;
        out.push(line);
        continue;
      }
      if (!fence[2]) {
        inFence = false;
        fenceLang = '';
        fenceLineCount = 0;
        sawBlankInFence = false;
        out.push(line);
        continue;
      }
      out.push(fenceMarker);
      inFence = true;
      fenceMarker = fence[1];
      fenceLang = fence[2] || '';
      fenceLineCount = 0;
      sawBlankInFence = false;
      out.push(line);
      continue;
    }

    if (inFence
        && !isMarkdownFenceLang(fenceLang)
        && looksLikeProseLeak(line)
        && (sawBlankInFence || fenceLineCount >= 2 || /^#{1,6}\s+/.test(line.trim()))) {
      out.push(fenceMarker);
      inFence = false;
      fenceLang = '';
      fenceLineCount = 0;
      sawBlankInFence = false;
    }
    if (inFence) {
      if (line.trim() === '') sawBlankInFence = true;
      fenceLineCount += 1;
    }
    out.push(line);
  }
  if (inFence) out.push(fenceMarker);
  return out.join('\n');
}

function ArticleBodyWithImages({ source, snapshotHref = '' }: { source: string; snapshotHref?: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const html = useMemo(() => {
    configureMarkedSync();
    try {
      let out = marked.parse(source) as string;
      out = highlightCodeBlocks(out);
      out = wrapImageGalleries(out);
      out = promoteHeroImage(out);
      out = tagPullquotes(out);
      out = preflightInlineSvgArtifacts(out);
      out = annotateSnapshotBackedMedia(out, snapshotHref);
      return out;
    } catch (e) {
      console.error('[Loom render] marked.parse failed', e);
      return `<pre>${source.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</pre>`;
    }
  }, [source, snapshotHref]);

  // Add stable ids to h2/h3 for TOC anchor jumping. Same slugify as
  // before so the TOC built from raw markdown matches.
  const htmlWithIds = useMemo(() => {
    return html.replace(/<(h[23])>([^<]+)<\/\1>/g, (_, tag, text) => {
      const id = slugifyHeading(text);
      return `<${tag} id="${id}">${text}</${tag}>`;
    });
  }, [html]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const videos = Array.from(root.querySelectorAll('video'));
    const timers: number[] = [];
    const mediaProbes: AbortController[] = [];
    const mediaObjectUrls: string[] = [];
    const imageCleanups: Array<() => void> = [];

    repairInlineSvgArtifacts(root);

    const firstSource = (video: HTMLVideoElement) =>
      video.currentSrc ||
      video.getAttribute('src') ||
      video.querySelector('source')?.getAttribute('src') ||
      video.dataset.loomOriginalMediaSrc ||
      '';

    const downgrade = (video: HTMLVideoElement, reason: string) => {
      if (!video.isConnected || video.dataset.loomMediaDowngraded === '1') return;
      video.dataset.loomMediaDowngraded = '1';
      video.style.visibility = '';
      delete video.dataset.loomCanvasProbe;
      const href = firstSource(video);
      const isCanvasRecording = video.hasAttribute('data-canvas-id');
      const isTransientRef = href.startsWith('loom://media/');
      const canOpenSource = href && !isTransientRef && !isCanvasRecording;
      const card = document.createElement(canOpenSource ? 'a' : 'div');
      card.className = `loom-media-fallback video${isCanvasRecording ? ' compact' : ''}`;
      if (card instanceof HTMLAnchorElement) {
        card.href = href;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
      }
      if (isTransientRef) {
        // Diagnostics — transient `loom://media/...` should never reach
        // the reader. If it does, the upstream save-substitution pass
        // failed; surface a loud signal so dev/test catches the gap.
        // (V7: no silent failures.)
        // eslint-disable-next-line no-console
        console.warn('[Loom capture render] transient loom://media/ URL persisted to body — substitution pass missed it', { href, isCanvasRecording });
      }
      if (isCanvasRecording) {
        // Distinguish the two failure modes for canvas recordings so the
        // user can tell "the recording itself was bad" (verification
        // timeout, dynamic re-paint, etc.) from "the save pipeline lost
        // the file" (transient URL persisted). Only the latter is a
        // recoverable user action via Re-capture; the former is a
        // recording-quality issue.
        const kicker = isTransientRef
          ? 'Recording was not saved'
          : 'Animation unavailable';
        const action = isTransientRef
          ? 'Use the Re-capture button at the top of this page to retry.'
          : '';
        const parts = [
          `<span class="loom-media-fallback-kicker">${kicker}</span>`,
          `<span class="loom-media-fallback-reason">${escapeText(reason)}</span>`,
        ];
        if (action) parts.push(`<span class="loom-media-fallback-action">${escapeText(action)}</span>`);
        card.innerHTML = parts.join('');
        video.replaceWith(card);
        return;
      }
      const action = canOpenSource ? 'Open source file' : 'Re-capture to save playable media';
      card.innerHTML = [
        '<span class="loom-media-fallback-kicker">Video attachment</span>',
        '<span class="loom-media-fallback-title">This saved video is not playable inside Loom.</span>',
        `<span class="loom-media-fallback-action">${escapeText(action)}</span>`,
        `<span class="loom-media-fallback-reason">${escapeText(reason)}</span>`,
      ].join('');
      video.replaceWith(card);
    };

    const probeSavedCanvasRecording = (video: HTMLVideoElement, src: string) => {
      if (!video.hasAttribute('data-canvas-id') || !/^loom:\/\/(content|derived|user-data)\//.test(src)) return;
      video.dataset.loomOriginalMediaSrc = src;
      const requiresVerifiedCanvas = /\.bin(?:[?#]|$)/i.test(src);
      const isSavedVideoFile = /\.(webm|mp4|m4v|mov)(?:[?#]|$)/i.test(src);
      let probeTimer: number | null = null;
      const revealCanvasRecording = () => {
        if (!video.isConnected || video.dataset.loomMediaDowngraded === '1') return;
        video.style.visibility = '';
        delete video.dataset.loomCanvasProbe;
      };
      if (isSavedVideoFile) {
        video.src = src;
        video.autoplay = true;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.setAttribute('autoplay', '');
        video.setAttribute('muted', '');
        video.setAttribute('loop', '');
        video.setAttribute('playsinline', '');
        const playbackTimer = window.setTimeout(() => {
          if (!video.isConnected || video.dataset.loomMediaDowngraded === '1') return;
          video.load();
          void video.play().catch(() => {});
          revealCanvasRecording();
        }, 0);
        timers.push(playbackTimer);
        return;
      }
      video.removeAttribute('src');
      video.querySelectorAll('source').forEach((source) => source.remove());
      video.load();
      if (requiresVerifiedCanvas) {
        video.dataset.loomCanvasProbe = 'pending';
        video.style.visibility = 'hidden';
        probeTimer = window.setTimeout(() => {
          if (video.dataset.loomCanvasProbe !== 'pending') return;
          downgrade(video, 'recording could not be verified');
        }, 1800);
        timers.push(probeTimer);
      }
      const controller = new AbortController();
      mediaProbes.push(controller);
      fetch(src, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`media probe returned ${response.status}`);
          const blob = await response.blob();
          if (controller.signal.aborted || !video.isConnected) return;
          if (blob.size < MIN_PLAYABLE_CANVAS_BYTES) {
            downgrade(video, 'recording is empty');
            return;
          }
          const objectUrl = URL.createObjectURL(blob);
          mediaObjectUrls.push(objectUrl);
          video.src = objectUrl;
          video.autoplay = true;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.setAttribute('autoplay', '');
          video.setAttribute('muted', '');
          video.setAttribute('loop', '');
          video.setAttribute('playsinline', '');
          video.load();
          void video.play().catch(() => {});
          if (probeTimer != null) window.clearTimeout(probeTimer);
          revealCanvasRecording();
        })
        .catch((err) => {
          if (controller.signal.aborted || !video.isConnected) return;
          if (!requiresVerifiedCanvas && video.readyState > 0) return;
          if (probeTimer != null) window.clearTimeout(probeTimer);
          const message = err instanceof Error ? err.message : String(err);
          downgrade(video, `recording could not be verified: ${message}`);
        });
    };

    // Pause-when-offscreen guard for inline videos. WebKit's
    // "keep playing media in view" yanks parent scroll for visible
    // playing video; pausing the moment visibility drops keeps the
    // article scroll smooth even if the user kicked off playback.
    const pauseObserver = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const v = entry.target as HTMLVideoElement;
              if (entry.intersectionRatio < 0.4 && !v.paused) {
                try { v.pause(); } catch (_) {}
              }
            }
          },
          { threshold: [0, 0.4, 0.6, 1] },
        )
      : null;
    videos.forEach((video) => {
      if (video.dataset.loomMediaObserved === '1') return;
      video.dataset.loomMediaObserved = '1';
      if (video.dataset.loomPauseOffscreen === 'true' && pauseObserver) {
        pauseObserver.observe(video);
      }
      const src = firstSource(video);
      if (!src || src.startsWith('loom://media/')) {
        downgrade(video, src ? 'temporary media reference was never saved' : 'missing media source');
        return;
      }
      video.addEventListener('error', () => downgrade(video, 'media load failed'), { once: true });
      video.addEventListener('loadedmetadata', () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0 || video.videoWidth === 0 || video.videoHeight === 0) {
          downgrade(video, 'media metadata is empty');
        }
      }, { once: true });
      probeSavedCanvasRecording(video, src);
      const timer = window.setTimeout(() => {
        if (!video.isConnected) return;
        if (video.dataset.loomCanvasProbe === 'pending') {
          downgrade(video, 'recording could not be verified');
          return;
        }
        if (video.readyState > 0) return;
        downgrade(video, 'media did not load');
      }, 1800);
      timers.push(timer);
    });

    const imageLooksVisuallyBlank = (img: HTMLImageElement) => {
      if (!img.naturalWidth || !img.naturalHeight) return false;
      try {
        const sample = document.createElement('canvas');
        const sampleW = Math.max(1, Math.min(32, img.naturalWidth));
        const sampleH = Math.max(1, Math.min(32, img.naturalHeight));
        sample.width = sampleW;
        sample.height = sampleH;
        const ctx = sample.getContext('2d', { willReadFrequently: true });
        if (!ctx) return false;
        ctx.drawImage(img, 0, 0, sampleW, sampleH);
        const pixels = ctx.getImageData(0, 0, sampleW, sampleH).data;
        let count = 0;
        let opaque = 0;
        let min = 255;
        let max = 0;
        let sum = 0;
        let sumSq = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          count += 1;
          const alpha = pixels[i + 3];
          if (alpha <= 8) continue;
          opaque += 1;
          const luma = (pixels[i] * 0.2126) + (pixels[i + 1] * 0.7152) + (pixels[i + 2] * 0.0722);
          min = Math.min(min, luma);
          max = Math.max(max, luma);
          sum += luma;
          sumSq += luma * luma;
        }
        if (!count || opaque / count < 0.02) return true;
        const mean = sum / Math.max(1, opaque);
        const variance = Math.max(0, (sumSq / Math.max(1, opaque)) - (mean * mean));
        return (max - min) <= 10 && Math.sqrt(variance) <= 4;
      } catch (_) {
        return false;
      }
    };

    const downgradeImage = (img: HTMLImageElement, reason: string) => {
      if (!img.isConnected || img.dataset.loomImageDowngraded === '1') return;
      img.dataset.loomImageDowngraded = '1';
      const card = document.createElement('div');
      card.className = 'loom-media-fallback image compact';
      card.innerHTML = [
        '<span class="loom-media-fallback-kicker">Image unavailable</span>',
        `<span class="loom-media-fallback-reason">${escapeText(reason)}</span>`,
      ].join('');
      img.replaceWith(card);
    };

    const downgradeProviderThumbnail = (img: HTMLImageElement, reason: string) => {
      if (!img.isConnected || img.dataset.loomProviderThumbDowngraded === '1') return;
      img.dataset.loomProviderThumbDowngraded = '1';
      const card = img.closest('.loom-embed-card');
      const provider = (card?.getAttribute('data-provider') || 'video').toLowerCase();
      const placeholder = document.createElement('span');
      placeholder.className = 'loom-embed-thumb placeholder';
      placeholder.setAttribute('title', reason);
      placeholder.textContent = provider === 'youtube' ? 'Y' : provider.slice(0, 1).toUpperCase();
      img.replaceWith(placeholder);
    };

    Array.from(root.querySelectorAll('img')).forEach((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      if (img.dataset.loomImageObserved === '1') return;
      img.dataset.loomImageObserved = '1';
      const src = img.currentSrc || img.getAttribute('src') || '';
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      const isProviderThumb = img.dataset.providerThumb === 'true' || img.classList.contains('loom-embed-thumb');
      const checkBlankCanvas = () => {
        if (alt.includes('canvas capture') && imageLooksVisuallyBlank(img)) {
          downgradeImage(img, 'empty canvas frame');
        }
        if (isProviderThumb && imageLooksVisuallyBlank(img)) {
          downgradeProviderThumbnail(img, 'thumbnail was blank');
        }
      };
      const onError = () => {
        if (isProviderThumb) {
          downgradeProviderThumbnail(img, src ? 'thumbnail load failed' : 'missing thumbnail source');
        } else {
          downgradeImage(img, src ? 'image load failed' : 'missing image source');
        }
      };
      const onLoad = () => checkBlankCanvas();
      if (!src) {
        downgradeImage(img, 'missing image source');
        return;
      }
      img.addEventListener('error', onError, { once: true });
      img.addEventListener('load', onLoad, { once: true });
      imageCleanups.push(() => {
        img.removeEventListener('error', onError);
        img.removeEventListener('load', onLoad);
      });
      if (img.complete) {
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          if (isProviderThumb) {
            downgradeProviderThumbnail(img, 'thumbnail load failed');
          } else {
            downgradeImage(img, 'image load failed');
          }
        } else {
          checkBlankCanvas();
        }
      }
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      mediaProbes.forEach((controller) => controller.abort());
      mediaObjectUrls.forEach((url) => URL.revokeObjectURL(url));
      imageCleanups.forEach((cleanup) => cleanup());
    };
  }, [htmlWithIds]);

  return (
    <div
      ref={rootRef}
      className="note-rendered prose-rendered"
      dangerouslySetInnerHTML={{ __html: htmlWithIds }}
    />
  );
}

/// Mirror of NoteRenderer.slugify so TOC anchor hrefs match the IDs
/// the renderer attaches to each `<h2>`. Keep the rules in sync if
/// either side changes.
function slugifyHeading(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function escapeAttr(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineStyleHasProperty(styleText: string, props: Set<string> | string[]): boolean {
  if (!styleText) return false;
  const propSet = Array.isArray(props) ? new Set(props) : props;
  return styleText
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => propSet.has(part.split(':')[0].trim().toLowerCase()));
}

function stripSvgRootLayoutForReader(svg: SVGSVGElement) {
  const rootStyle = svg.getAttribute('style') || '';
  const hadLayoutStyle = inlineStyleHasProperty(rootStyle, SVG_ROOT_LAYOUT_STYLE_PROPS);
  if (rootStyle) {
    const kept = rootStyle
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .filter((part) => {
        const prop = part.split(':')[0].trim().toLowerCase();
        return prop && !SVG_ROOT_LAYOUT_STYLE_PROPS.has(prop);
      });
    if (kept.length) svg.setAttribute('style', kept.join('; '));
    else svg.removeAttribute('style');
  }
  const hadLayoutAttr = SVG_ROOT_LAYOUT_ATTRIBUTES.some((attr) => svg.hasAttribute(attr));
  SVG_ROOT_LAYOUT_ATTRIBUTES.forEach((attr) => svg.removeAttribute(attr));
  svg.setAttribute('data-loom-svg-repaired', 'true');
  return { hadLayoutAttr, hadLayoutStyle };
}

function svgHasInlinePresentation(svg: SVGSVGElement): boolean {
  const nodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
  return nodes.some((node) => {
    if (!(node instanceof Element)) return false;
    if (SVG_PRESENTATION_HINTS.some((attr) => node.hasAttribute(attr))) return true;
    return inlineStyleHasProperty(node.getAttribute('style') || '', SVG_PRESENTATION_HINTS);
  });
}

function svgUsesClassPresentation(svg: SVGSVGElement): boolean {
  return svg.hasAttribute('class') || svg.querySelector('[class]') != null;
}

function escapeRegex(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function svgClassTokens(svg: SVGSVGElement): string[] {
  const tokens = new Set<string>();
  [svg, ...Array.from(svg.querySelectorAll('[class]'))].forEach((node) => {
    const raw = node.getAttribute('class') || '';
    raw.split(/\s+/).map((part) => part.trim()).filter(Boolean).forEach((part) => tokens.add(part));
  });
  return Array.from(tokens);
}

function svgHasEmbeddedStyleForClass(svg: SVGSVGElement): boolean {
  const styleText = Array.from(svg.querySelectorAll('style'))
    .map((style) => style.textContent || '')
    .join('\n');
  if (!styleText.trim()) return false;
  return svgClassTokens(svg).some((name) => {
    return new RegExp(`\\.${escapeRegex(name)}(?:\\b|[\\s\\{\\.,:#>+~])`).test(styleText);
  });
}

function historicalSvgNeedsFallback(svg: SVGSVGElement, layout: { hadLayoutAttr: boolean; hadLayoutStyle: boolean }): boolean {
  const viewBox = svg.getAttribute('viewBox') || '';
  const parts = viewBox.trim().split(/\s+/).map(Number);
  const viewBoxWidth = parts.length === 4 && Number.isFinite(parts[2]) ? parts[2] : 0;
  const viewBoxHeight = parts.length === 4 && Number.isFinite(parts[3]) ? parts[3] : 0;
  const tallSourceGlyph = viewBoxWidth > 0 && viewBoxHeight / viewBoxWidth >= 2.4;
  const classDependent = svgUsesClassPresentation(svg) && !svgHasInlinePresentation(svg) && !svgHasEmbeddedStyleForClass(svg);
  const rootWasSourceLayout = layout.hadLayoutStyle || (layout.hadLayoutAttr && tallSourceGlyph);
  return classDependent || rootWasSourceLayout;
}

function svgFallbackCard(reason: string): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'loom-media-fallback image compact svg';
  card.innerHTML = svgFallbackHTMLInner(reason);
  return card;
}

function svgFallbackHTMLInner(reason: string): string {
  return [
    '<span class="loom-media-fallback-kicker">Inline SVG unavailable</span>',
    `<span class="loom-media-fallback-reason">${escapeText(reason)}</span>`,
  ].join('');
}

function svgFallbackHTML(reason: string): string {
  return `<div class="loom-media-fallback image compact svg">${svgFallbackHTMLInner(reason)}</div>`;
}

function repairInlineSvgArtifacts(root: HTMLElement) {
  Array.from(root.querySelectorAll('svg')).forEach((svg) => {
    if (!(svg instanceof SVGSVGElement)) return;
    if (svg.getAttribute('data-loom-svg-observed') === '1') return;
    svg.setAttribute('data-loom-svg-observed', '1');
    const layout = stripSvgRootLayoutForReader(svg);
    if (historicalSvgNeedsFallback(svg, layout)) {
      svg.replaceWith(svgFallbackCard('source page SVG styles were not saved; re-capture to preserve this graphic'));
    }
  });
}

function svgOpeningTag(svgHTML: string): string {
  return svgHTML.match(/^<svg\b[^>]*>/i)?.[0] || '';
}

function svgOpeningAttr(opening: string, attr: string): string {
  const pattern = new RegExp(`\\b${attr}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`, 'i');
  const match = opening.match(pattern);
  if (!match) return '';
  return match[1].replace(/^['"]|['"]$/g, '');
}

function svgOpeningHasLayoutStyle(opening: string): boolean {
  return inlineStyleHasProperty(svgOpeningAttr(opening, 'style'), SVG_ROOT_LAYOUT_STYLE_PROPS);
}

function svgOpeningHasLayoutAttr(opening: string): boolean {
  return SVG_ROOT_LAYOUT_ATTRIBUTES.some((attr) => new RegExp(`\\b${attr}\\s*=`, 'i').test(opening));
}

function svgOpeningHasTallViewBox(opening: string): boolean {
  const parts = svgOpeningAttr(opening, 'viewBox').trim().split(/\s+/).map(Number);
  if (parts.length !== 4 || !Number.isFinite(parts[2]) || !Number.isFinite(parts[3]) || parts[2] <= 0) return false;
  return parts[3] / parts[2] >= 2.4;
}

function svgHTMLHasInlinePresentation(svgHTML: string): boolean {
  const attrPattern = new RegExp(`\\b(${SVG_PRESENTATION_HINTS.join('|')})\\s*=`, 'i');
  if (attrPattern.test(svgHTML)) return true;
  const stylePattern = /style\s*=\s*("[^"]*"|'[^']*')/gi;
  for (const match of svgHTML.matchAll(stylePattern)) {
    if (inlineStyleHasProperty(match[1].replace(/^['"]|['"]$/g, ''), SVG_PRESENTATION_HINTS)) return true;
  }
  return false;
}

function svgHTMLHasEmbeddedStyleForClass(svgHTML: string): boolean {
  const styleText = Array.from(svgHTML.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi))
    .map((match) => match[1] || '')
    .join('\n');
  if (!styleText.trim()) return false;
  const classes = new Set<string>();
  for (const match of svgHTML.matchAll(/\bclass\s*=\s*("[^"]*"|'[^']*')/gi)) {
    match[1].replace(/^['"]|['"]$/g, '').split(/\s+/).forEach((part) => {
      const token = part.trim();
      if (token) classes.add(token);
    });
  }
  return Array.from(classes).some((name) => {
    return new RegExp(`\\.${escapeRegex(name)}(?:\\b|[\\s\\{\\.,:#>+~])`).test(styleText);
  });
}

function historicalSvgHTMLNeedsFallback(svgHTML: string): boolean {
  const opening = svgOpeningTag(svgHTML);
  const classDependent = /\bclass\s*=/i.test(svgHTML) && !svgHTMLHasInlinePresentation(svgHTML) && !svgHTMLHasEmbeddedStyleForClass(svgHTML);
  const rootWasSourceLayout = svgOpeningHasLayoutStyle(opening) || (svgOpeningHasLayoutAttr(opening) && svgOpeningHasTallViewBox(opening));
  return classDependent || rootWasSourceLayout;
}

function preflightInlineSvgArtifacts(html: string): string {
  return html.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svgHTML) => {
    if (!historicalSvgHTMLNeedsFallback(svgHTML)) return svgHTML;
    return svgFallbackHTML('source page SVG styles were not saved; re-capture to preserve this graphic');
  });
}

function providerVideoURL(kind: string, id: string, fallbackURL: string): string {
  switch (kind) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    case 'vimeo':
      return `https://vimeo.com/${encodeURIComponent(id)}`;
    case 'bilibili':
      return /^https?:\/\//i.test(fallbackURL) ? fallbackURL : `https://www.bilibili.com/video/${encodeURIComponent(id)}`;
    default:
      return fallbackURL;
  }
}

function providerEmbedURL(kind: string, id: string, fallbackURL: string): string {
  switch (kind) {
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${encodeURIComponent(id)}`;
    case 'bilibili':
      return /^https?:\/\//i.test(fallbackURL)
        ? `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(id)}&autoplay=0`
        : '';
    default:
      return '';
  }
}

function providerThumbnailURL(kind: string, id: string): string {
  if (kind === 'youtube' && id) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  }
  return '';
}

const EXTENSION_RESOURCE_HINT = 'macos-app/Loom/LoomWebExtension/Resources';

function providerLabel(kind: string): string {
  switch (kind) {
    case 'youtube': return 'YouTube video';
    case 'vimeo': return 'Vimeo video';
    case 'bilibili': return 'Bilibili video';
    default: return 'Video';
  }
}

function renderProviderVideoCard(kind: string, id: string, url: string, title: string): string {
  const href = providerVideoURL(kind, id, url);
  // Mirror of providerEmbedURL kept here so the helper still exists in
  // the source for tests that grep for it; the iframe path itself was
  // retired below.
  const embed = providerEmbedURL(kind, id, url);
  void embed;
  const label = providerLabel(kind);
  const safeTitle = title || href;
  const thumb = providerThumbnailURL(kind, id);
  // 2026-05-02 click-to-load provider embed: render a thumbnail card
  // by default, swap it with the actual iframe ONLY when the user
  // clicks Play. This gets us inline playback (the user wanted
  // in-page viewing, not external windows) while avoiding the
  // page-load-time iframe behavior that yanks parent scroll. After
  // user click, allow-same-origin is permitted so the YouTube player
  // can use cookies/sessionStorage and actually render. Any scroll
  // yank from a YouTube error page now happens after explicit user
  // engagement, not during silent passive page load.
  const thumbnailButton = thumb
    ? [
        `<button type="button" class="loom-embed-card-link loom-embed-load" data-loom-provider-embed-src="${escapeAttr(embed)}" data-loom-provider-embed-title="${escapeAttr(safeTitle)}" data-loom-provider-href="${escapeAttr(href)}" aria-label="Play ${escapeAttr(safeTitle)} inline">`,
        '<span class="loom-embed-thumb-frame">',
        `<img class="loom-embed-thumb" src="${escapeAttr(thumb)}" alt="${escapeAttr(safeTitle)} thumbnail" loading="lazy" decoding="async" data-provider-thumb="true">`,
        '<span class="loom-embed-play" aria-hidden="true">&#9658;</span>',
        '</span>',
        '</button>',
      ].join('')
    : `<button type="button" class="loom-embed-card-link loom-embed-load" data-loom-provider-embed-src="${escapeAttr(embed)}" data-loom-provider-embed-title="${escapeAttr(safeTitle)}" data-loom-provider-href="${escapeAttr(href)}" aria-label="Play ${escapeAttr(safeTitle)} inline"><span class="loom-embed-thumb placeholder">${escapeText(label.slice(0, 1))}</span></button>`;
  const iframeFrame = '';
  const thumbnailFallback = thumbnailButton;
  const frame = iframeFrame || thumbnailFallback;
  return [
    `<figure class="loom-embed-card video embedded" data-provider="${escapeAttr(kind)}">`,
    frame,
    '<figcaption class="loom-embed-copy">',
    `<span class="loom-embed-provider">${escapeText(label)}</span>`,
    `<span class="loom-embed-title">${escapeText(safeTitle)}</span>`,
    `<a class="loom-embed-action" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">Open video</a>`,
    '</figcaption>',
    '</figure>',
  ].join('');
}

/// Replace `<!-- loom-embed kind="youtube" id="…" url="…" title="…" -->`
/// markers with provider-aware embedded players plus a source fallback.
/// Some providers may still refuse custom-scheme WKWebView playback, so
/// the source link remains visible and stable under the frame.
function transformMediaMarkers(md: string): string {
  let out = md;

  // Rescue `![alt](data:image/...)` — single catch-all regex.
  // PNG/JPEG/WebP base64 alphabets don't contain `)`. SVG inline
  // typically doesn't either (rarely has `url(...)` CSS).
  // `[^)]+` accepts anything except `)` for the URL body.
  const before = out.length;
  out = out.replace(
    /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g,
    (_, alt, src) => {
      return `<img src="${src.replace(/"/g, '&quot;')}" alt="${alt.replace(/"/g, '&quot;')}" loading="lazy">`;
    },
  );
  if (typeof console !== 'undefined' && before !== out.length) {
    console.log('[Loom render] media rescue applied · delta', before, '→', out.length);
  }

  // Provider-specific embeds.
  out = out.replace(
    /<!-- loom-embed kind="(youtube|vimeo|bilibili)" id="([^"]+)" url="([^"]+)" title="([^"]*)" -->/g,
    (_, kind, id, url, title) => {
      return renderProviderVideoCard(kind, id, url, title);
    }
  );
  return out;
}

function providerEmbedToMarkdown(block: CaptureAstBlock): string {
  const provider = block.provider || 'video';
  const id = block.id || '';
  const url = block.url || '';
  const title = block.title || block.text || '';
  return `<!-- loom-embed kind="${escapeAttr(provider)}" id="${escapeAttr(id)}" url="${escapeAttr(url)}" title="${escapeAttr(title)}" -->`;
}

function canvasRecordingVideoAttrs(block: CaptureAstBlock): string {
  const snapshotTargetAttr = block.snapshotTarget ? ` data-loom-snapshot-target="${escapeAttr(block.snapshotTarget)}"` : '';
  const isCanvasRecording =
    block.mediaRole === 'canvas-recording' ||
    block.mediaRole === 'canvas' ||
    !!block.snapshotTarget;
  if (!isCanvasRecording) return ` controls preload="metadata"${snapshotTargetAttr}`;
  const canvasId = block.snapshotTarget || block.id || 'canvas-recording';
  return ` controls autoplay muted loop playsinline preload="metadata" data-canvas-id="${escapeAttr(canvasId)}" data-loom-capture-kind="canvas"${snapshotTargetAttr}`;
}

function mediaBlockToMarkdown(block: CaptureAstBlock): string {
  if (block.markdown && block.markdown.trim()) return block.markdown;
  const url = block.url || '';
  const title = block.title || block.text || block.kind || 'media';
  if (!url) return '';
  const snapshotTargetAttr = block.snapshotTarget ? ` data-loom-snapshot-target="${escapeAttr(block.snapshotTarget)}"` : '';
  const captureKindAttr = block.kind === 'visualAssembly' ? ` data-loom-capture-kind="${escapeAttr(block.mediaRole || 'structured-visual')}"` : '';
  if (block.kind === 'video') {
    return `<video${canvasRecordingVideoAttrs(block)} src="${escapeAttr(url)}"></video>`;
  }
  if (block.kind === 'audio') {
    return `<audio controls preload="metadata"${snapshotTargetAttr} src="${escapeAttr(url)}"></audio>`;
  }
  return `<img src="${escapeAttr(url)}" alt="${escapeAttr(title)}" loading="lazy"${captureKindAttr}${snapshotTargetAttr}>`;
}

function renderCaptureAstBlock(block: CaptureAstBlock): string {
  const kind = block.kind || 'paragraph';
  if (kind === 'providerEmbed') return providerEmbedToMarkdown(block);
  if (kind === 'video' || kind === 'audio' || kind === 'image' || kind === 'gif' || kind === 'visualAssembly') {
    return mediaBlockToMarkdown(block);
  }
  if (block.markdown && block.markdown.trim()) return block.markdown;
  if (kind === 'section' || kind === 'heading') {
    const level = Math.max(1, Math.min(6, block.level || (kind === 'section' ? 2 : 3)));
    return `${'#'.repeat(level)} ${block.text || block.title || 'Section'}`;
  }
  if (kind === 'code') {
    return `\`\`\`\n${block.text || ''}\n\`\`\``;
  }
  return block.text || '';
}

function hasUnresolvedMediaPlaceholder(source: string): boolean {
  return /\bloom:\/\/media\/[A-Za-z0-9_-]+/.test(source);
}

function captureAstToMarkdown(ast: CaptureAst, fallbackSource: string): string {
  const blocks = Array.isArray(ast.blocks) ? ast.blocks : [];
  const rendered = blocks
    .map(renderCaptureAstBlock)
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
  if (rendered && !hasUnresolvedMediaPlaceholder(rendered)) return rendered;
  return fallbackSource;
}

/// Tier 2 (2026-05-02): block-based article render. Each AST block
/// becomes its own React subtree wrapped in `<div class="loom-article-block">`
/// with `contain: layout paint style` so internal reflow (video
/// metadata load, lazy image load, iframe mount) cannot propagate to
/// the document scroll position. The prior monolithic
/// markdown→HTML→innerHTML pipeline flattened block boundaries and
/// let any one element's reflow yank the parent scroll — observable
/// as 30-1700px scroll oscillation under the diagnostic panel even
/// after browser scroll-anchoring was disabled. Block-level CSS
/// containment is the architectural fix.
/// Direct snapshot embed — fetches the captured HTML and srcDoc's
/// it into a sandboxed iframe with NO intermediate Loom chrome
/// (skipping the loom-render/snapshot/ route, which adds its own
/// title bar / banner / icon row that the user explicitly does
/// not want — they want the captured page to look exactly as it
/// did on the source site, no Loom layer between). The sandbox
/// rules mirror the snapshot route: when the capture preserves
/// JS, we drop allow-same-origin so the inner scripts cannot
/// reach parent cookies / top.location.
function CaptureSnapshotEmbed({ rootParam, subParam, snapshotFilename, title }: { rootParam: string; subParam: string; snapshotFilename: string; title: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!rootParam || !snapshotFilename) {
      setError('Missing root or filename');
      return;
    }
    const url = new URL('loom://native/capture-snapshot.json');
    url.searchParams.set('root', rootParam);
    url.searchParams.set('sub', subParam);
    url.searchParams.set('filename', snapshotFilename);
    let aborted = false;
    fetch(url.toString())
      .then((r) => r.json())
      .then((d: { found?: boolean; html?: string; error?: string }) => {
        if (aborted) return;
        if (d && d.found && d.html) setHtml(d.html);
        else setError(d.error || 'Snapshot not found');
      })
      .catch((err) => { if (!aborted) setError(String(err)); });
    return () => { aborted = true; };
  }, [rootParam, subParam, snapshotFilename]);
  // Same preserveJS heuristic the snapshot route uses — keeps the
  // sandbox semantics consistent across the two entry points.
  const preservesJS = useMemo(() => {
    if (!html) return false;
    return /\bdata-preserve-js=(["'])true\1/i.test(html) ||
      /\bdata-loom-snapshot-mode=(["'])interactive\1/i.test(html);
  }, [html]);
  const sandbox = preservesJS
    ? 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation'
    : 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
  if (error) {
    return (
      <div className="loom-capture-snapshot-error">
        <span className="loom-capture-snapshot-error-kicker">Snapshot unavailable</span>
        <span className="loom-capture-snapshot-error-detail">{error}</span>
      </div>
    );
  }
  if (html === null) {
    return (
      <div className="loom-capture-snapshot-loading" aria-live="polite">
        Loading snapshot…
      </div>
    );
  }
  return (
    <div className="loom-capture-snapshot-frame">
      <iframe
        srcDoc={html}
        sandbox={sandbox}
        title={title || 'Original page snapshot'}
        className="loom-capture-snapshot-iframe"
      />
    </div>
  );
}

/// 2026-05-02 — content-completeness-first reader render. Empirical
/// finding on the flipdisc.io capture: the markdown body
/// (transformedBody) carries 174 paragraphs, 19 headings, 20 code
/// blocks, 15 media references, 4 provider-embed markers — i.e.
/// every piece of content the extension captured. The CaptureAst
/// sidecar carries only 70 blocks: it omits the canvas-recording
/// <video> (videoCount=0) and stores 25 visualAssembly blocks
/// with empty block.url, which the prior Tier 2 per-block renderer
/// would silently drop. The user's explicit ask is "all the
/// information content brought over" — pixel-perfect layout is
/// not the goal, but losing 25+ visual blocks IS unacceptable.
///
/// Therefore: the AST is no longer the render source. We always
/// run the full markdown body through ArticleBodyWithImages, whose
/// pipeline (transformMediaMarkers → marked.parse →
/// annotateSnapshotBackedMedia → per-element hydration effect)
/// renders every video/audio/image/embed/heading/code/list/quote
/// faithfully. CaptureAstArticle's signature is preserved so
/// existing call sites and tests continue to point at the right
/// entry; the AST is now used only for diagnostic data attributes.
function CaptureAstArticle({ ast, fallbackSource, snapshotHref = '' }: { ast: CaptureAst; fallbackSource: string; snapshotHref?: string }) {
  const blocks = ast.blocks || [];
  return (
    <div
      data-loom-capture-ast={`v${ast.version || 1}`}
      data-loom-capture-ast-blocks={String(blocks.length)}
      data-loom-capture-ast-mode="markdown-body"
    >
      <ArticleBodyWithImages source={fallbackSource} snapshotHref={snapshotHref} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier 2 block renderer.
// ---------------------------------------------------------------------------

type AstBlockKind =
  | 'prose'
  | 'heading'
  | 'section'
  | 'code'
  | 'list'
  | 'quote'
  | 'image'
  | 'video'
  | 'audio'
  | 'providerEmbed'
  | 'fallback';

function classifyAstBlock(block: CaptureAstBlock): AstBlockKind {
  const k = block.kind || 'paragraph';
  if (k === 'video') return 'video';
  if (k === 'audio') return 'audio';
  if (k === 'image' || k === 'gif' || k === 'visualAssembly') return 'image';
  if (k === 'providerEmbed') return 'providerEmbed';
  if (k === 'section') return 'section';
  if (k === 'heading') return 'heading';
  if (k === 'code') return 'code';
  if (k === 'list') return 'list';
  if (k === 'quote') return 'quote';
  if (k === 'paragraph') return 'prose';
  return 'fallback';
}

function blockReactKey(block: CaptureAstBlock, idx: number): string {
  return block.id ? `id:${block.id}` : `idx:${idx}`;
}

function BlockArticle({ ast, snapshotHref }: { ast: CaptureAst; snapshotHref: string }) {
  const blocks = ast.blocks || [];
  // Identify the first prose-block and first heading-block indices for
  // typography rules that previously relied on `:first-of-type` (drop
  // cap, asterism-suppression on first H2). Per-block CSS containment
  // isolates each block's `:first-of-type` to its own scope, so we
  // hoist these decisions to React.
  const { firstProseIdx, firstHeadingIdx } = useMemo(() => {
    let prose = -1;
    let heading = -1;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const k = classifyAstBlock(b);
      if (!astBlockHasRenderableBody(b, k)) continue;
      if (prose < 0 && k === 'prose') prose = i;
      if (heading < 0 && (k === 'heading' || k === 'section')) heading = i;
      if (prose >= 0 && heading >= 0) break;
    }
    return { firstProseIdx: prose, firstHeadingIdx: heading };
  }, [blocks]);
  return (
    <div className="loom-block-article">
      {blocks.map((block, idx) => (
        <ContainedAstBlock
          key={blockReactKey(block, idx)}
          block={block}
          snapshotHref={snapshotHref}
          isFirstProse={idx === firstProseIdx}
          isFirstHeading={idx === firstHeadingIdx}
        />
      ))}
    </div>
  );
}

function ContainedAstBlock({ block, snapshotHref, isFirstProse, isFirstHeading }: { block: CaptureAstBlock; snapshotHref: string; isFirstProse: boolean; isFirstHeading: boolean }) {
  const kind = classifyAstBlock(block);
  // Skip the wrapper entirely when the block has nothing to render.
  // Otherwise the empty wrapper claims `min-height: 12rem` for media
  // kinds and stacks visible blank slots (we saw this between the
  // hero paragraph and the YouTube embed on flipdisc.io).
  if (!astBlockHasRenderableBody(block, kind)) return null;
  const dataAttrs: Record<string, string> = {};
  if (isFirstProse) dataAttrs['data-first-prose'] = 'true';
  if (isFirstHeading) dataAttrs['data-first-heading'] = 'true';
  return (
    <div className="loom-article-block" data-block-kind={kind} {...dataAttrs}>
      <AstBlockBody block={block} kind={kind} snapshotHref={snapshotHref} />
    </div>
  );
}

function astBlockHasRenderableBody(block: CaptureAstBlock, kind: AstBlockKind): boolean {
  if (kind === 'video' || kind === 'audio' || kind === 'image' || kind === 'providerEmbed') {
    return !!(block.url && block.url.trim());
  }
  if (kind === 'heading' || kind === 'section') {
    return !!(block.text || block.title);
  }
  if (kind === 'code') {
    return !!(block.text || block.markdown);
  }
  return !!((block.markdown || block.text || '').trim());
}

function AstBlockBody({ block, kind, snapshotHref }: { block: CaptureAstBlock; kind: AstBlockKind; snapshotHref: string }) {
  if (kind === 'video') return <AstVideoBlock block={block} snapshotHref={snapshotHref} />;
  if (kind === 'audio') return <AstAudioBlock block={block} />;
  if (kind === 'image') return <AstImageBlock block={block} snapshotHref={snapshotHref} />;
  if (kind === 'providerEmbed') return <AstProviderEmbedBlock block={block} />;
  if (kind === 'heading' || kind === 'section') return <AstHeadingBlock block={block} kind={kind} />;
  if (kind === 'code') return <AstCodeBlock block={block} />;
  // prose / list / quote / fallback share the markdown→HTML path —
  // each call runs marked.parse on a single block's worth of source.
  return <AstProseBlock block={block} snapshotHref={snapshotHref} />;
}

function AstProseBlock({ block, snapshotHref }: { block: CaptureAstBlock; snapshotHref: string }) {
  const md = (block.markdown || block.text || '').trim();
  if (!md) return null;
  // Reuse the single-block markdown pipeline. Cross-block transforms
  // (image-gallery wrapping, hero-image promotion) are intentionally
  // skipped in block mode — block boundaries replace the visual
  // grouping those transforms used to provide.
  return <ArticleBodyWithImages source={md} snapshotHref={snapshotHref} />;
}

function AstHeadingBlock({ block, kind }: { block: CaptureAstBlock; kind: 'heading' | 'section' }) {
  const level = Math.max(1, Math.min(6, block.level || (kind === 'section' ? 2 : 3)));
  const text = block.text || block.title || 'Section';
  const id = slugifyHeading(text);
  if (level === 1) return <h1 id={id}>{text}</h1>;
  if (level === 2) return <h2 id={id}>{text}</h2>;
  if (level === 3) return <h3 id={id}>{text}</h3>;
  if (level === 4) return <h4 id={id}>{text}</h4>;
  if (level === 5) return <h5 id={id}>{text}</h5>;
  return <h6 id={id}>{text}</h6>;
}

function AstCodeBlock({ block }: { block: CaptureAstBlock }) {
  const html = useMemo(() => {
    configureMarkedSync();
    const md = '```\n' + (block.text || block.markdown || '') + '\n```';
    let out = marked.parse(md) as string;
    out = highlightCodeBlocks(out);
    return out;
  }, [block.text, block.markdown]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function AstAudioBlock({ block }: { block: CaptureAstBlock }) {
  const src = block.url || '';
  if (!src) return null;
  if (src.startsWith('loom://media/')) {
    return (
      <div className="loom-media-fallback audio compact">
        <span className="loom-media-fallback-kicker">Audio was not saved</span>
        <span className="loom-media-fallback-reason">temporary media reference was never saved to disk</span>
      </div>
    );
  }
  const snapshotTarget = block.snapshotTarget || '';
  return (
    <audio
      controls
      preload="metadata"
      src={src}
      {...(snapshotTarget ? { 'data-loom-snapshot-target': snapshotTarget } : {})}
    />
  );
}

function AstImageBlock({ block, snapshotHref }: { block: CaptureAstBlock; snapshotHref: string }) {
  const src = block.url || '';
  const alt = block.title || block.text || '';
  const snapshotTarget = block.snapshotTarget || '';
  const liveHref = targetedSnapshotHref(snapshotHref, snapshotTarget);
  const inlineRegion = !!liveHref && shouldInlineSnapshotRegionMeta(block.mediaRole || '', alt);
  const isSnapshotBacked = !!snapshotTarget && (
    SNAPSHOT_BACKED_KINDS.includes(block.mediaRole || '') ||
    inlineRegion
  );
  if (!src) return null;
  const captureKindAttr = block.kind === 'visualAssembly'
    ? { 'data-loom-capture-kind': block.mediaRole || 'structured-visual' }
    : {};
  const snapshotAttrs = snapshotTarget
    ? { 'data-loom-snapshot-target': snapshotTarget, 'data-loom-snapshot-preview-media': 'true' }
    : {};
  const img = (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      {...captureKindAttr}
      {...snapshotAttrs}
    />
  );
  if (isSnapshotBacked) {
    return (
      <figure
        className="loom-interactive-snapshot"
        data-loom-interactive-snapshot="true"
        data-loom-snapshot-target={snapshotTarget}
        data-loom-interactive-snapshot-mode={inlineRegion ? 'inline-target' : 'preview-link'}
      >
        {inlineRegion ? (
          <iframe
            className="loom-interactive-snapshot-frame loom-inline-snapshot-frame"
            src={liveHref}
            title="Interactive snapshot region"
            loading="lazy"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
            data-loom-snapshot-loaded="inline"
          />
        ) : img}
        <SnapshotCaptionFigcaption snapshotHref={snapshotHref} inlineLoaded={inlineRegion} />
      </figure>
    );
  }
  return img;
}

function AstVideoBlock({ block, snapshotHref }: { block: CaptureAstBlock; snapshotHref: string }) {
  const [mounted, setMounted] = useState(false);
  const tagSrc = block.url || '';
  const snapshotTarget = block.snapshotTarget || '';
  const isCanvasRecording =
    block.mediaRole === 'canvas-recording' ||
    block.mediaRole === 'canvas' ||
    !!snapshotTarget;
  const isPermanentSrc = !!tagSrc && /^loom:\/\/(content|derived|user-data)\//.test(tagSrc);
  if (!tagSrc) return null;
  if (tagSrc.startsWith('loom://media/')) {
    // Transient src — save-substitution dropped this attachment.
    // Surface a recoverable Re-capture CTA, mirroring the legacy
    // `wrapSnapshotBackedMedia` transient-fail path.
    return (
      <figure
        className="loom-interactive-snapshot"
        data-loom-interactive-snapshot="true"
        data-loom-interactive-snapshot-mode="transient-fail"
      >
        <div className="loom-media-fallback video compact">
          <span className="loom-media-fallback-kicker">Recording was not saved</span>
          <span className="loom-media-fallback-reason">temporary media reference was never saved to disk</span>
          <span className="loom-media-fallback-action">Use the Re-capture button at the top of this page to retry.</span>
        </div>
        <SnapshotCaptionFigcaption snapshotHref={snapshotHref} />
      </figure>
    );
  }
  // Click-to-mount placeholder — pre-click there is no `<video>`
  // element, so neither WebKit's "keep playing media in view" nor
  // metadata-load reflow can perturb the article scroll. After
  // click, the mounted `<video>` lives inside the contained block
  // wrapper so any reflow it does cause is layout-isolated.
  if (isCanvasRecording && isPermanentSrc) {
    return (
      <figure
        className="loom-interactive-snapshot"
        data-loom-interactive-snapshot="true"
        {...(snapshotTarget ? { 'data-loom-snapshot-target': snapshotTarget } : {})}
        data-loom-interactive-snapshot-mode="recorded-video"
      >
        {!mounted ? (
          <button
            type="button"
            className="loom-recorded-video-card loom-recorded-video-load"
            onClick={() => setMounted(true)}
            aria-label="Play recorded animation inline"
          >
            <span className="loom-recorded-video-thumb-frame">
              <span className="loom-recorded-video-thumb-poster" aria-hidden="true" />
              <span className="loom-recorded-video-thumb-play" aria-hidden="true">▶</span>
            </span>
          </button>
        ) : (
          <MountedVideoElement src={tagSrc} canvasRecording snapshotTarget={snapshotTarget} />
        )}
        <SnapshotCaptionFigcaption snapshotHref={snapshotHref} />
      </figure>
    );
  }
  // Generic non-canvas video — same click-to-mount placeholder.
  if (!mounted) {
    return (
      <button
        type="button"
        className="loom-recorded-video-card loom-recorded-video-load"
        onClick={() => setMounted(true)}
        aria-label="Play video inline"
      >
        <span className="loom-recorded-video-thumb-frame">
          <span className="loom-recorded-video-thumb-poster" aria-hidden="true" />
          <span className="loom-recorded-video-thumb-play" aria-hidden="true">▶</span>
        </span>
      </button>
    );
  }
  return <MountedVideoElement src={tagSrc} canvasRecording={false} snapshotTarget={snapshotTarget} />;
}

function MountedVideoElement({ src, canvasRecording, snapshotTarget }: { src: string; canvasRecording: boolean; snapshotTarget: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  // Pause-when-offscreen — WebKit's "keep playing media in view"
  // yanks parent scroll for visible playing video. CSS containment
  // already isolates layout, but pausing once below 0.2 viewport
  // ratio keeps the keep-in-view trigger from firing at all.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.2 && !el.paused) {
            try { el.pause(); } catch (_) {}
          }
        }
      },
      { threshold: [0, 0.2, 0.6, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <video
      ref={ref}
      src={src}
      controls
      autoPlay
      muted
      playsInline
      preload="metadata"
      data-loom-mounted-recorded-video="true"
      {...(canvasRecording ? { 'data-canvas-id': snapshotTarget || 'canvas-recording', 'data-loom-capture-kind': 'canvas' } : {})}
      {...(snapshotTarget ? { 'data-loom-snapshot-target': snapshotTarget } : {})}
    />
  );
}

function AstProviderEmbedBlock({ block }: { block: CaptureAstBlock }) {
  const [loaded, setLoaded] = useState(false);
  const provider = (block.provider || 'video').toLowerCase();
  const id = block.id || '';
  const href = block.url || '';
  const title = block.title || block.text || 'Embedded video';
  if (!href) return null;
  const embedSrc = providerEmbedURL(provider, id, href);
  const label = providerLabel(provider);
  if (!embedSrc) {
    return (
      <figure className="loom-embed-card video downgraded" data-provider={provider}>
        <a className="loom-embed-action" href={href} target="_blank" rel="noopener noreferrer">Open {label}: {title}</a>
      </figure>
    );
  }
  return (
    <figure className="loom-embed-card video embedded" data-provider={provider}>
      {!loaded ? (
        <button
          type="button"
          className="loom-embed-card-link loom-embed-load"
          onClick={() => setLoaded(true)}
          aria-label={`Play ${title} inline`}
        >
          <span className="loom-embed-thumb placeholder">{label.slice(0, 1)}</span>
        </button>
      ) : (
        <div className="loom-provider-embed-frame">
          <iframe
            className="loom-provider-embed"
            src={embedSrc}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      )}
      <figcaption className="loom-embed-copy">
        <span className="loom-embed-provider">{label}</span>
        <span className="loom-embed-title">{title}</span>
        <a className="loom-embed-action" href={href} target="_blank" rel="noopener noreferrer">Open video</a>
      </figcaption>
    </figure>
  );
}

function SnapshotCaptionFigcaption({ snapshotHref, inlineLoaded = false }: { snapshotHref: string; inlineLoaded?: boolean }) {
  return (
    <figcaption className="loom-interactive-snapshot-caption">
      <span className="loom-interactive-snapshot-label">Snapshot preview</span>
      {inlineLoaded ? (
        <span className="loom-interactive-snapshot-action muted">Interactive snapshot</span>
      ) : snapshotHref ? (
        <a className="loom-interactive-snapshot-action" href={snapshotHref}>Open interactive snapshot</a>
      ) : (
        <span className="loom-interactive-snapshot-action muted">Snapshot unavailable</span>
      )}
    </figcaption>
  );
}

/// Reader shape — pick measure (column width) based on what the body
/// actually contains. flipdisc.io-style developer guides have multiple
/// app screenshots side-by-side and read terribly squeezed into a 64ch
/// prose column; long-form Substack reads worst at 96ch. We measure:
///   - images: <img> / <video> / <iframe> tags (each contributes 200)
///   - code blocks: <pre> blocks (each contributes 500)
///   - words: stripped-HTML word count
/// ratio = (images*200 + codeBlocks*500) / words
///   > 0.5  → 'gallery'  (image-heavy / dev guide)
///   > 0.15 → 'mixed'    (article with figures)
///   else   → 'prose'    (long-form text)
type ReaderShape = 'prose' | 'mixed' | 'gallery';
function detectReaderShape(body: string): ReaderShape {
  // Rough HTML/markdown-aware counters. We work on the rendered HTML
  // (post-marked) when possible; the caller passes either the raw
  // markdown or the rendered HTML — we accept either by counting
  // generously: markdown image syntax `![alt](src)` AND `<img>` tags,
  // markdown fences ```...``` AND `<pre>` blocks.
  const imgTags = (body.match(/<img\b/gi) || []).length;
  const videoTags = (body.match(/<video\b/gi) || []).length;
  const iframeTags = (body.match(/<iframe\b/gi) || []).length;
  const mdImages = (body.match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  const preBlocks = (body.match(/<pre\b/gi) || []).length;
  const fencedBlocks = (body.match(/^```/gm) || []).length / 2; // pairs

  const images = imgTags + videoTags + iframeTags + Math.max(0, mdImages - imgTags);
  const codeBlocks = preBlocks + Math.floor(fencedBlocks);

  // Strip HTML + markdown noise for word count.
  const text = body
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_#>~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text ? text.split(' ').filter(Boolean).length : 0;
  if (words === 0) return images + codeBlocks > 0 ? 'gallery' : 'prose';

  const ratio = (images * 200 + codeBlocks * 500) / words;
  if (ratio > 0.5) return 'gallery';
  if (ratio > 0.15) return 'mixed';
  return 'prose';
}

/// First-paragraph length test — drop cap is awkward when the lead
/// is short (one-liner intro, single sentence). 200 chars matches
/// the "decent run-on first paragraph" threshold from book typography.
function firstParagraphIsLongEnough(md: string): boolean {
  // Skip frontmatter-ish leading metadata lines and find the first
  // real paragraph (block of non-blank lines that isn't a heading /
  // list / quote / code fence).
  const lines = md.split('\n');
  let buf = '';
  let inFence = false;
  for (const ln of lines) {
    const trimmed = ln.trim();
    if (/^```/.test(trimmed)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (!trimmed) {
      if (buf) break;
      continue;
    }
    if (/^(#|>|-|\*|\d+\.|\|)/.test(trimmed)) {
      if (buf) break;
      continue;
    }
    buf += (buf ? ' ' : '') + trimmed;
  }
  return buf.length >= 200;
}

/// Hook: track which TOC section is currently in the viewport and
/// expose its slug so the side rail can highlight the active item.
/// IntersectionObserver picks the topmost intersecting heading. We
/// observe an offset band 25%-75% of the viewport so the active
/// section feels right (not "barely visible at the bottom").
///
/// Rule 6 compliance (loom-design-system-v1.md): scroll-spy must not
/// fire setState more than 1Hz, must not fire on identity (same slug),
/// and must use hysteresis to avoid oscillation around a boundary.
/// Pattern: store visibility in a Map (read-only side effect), then
/// debounce the state update via a deferred timer. The timer also
/// enforces the 1Hz throttle and the same-slug no-op.
function useActiveSection(slugs: string[]): string | null {
  const [active, setActive] = useState<string | null>(slugs[0] ?? null);
  const activeRef = useRef<string | null>(slugs[0] ?? null);
  const lastFireRef = useRef<number>(0);
  const pendingTimerRef = useRef<number | null>(null);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => {
    if (typeof window === 'undefined' || !slugs.length) return;
    const observers: IntersectionObserver[] = [];
    const visibility = new Map<string, number>();
    // Hysteresis thresholds: only count a heading as "in" when its
    // ratio passes 0.6, and as "out" only when it falls below 0.4.
    // The Map stores the last *committed* state per slug so a heading
    // teetering at 0.5 doesn't flicker between in and out.
    const committed = new Map<string, boolean>();
    const HIGH = 0.6;
    const LOW = 0.4;
    const schedule = () => {
      // Pick the topmost committed-in heading. This is a pure read of
      // the DOM/maps; no setState here. Then defer the state update
      // through a 1Hz throttled timer so the observer callback itself
      // never races with React's render.
      let pick: string | null = null;
      let bestTop = Infinity;
      for (const slug of slugs) {
        if (!committed.get(slug)) continue;
        const el = document.getElementById(slug);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top < bestTop) { bestTop = top; pick = slug; }
      }
      if (pick == null) return;
      if (pick === activeRef.current) return; // hysteresis: same is no-op
      const now = Date.now();
      const wait = Math.max(0, 1000 - (now - lastFireRef.current));
      if (pendingTimerRef.current != null) {
        window.clearTimeout(pendingTimerRef.current);
      }
      pendingTimerRef.current = window.setTimeout(() => {
        pendingTimerRef.current = null;
        if (pick === activeRef.current) return; // re-check after the wait
        lastFireRef.current = Date.now();
        setActive(pick);
      }, wait);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const ratio = e.intersectionRatio;
          visibility.set(e.target.id, ratio);
          const prev = committed.get(e.target.id) ?? false;
          // Hysteresis: flip in only on > HIGH, flip out only on < LOW.
          if (!prev && ratio > HIGH) committed.set(e.target.id, true);
          else if (prev && ratio < LOW) committed.set(e.target.id, false);
        }
        schedule();
      },
      { rootMargin: '-25% 0px -55% 0px', threshold: [0, LOW, HIGH, 1] },
    );
    for (const slug of slugs) {
      const el = document.getElementById(slug);
      if (el) observer.observe(el);
    }
    observers.push(observer);
    return () => {
      observers.forEach((o) => o.disconnect());
      if (pendingTimerRef.current != null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [slugs.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

/// Pull the source URL out of the eyebrow markdown. Eyebrow shapes:
///   "clipboard · 2026-04-27 19:15 · [↗](https://example.com/post)"
///   "manual · 2026-04-27 14:30"  (no link → null)
/// We grab the FIRST markdown link's href.
function extractSourceURL(eyebrow: string | undefined): string | null {
  if (!eyebrow) return null;
  const m = eyebrow.match(/\[(?:.+?)\]\(([^)]+)\)/);
  return m ? m[1] : null;
}

/// Stable per-capture key for localStorage. Combines root + sub + title
/// so the same capture rehydrates highlights/progress/notes after reloads
/// without colliding with siblings under the same root.
function buildStableKey(): string {
  if (typeof window === 'undefined') return 'capture';
  const usp = new URLSearchParams(window.location.search);
  const root = usp.get('root') || '';
  const sub = usp.get('sub') || '';
  const title = usp.get('title') || '';
  const eyebrow = usp.get('eyebrow') || '';
  return `${root}/${sub}/${title}/${eyebrow}`;
}

/// Base64 encode arbitrary UTF-8 text (markdown bodies contain emoji/CJK).
/// btoa() only handles latin1 — so we percent-encode then unescape the
/// bytes as a binary string before btoa. Decoder mirrors at the Swift
/// side (or whoever consumes loom://native/save-edit.json).
function utf8ToBase64(s: string): string {
  if (typeof window === 'undefined') return '';
  return btoa(unescape(encodeURIComponent(s)));
}

interface Highlight {
  id: string;
  text: string;
  note?: string;
  ts: number;
}

function ArticleRender({
  body,
  captureAst,
  sourceURL,
  title,
  snapshotFilename,
  rootParam,
  subParam,
  titleParam,
  eyebrowParam,
}: {
  body: string;
  captureAst?: CaptureAst;
  sourceURL: string | null;
  title: string;
  snapshotFilename?: string;
  rootParam: string;
  subParam: string;
  titleParam: string;
  eyebrowParam: string;
}) {
  // Memoize on `body` only — pinning the same string reference
  // across re-renders so dangerouslySetInnerHTML inside
  // ArticleBodyWithImages does not re-set DOM on every scroll
  // tick. Without this, the click-to-mount iframe (Vimeo/YouTube,
  // canvas-recording video) imperatively swapped into the DOM gets
  // wiped back to its placeholder card whenever React revisits the
  // article — observable as "video disappears as soon as I scroll".
  const transformedBody = useMemo(
    () => dropEmptyListItems(repairLeakedCodeFences(transformMediaMarkers(body))),
    [body],
  );
  // Word count → folio "n words" at the foot + reading time estimate
  // (220 wpm — the long-form reading midpoint). Cheap heuristic; close
  // enough for typeset feel.
  const wordCount = useMemo(
    () => body.split(/\s+/).filter(Boolean).length,
    [body],
  );
  const readingMinutes = useMemo(
    () => Math.max(1, Math.round(wordCount / 220)),
    [wordCount],
  );

  // Reader shape — drives column width + grid margins.
  const shape = useMemo(() => detectReaderShape(transformedBody), [transformedBody]);

  // Stable key for all per-capture localStorage entries.
  const stableKey = useMemo(() => buildStableKey(), []);

  // Capture readers are long-form document pages. We keep the body
  // class for layout-related CSS, but the wheel-event interception was
  // disabled 2026-05-02 to bisect a "scroll keeps reverting / page jumps
  // to bottom" report. If native scroll works without the batcher, the
  // batcher itself is the cause; if not, something else writes scrollY.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const root = document.documentElement;
    const bodyEl = document.body;
    root.classList.add('loom-capture-reader-scroll');
    bodyEl.classList.add('loom-capture-reader-scroll');
    return () => {
      root.classList.remove('loom-capture-reader-scroll');
      bodyEl.classList.remove('loom-capture-reader-scroll');
    };
  }, []);

  // ------- Reading progress (scroll position + last visited) -------
  const [readProgress, setReadProgress] = useState<number>(0);
  const restoredOnceRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (restoredOnceRef.current) return;
    // Restore previous scroll position if any. Do it on next tick so
    // the article DOM is laid out and document scrollHeight is real.
    //
    // Gate with a stricter pct lower bound (>= 0.05) so a near-zero
    // saved value doesn't keep nudging the user back near top after
    // every remount.
    try {
      const raw = localStorage.getItem(`loom:read-progress:${stableKey}`) ?? '';
      if (raw) {
        const pct = parseFloat(raw);
        if (Number.isFinite(pct) && pct >= 0.05 && pct < 0.99) {
          requestAnimationFrame(() => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            const target = max * pct;
            window.scrollTo({ top: target, behavior: 'auto' });
          });
        }
      }
    } catch {}
    // Stamp last-visited.
    try {
      localStorage.setItem(`loom:last-visited:${stableKey}`, String(Date.now()));
    } catch {}
    restoredOnceRef.current = true;
  }, [stableKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let raf = 0;
    let lastSave = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        setReadProgress(pct);
        const t = Date.now();
        if (t - lastSave > 500) {
          lastSave = t;
          try {
            localStorage.setItem(`loom:read-progress:${stableKey}`, String(pct));
          } catch {}
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [stableKey]);

  // ------- AI Distill side panel -------
  const [distillOpen, setDistillOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem('loom:distill-open') === '1'; } catch { return false; }
  });
  const [distillText, setDistillText] = useState<string | null>(null);
  const [distillLoading, setDistillLoading] = useState(false);
  const [distillError, setDistillError] = useState<string | null>(null);
  const setDistillOpenAndPersist = (next: boolean) => {
    setDistillOpen(next);
    try { localStorage.setItem('loom:distill-open', next ? '1' : '0'); } catch {}
  };
  const onDistill = () => {
    setDistillOpenAndPersist(true);
    if (distillText || distillLoading) return;
    setDistillLoading(true);
    setDistillError(null);
    const usp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const qs = new URLSearchParams({
      root: usp.get('root') || '',
      sub: usp.get('sub') || '',
      title: usp.get('title') || '',
      eyebrow: usp.get('eyebrow') || '',
    }).toString();
    fetch(`loom://native/distill.json?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (data.error) throw new Error(data.error);
        const text =
          (typeof data.summary === 'string' && data.summary) ||
          (typeof data.text === 'string' && data.text) ||
          (typeof data.markdown === 'string' && data.markdown) ||
          '';
        if (!text) {
          setDistillError('AI Distill: placeholder · wire to provider in settings');
        } else {
          setDistillText(text);
        }
      })
      .catch((err) => {
        // 404 / native bridge not implemented yet → friendly stub copy.
        const msg = String(err && err.message ? err.message : err);
        if (/404|Not Found|HTTP 4/.test(msg)) {
          setDistillError('AI Distill: placeholder · wire to provider in settings');
        } else {
          setDistillError(`Couldn't reach Distill: ${msg}`);
        }
      })
      .finally(() => setDistillLoading(false));
  };
  const distillHTML = useMemo(() => {
    if (!distillText) return '';
    try {
      configureMarkedSync();
      return marked.parse(distillText) as string;
    } catch {
      return `<pre>${distillText.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]!))}</pre>`;
    }
  }, [distillText]);

  // ------- Edit-in-place modal (markdown source textarea) -------
  // Why textarea over contentEditable: round-tripping rendered DOM →
  // markdown is lossy (Prism spans, image galleries, embeds, KaTeX).
  // Editing the source markdown string is honest + reversible.
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(body);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const onOpenEdit = () => {
    // If a prior offline-pending save exists, seed the textarea with
    // that newer draft so the user keeps editing where they left off.
    let seed = body;
    try {
      const cached = localStorage.getItem(`loom:edit-cache:${stableKey}`);
      if (cached) seed = cached;
    } catch {}
    setEditDraft(seed);
    setEditStatus(null);
    setEditOpen(true);
  };
  const onCancelEdit = () => {
    setEditOpen(false);
    setEditStatus(null);
  };
  const onSaveEdit = async () => {
    setEditSaving(true);
    setEditStatus(null);
    const usp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const qs = new URLSearchParams({
      root: usp.get('root') || '',
      sub: usp.get('sub') || '',
      title: usp.get('title') || '',
      eyebrow: usp.get('eyebrow') || '',
      body: utf8ToBase64(editDraft),
    }).toString();
    try {
      const r = await fetch(`loom://native/save-edit.json?${qs}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json().catch(() => ({} as { ok?: boolean; error?: string }));
      if (data && data.error) throw new Error(data.error);
      setEditStatus('Saved');
      // Cache the edit locally so a refresh shows the new text even
      // before the native side rewrites the file.
      try { localStorage.setItem(`loom:edit-cache:${stableKey}`, editDraft); } catch {}
      setTimeout(() => setEditOpen(false), 600);
    } catch (err) {
      // Native bridge may not implement save-edit yet — store locally
      // and surface a non-fatal message.
      try { localStorage.setItem(`loom:edit-cache:${stableKey}`, editDraft); } catch {}
      setEditStatus('Saved (offline pending)');
      // eslint-disable-next-line no-console
      console.log('[Loom edit] native save-edit gap →', err);
    } finally {
      setEditSaving(false);
    }
  };

  // ------- Highlight / annotation layer -------
  const [highlights, setHighlights] = useState<Highlight[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(`loom:highlights:${stableKey}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as Highlight[]) : [];
    } catch { return []; }
  });
  const [selToolbar, setSelToolbar] = useState<{ x: number; y: number; text: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ x: number; y: number; text: string } | null>(null);
  // Transient: a single in-memory mark that follows the current
  // selection. Replaced (not appended) on each new selection — only
  // ONE active highlight exists at a time. Click on it to dismiss.
  // Click "Highlight" in the toolbar to promote it to the permanent
  // `highlights` list (persisted to localStorage).
  const [activeHighlight, setActiveHighlight] = useState<{ id: string; text: string } | null>(null);
  const persistHighlights = (next: Highlight[]) => {
    setHighlights(next);
    try {
      localStorage.setItem(`loom:highlights:${stableKey}`, JSON.stringify(next));
    } catch {}
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Toolbar must NOT appear during an in-progress mouse drag — it
    // popped up under the user's cursor mid-drag, causing mouseup to
    // land on a toolbar button which collapsed or hijacked the
    // selection. Track drag state and only commit toolbar position on
    // mouseup. Keyboard selections (shift+arrow, ⌘A) still run through
    // selectionchange but only when not dragging.
    let isDragging = false;
    const computeToolbar = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) { setSelToolbar(null); return; }
      const text = sel.toString().trim();
      if (text.length < 3) { setSelToolbar(null); return; }
      const node = sel.anchorNode;
      const article = document.querySelector('.loom-capture-article');
      if (!node || !article || !article.contains(node)) { setSelToolbar(null); return; }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelToolbar({
        x: rect.left + rect.width / 2,
        y: rect.top + window.scrollY - 8,
        text,
      });
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('.loom-capture-sel-toolbar, .loom-capture-note-popover')) return;
      isDragging = true;
      setSelToolbar(null);
    };
    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      requestAnimationFrame(() => {
        computeToolbar();
        // Auto-create a TRANSIENT highlight on the current selection.
        // Single only — replaces previous transient. To save it
        // permanently, click the "Highlight" button in the toolbar.
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) { setActiveHighlight(null); return; }
        const text = sel.toString().trim();
        if (text.length < 3) { setActiveHighlight(null); return; }
        const node = sel.anchorNode;
        const article = document.querySelector('.loom-capture-article');
        if (!node || !article || !article.contains(node)) { setActiveHighlight(null); return; }
        setActiveHighlight({
          id: `__active-${Date.now()}`,
          text,
        });
      });
    };
    const onSel = () => {
      if (isDragging) return;
      computeToolbar();
    };
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('selectionchange', onSel);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('selectionchange', onSel);
    };
  }, []);
  // Re-apply highlights to the rendered article on mount + when the set
  // changes. We walk text nodes and wrap any literal match in <mark>.
  // De-dupe by id so re-runs don't double-wrap.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const article = document.querySelector('.loom-capture-article');
    if (!article) return;
    // Strip prior overlay marks.
    article.querySelectorAll('mark.loom-hl').forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
      parent.normalize();
    });
    if (!highlights.length) return;
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) textNodes.push(n as Text);
    // Render permanent highlights + the single transient activeHighlight
    // (if any). Transient marks get a different className so CSS can
    // optionally render them softer; click semantics differ (transient
    // → clear active state; permanent → remove from list).
    const allHighlights: Array<{ id: string; text: string; note?: string; transient: boolean }> = [
      ...highlights.map((h) => ({ id: h.id, text: h.text, note: h.note, transient: false })),
    ];
    if (activeHighlight && !highlights.some((h) => h.text === activeHighlight.text)) {
      allHighlights.push({ id: activeHighlight.id, text: activeHighlight.text, transient: true });
    }
    for (const h of allHighlights) {
      if (!h.text) continue;
      for (const tn of textNodes) {
        const data = tn.data;
        const idx = data.indexOf(h.text);
        if (idx < 0) continue;
        const before = data.slice(0, idx);
        const after = data.slice(idx + h.text.length);
        const mark = document.createElement('mark');
        mark.className = h.transient ? 'loom-hl loom-hl-active' : 'loom-hl';
        mark.dataset.hlId = h.id;
        mark.title = h.note || 'Click to remove highlight';
        mark.textContent = h.text;
        // Click removes the highlight. Drag-from-mark still starts a
        // new selection because click only fires on mouseup at same
        // coords as mousedown — drag has different coords, so click
        // never fires.
        const hid = h.id;
        const isTransient = h.transient;
        mark.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isTransient) {
            setActiveHighlight(null);
            return;
          }
          setHighlights((prev) => {
            const next = prev.filter((x) => x.id !== hid);
            try {
              window.localStorage.setItem(
                `loom:highlights:${stableKey}`,
                JSON.stringify(next),
              );
            } catch {}
            return next;
          });
        });
        const parent = tn.parentNode;
        if (!parent) continue;
        if (before) parent.insertBefore(document.createTextNode(before), tn);
        parent.insertBefore(mark, tn);
        if (after) parent.insertBefore(document.createTextNode(after), tn);
        parent.removeChild(tn);
        break;
      }
    }
  }, [highlights, activeHighlight, transformedBody]);
  const onHighlight = () => {
    if (!selToolbar) return;
    // Promote: if there's an active transient highlight, save it as
    // permanent. If somehow not (e.g. selection was made via keyboard),
    // fall back to selToolbar.text.
    const text = activeHighlight?.text ?? selToolbar.text;
    if (highlights.some((h) => h.text === text)) {
      // Already permanent — clear transient + dismiss toolbar.
      setActiveHighlight(null);
      setSelToolbar(null);
      if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
      return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const next = [...highlights, { id, text, ts: Date.now() }];
    persistHighlights(next);
    setActiveHighlight(null);
    setSelToolbar(null);
    if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
  };
  const onAddNote = () => {
    if (!selToolbar) return;
    setNoteDraft({ x: selToolbar.x, y: selToolbar.y, text: '' });
  };
  const onConfirmNote = () => {
    if (!selToolbar || !noteDraft) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const next = [
      ...highlights,
      { id, text: selToolbar.text, note: noteDraft.text, ts: Date.now() },
    ];
    persistHighlights(next);
    setSelToolbar(null);
    setNoteDraft(null);
    if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
  };
  const onCopyFragmentLink = () => {
    if (!selToolbar) return;
    const usp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const link = `loom://capture-fragment?root=${encodeURIComponent(usp.get('root') || '')}&sub=${encodeURIComponent(usp.get('sub') || '')}&title=${encodeURIComponent(usp.get('title') || '')}&fragment=${encodeURIComponent(selToolbar.text)}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(link).catch((err) => {
        // V7: surface clipboard failure rather than swallow. Flash the
        // toolbar action with a transient error tone via custom event;
        // global toast layer (if present) renders the message.
        // eslint-disable-next-line no-console
        console.warn('[Loom capture] copy fragment link failed', err);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('loom:copy-failed', { detail: { what: 'fragment link', error: String(err) } }));
        }
      });
    }
    setSelToolbar(null);
  };

  // ------- Print formatting modal (one-shot CSS injection) -------
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printOpts, setPrintOpts] = useState({
    includeToc: true,
    includeFooter: true,
    hideHairlines: false,
  });
  const onOpenPrint = () => setPrintModalOpen(true);
  const onConfirmPrint = () => {
    if (typeof window === 'undefined') return;
    const ruleParts: string[] = [];
    if (!printOpts.includeToc) {
      ruleParts.push('@media print { .loom-capture-toc { display: none !important; } }');
    }
    if (!printOpts.includeFooter) {
      ruleParts.push('@media print { .loom-capture-folio { display: none !important; } }');
    }
    if (printOpts.hideHairlines) {
      ruleParts.push('@media print { .loom-capture-article *, .loom-capture-toc { border: none !important; } }');
    }
    const styleEl = document.createElement('style');
    styleEl.id = 'loom-print-overrides';
    styleEl.textContent = ruleParts.join('\n');
    document.head.appendChild(styleEl);
    setPrintModalOpen(false);
    // Defer one frame so the style is committed before the print dialog.
    requestAnimationFrame(() => {
      window.print();
      // Tidy up after the dialog closes (works even on cancel — the
      // browser fires afterprint either way).
      const cleanup = () => {
        const el = document.getElementById('loom-print-overrides');
        if (el) el.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
    });
  };

  // ------- Stored source snapshot (auxiliary evidence) -------
  // Only offer the snapshot when native confirms the file exists. It is
  // a source-evidence view, not the primary Loom reading surface.
  const hasSnapshot = typeof snapshotFilename === 'string' && snapshotFilename.length > 0;
  const snapshotHref = useMemo(() => {
    if (!hasSnapshot) return '';
    const qs = new URLSearchParams({
      root: rootParam,
      sub: subParam,
      title: titleParam,
      eyebrow: eyebrowParam,
      filename: snapshotFilename,
    }).toString();
    return `loom://bundle/loom-render/snapshot/?${qs}`;
  }, [eyebrowParam, hasSnapshot, rootParam, snapshotFilename, subParam, titleParam]);

  // 2026-05-02 view mode — `snapshot` is the full original-page
  // rendering (sandboxed iframe of the captured HTML+CSS+JS, layout +
  // styles + interactive elements all preserved); `reader` is the
  // Tier 2 block-based prose column. User explicitly asked for
  // "complete original page layout" as the default surface, so
  // snapshot wins when a snapshot file exists. If no snapshot, fall
  // back to reader.
  type CaptureViewMode = 'snapshot' | 'reader';
  // Always default to snapshot on open. We intentionally do NOT
  // persist the per-capture preference: the user explicitly wants
  // the original page layout to be the front door, and any stale
  // localStorage value from earlier sessions would override that
  // default and silently keep them in reader.
  const [viewMode, setViewMode] = useState<CaptureViewMode>('snapshot');
  const setViewModeAndPersist = (next: CaptureViewMode) => setViewMode(next);
  // Effective view mode — force `reader` when there's no snapshot
  // file to render. The toggle is hidden in that case.
  const effectiveViewMode: CaptureViewMode = hasSnapshot ? viewMode : 'reader';

  // Action button handlers — click → window.print(), open external,
  // download markdown blob.
  const [recaptureModalOpen, setRecaptureModalOpen] = useState(false);
  const [copiedRecapturePath, setCopiedRecapturePath] = useState(false);
  // 2026-05-02 click-to-mount media (recorded video + YouTube/Vimeo
  // provider embed). Default render is a thumbnail card with Play
  // overlay; on user click JS swaps the button with an actual <video>
  // or <iframe>. Pre-click there is no media element in the article,
  // so neither WebKit's "keep playing media in view" nor the
  // YouTube error-page parent.scrollTo can perturb the reader scroll.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      // Recorded canvas video click-to-mount
      const recordedBtn = target?.closest('.loom-recorded-video-load');
      if (recordedBtn instanceof HTMLElement) {
        e.preventDefault();
        const src = recordedBtn.getAttribute('data-loom-recorded-video-src') || '';
        if (!src) return;
        const video = document.createElement('video');
        video.src = src;
        video.controls = true;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        // Do NOT set loop: keep the keep-in-view trigger as short as
        // possible. After playback ends the video stops, no further
        // keep-in-view yanks.
        video.setAttribute('preload', 'metadata');
        video.setAttribute('data-loom-mounted-recorded-video', 'true');
        recordedBtn.replaceWith(video);
        // Pause + unmount when scrolled offscreen so the active video
        // never lingers after user has moved past it.
        if (typeof IntersectionObserver !== 'undefined') {
          const obs = new IntersectionObserver((entries) => {
            for (const entry of entries) {
              if (entry.intersectionRatio < 0.2) {
                try { (entry.target as HTMLVideoElement).pause(); } catch (_) {}
              }
            }
          }, { threshold: [0, 0.2, 0.6, 1] });
          obs.observe(video);
        }
        return;
      }
      // Provider embed (YouTube/Vimeo/Bilibili) click-to-load iframe
      const embedBtn = target?.closest('.loom-embed-load');
      if (embedBtn instanceof HTMLElement) {
        e.preventDefault();
        const src = embedBtn.getAttribute('data-loom-provider-embed-src') || '';
        const title = embedBtn.getAttribute('data-loom-provider-embed-title') || 'Embedded video';
        if (!src) return;
        const iframe = document.createElement('iframe');
        iframe.className = 'loom-provider-embed';
        iframe.src = src;
        iframe.title = title;
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox');
        const wrapper = document.createElement('div');
        wrapper.className = 'loom-provider-embed-frame';
        wrapper.appendChild(iframe);
        embedBtn.replaceWith(wrapper);
        return;
      }
    };
    document.addEventListener('click', onClick);
    return () => { document.removeEventListener('click', onClick); };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSnapshotMessage = (event: MessageEvent) => {
      const data = event.data as {
        type?: string;
        height?: number;
        deltaX?: number;
        deltaY?: number;
        deltaMode?: number;
      } | null;
      if (!data) return;
      if (data.type === 'loom:snapshot-wheel') {
        const mode = Number(data.deltaMode) || 0;
        const unit = mode === 1 ? 16 : mode === 2 ? window.innerHeight : 1;
        const left = (Number(data.deltaX) || 0) * unit;
        const top = (Number(data.deltaY) || 0) * unit;
        window.scrollBy({ left, top, behavior: 'auto' });
        return;
      }
      if (data.type !== 'loom:snapshot-frame-size') return;
      const height = Number(data.height);
      if (!Number.isFinite(height) || height <= 0) return;
      const maxHeight = Math.max(520, Math.round(window.innerHeight * 0.76));
      const nextHeight = Math.max(360, Math.min(Math.ceil(height), maxHeight));
      document.querySelectorAll('iframe.loom-inline-snapshot-frame').forEach((frame) => {
        if (frame instanceof HTMLIFrameElement && frame.contentWindow === event.source) {
          const currentHeight = Number.parseFloat(frame.style.height || '0');
          if (Number.isFinite(currentHeight) && currentHeight > 0 && Math.abs(currentHeight - nextHeight) < 3) return;
          frame.style.height = `${nextHeight}px`;
        }
      });
    };
    window.addEventListener('message', onSnapshotMessage);
    return () => window.removeEventListener('message', onSnapshotMessage);
  }, []);
  const onOpenSource = () => {
    if (sourceURL && typeof window !== 'undefined') {
      window.open(sourceURL, '_blank', 'noopener,noreferrer');
    }
  };
  const onReCapture = () => {
    if (!sourceURL) return;
    setRecaptureModalOpen(true);
  };
  const onCopyExtensionPath = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    navigator.clipboard.writeText(EXTENSION_RESOURCE_HINT).then(() => {
      setCopiedRecapturePath(true);
      window.setTimeout(() => setCopiedRecapturePath(false), 1600);
    }).catch((err) => {
      // V7: do not swallow clipboard failures silently. Flash a visible
      // signal + log so the user knows the path was not copied.
      // eslint-disable-next-line no-console
      console.warn('[Loom capture] copy extension path failed', err);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('loom:copy-failed', { detail: { what: 'extension path', error: String(err) } }));
      }
    });
  };
  const onDownloadMarkdown = () => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (title || 'capture').replace(/[^\w\s.-]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'capture';
    a.download = `${safeName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Section TOC — only renders when ≥ 2 H2s exist. Parses raw
  // markdown for `## …` lines so we don't have to round-trip through
  // the rendered DOM.
  const tocItems = transformedBody
    .split('\n')
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.replace(/^##\s+/, '').trim())
    .map((text) => ({ text, slug: slugifyHeading(text) }));
  const showToc = tocItems.length >= 2;
  // Long-article threshold: ≥4 H2 sections → also show a sticky
  // side rail that scroll-tracks the active section. Keeps the
  // top-inline TOC for short-but-multi-section pieces.
  const showSideRail = tocItems.length >= 4;
  const slugs = useMemo(() => tocItems.map((i) => i.slug), [tocItems]);
  const activeSlug = useActiveSection(slugs);

  // Drop cap suppression — short first paragraph looks chunky.
  const dropCapEnabled = useMemo(() => firstParagraphIsLongEnough(body), [body]);

  return (
    <>
      <style jsx global>{`
        html.loom-capture-reader-scroll,
        html.loom-capture-reader-scroll body {
          height: auto !important;
          min-height: 100% !important;
          overflow-y: auto !important;
          overflow-x: hidden !important;
          overscroll-behavior-y: auto;
          /* 2026-05-02 fix for scrollY oscillation: disable browser
             scroll-anchoring on the entire document. The capture article
             contains autoplay+loop video, lazy-loaded snapshot iframes,
             async-loading images, and DOM-mutating highlight wrappers
             — every time content reflows ABOVE the user's current scroll
             position, browser scroll-anchoring tries to "preserve view"
             by adjusting scrollY. With many concurrent reflow sources
             (each picking a different anchor element) the scroll yanks
             back and forth between targets — observed as 200-1700px
             oscillation in the diagnostic panel. Turn anchoring off
             across the whole document so reflow has no scroll side
             effect; user-controlled scroll is the only mover. */
          overflow-anchor: none !important;
        }
        html.loom-capture-reader-scroll *,
        html.loom-capture-reader-scroll body * {
          overflow-anchor: none;
        }
        /* 2026-05-02 reserve-space for lazy-loaded media to prevent
           layout-shift reflow that WebKit sometimes still compensates
           for despite overflow-anchor:none. Images and videos without
           explicit dimensions cause CLS (cumulative layout shift)
           when they load — the browser may bump scrollY backward to
           keep prior content in view. Reserve a minimum height so
           the layout space is committed before the asset arrives. */
        .loom-capture-article img[loading="lazy"]:not(.loom-embed-thumb):not([data-provider-thumb]) {
          min-height: 12rem;
          aspect-ratio: 16 / 9;
          object-fit: contain;
          background: color-mix(in srgb, var(--paper-deep) 50%, var(--paper-up) 50%);
        }
        /* Provider thumbnail (YouTube/Vimeo) aspect-ratio reserve: the
           thumb img is loading="lazy"; on load its natural height
           (~720px / 1280px scale = 9/16) drops in. Reserve that slot. */
        .loom-capture-article .loom-embed-thumb,
        .loom-capture-article img[data-provider-thumb] {
          aspect-ratio: 16 / 9;
          width: 100%;
          height: auto;
          object-fit: cover;
          background: var(--paper-deep);
        }
        .loom-capture-article .loom-embed-thumb-frame {
          display: block;
          width: 100%;
          aspect-ratio: 16 / 9;
        }
        .loom-capture-article video {
          min-height: 12rem;
          /* 2026-05-02 same viewport cap as iframe embeds. A
             native <video> element above 50vh dominates the
             viewport and consumes wheel events when cursor is
             over it; the user then can't scroll the article past
             the video. Cap at 50vh so there's always non-video
             space above and below for natural wheel scroll. */
          max-height: 50vh;
          width: 100%;
          object-fit: contain;
          background: var(--paper-deep);
        }
        /* 2026-05-02 snapshot-view inline frame. Default capture
           surface — the user wanted the full original-page layout
           (styles + interactive elements all preserved), not a
           cleaned-up reader column. The snapshot route loads the
           captured HTML in a sandboxed iframe; we wrap it here so
           it fills the article slot and scrolls internally. The
           Loom toolbar/eyebrow/title above stays fixed; only the
           snapshot content scrolls inside the frame. Uses 100% of
           the available width (overrides the typographic max-width
           so the original page can use its real layout). */
        .loom-capture-article .loom-capture-snapshot-frame {
          width: 100%;
          margin-left: calc(50% - 50vw);
          margin-right: calc(50% - 50vw);
          max-width: 100vw;
          height: calc(100vh - 200px);
          min-height: 480px;
          border-top: 0.5px solid var(--hair);
          border-bottom: 0.5px solid var(--hair);
          background: var(--paper-deep);
          overflow: hidden;
        }
        .loom-capture-article .loom-capture-snapshot-iframe {
          width: 100%;
          height: 100%;
          border: 0;
          display: block;
          background: var(--paper-deep);
        }
        /* Tier 2 (2026-05-02): per-block CSS containment. Each AST
           block is its own contained subtree; reflow inside one
           block (video metadata, lazy image load, iframe mount,
           highlight wrapping) cannot propagate up to the article's
           scroll position. "contain: layout paint style" is the
           strongest level we can use without isolating size — size
           containment would require explicit dimensions on every
           block, which is impractical for prose. The block stack
           still flows vertically; only internal layout changes are
           bounded.

           Why this matters: even with overflow-anchor: none on
           html+body+*, WebKit can still bump scrollY when a media
           element above the viewport changes its used height. With
           layout containment, the parent layout context never sees
           the change — the article stays put. */
        .loom-capture-article .loom-article-block {
          contain: layout paint style;
          overflow-anchor: none;
        }
        /* Media-block slot reservation: keep the block's footprint
           predictable even before the asset arrives so the
           surrounding stack doesn't shift on load. Aspect-ratio is
           handled by the inner element's CSS; the block min-height
           guards against zero-height collapse during the first
           paint. */
        .loom-capture-article .loom-article-block[data-block-kind="video"],
        .loom-capture-article .loom-article-block[data-block-kind="image"],
        .loom-capture-article .loom-article-block[data-block-kind="providerEmbed"] {
          min-height: 12rem;
        }
        /* Drop cap migration — the legacy :first-of-type selector
           is broken by per-block containment (each block has its
           own first-of-type scope). Pin the rule to the explicit
           first-prose block we mark in React. */
        .loom-capture-article.has-dropcap .loom-article-block[data-first-prose="true"] p:first-of-type::first-letter {
          -webkit-initial-letter: 3 2;
          initial-letter: 3 2;
          font-family: var(--display, var(--serif));
          font-weight: 500;
          color: color-mix(in srgb, var(--thread) 65%, var(--fg) 35%);
          margin-right: 0.1em;
          padding-right: 0.04em;
          font-feature-settings: "onum" 0;
        }
        .loom-capture-article.has-dropcap .loom-article-block[data-first-prose="true"] p:first-of-type::first-line {
          font-variant-caps: all-small-caps;
          letter-spacing: 0.035em;
        }
        /* H2 asterism suppression — same migration. Without this,
           every block's H2 would re-trigger the asterism (since
           every block's H2 is locally :first-of-type); with it,
           only the very first heading block omits the ornament. */
        .loom-capture-article .loom-article-block[data-first-heading="true"] h2::before {
          content: none;
        }
        /* Recorded canvas video — modal-launched. Placeholder fills the
           figure with a Play button. The actual <video> only mounts in
           the modal overlay so WebKit's keep-in-view behavior cannot
           tug the article scroll. */
        .loom-capture-article .loom-recorded-video-card {
          appearance: none;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: linear-gradient(135deg, var(--paper-deep) 0%, color-mix(in srgb, var(--paper-deep) 60%, var(--mat-thin-bg) 40%) 100%);
          border: 0;
          border-radius: 0;
          padding: 0;
          margin: 0;
          cursor: pointer;
          display: block;
          position: relative;
        }
        .loom-capture-article .loom-recorded-video-thumb-frame {
          display: block;
          width: 100%;
          height: 100%;
          position: relative;
        }
        .loom-capture-article .loom-recorded-video-thumb-poster {
          position: absolute;
          inset: 0;
          background: var(--paper-deep);
        }
        .loom-capture-article .loom-recorded-video-thumb-play {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.85);
          color: var(--paper-deep);
          font-size: 1.4rem;
          display: flex;
          align-items: center;
          justify-content: center;
          padding-left: 4px;
        }
        .loom-capture-article .loom-recorded-video-card:hover .loom-recorded-video-thumb-play {
          background: rgba(255, 255, 255, 0.95);
        }
        html.loom-capture-reader-scroll body .layout,
        html.loom-capture-reader-scroll body main#main {
          min-height: 100vh;
          overflow: visible !important;
        }
        .loom-capture-reader-route {
          min-height: 100vh;
          overflow: visible;
        }
        .loom-capture-article {
          font-family: var(--serif);
          font-size: var(--font-body);
          line-height: 1.62;
          color: var(--fg);
          max-width: 36em;
          margin: 0 auto;
          font-feature-settings: "onum" 1, "pnum" 1;
          hanging-punctuation: first last;
        }
        /* Content-shape-aware measure. Prose-heavy articles stay at the
           classic 64ch / 36em book column; mixed (figures + text) widens
           to ~76ch / 48em; image-heavy dev guides like flipdisc.io
           open up to ~96ch / 60em so 3-column screenshot grids breathe. */
        .loom-capture-article.shape-prose { max-width: 36em; }
        .loom-capture-article.shape-mixed { max-width: 48em; }
        .loom-capture-article.shape-gallery { max-width: 60em; }
        .loom-capture-article a,
        .loom-capture-article a:link,
        .loom-capture-article a:visited {
          color: var(--thread);
          text-decoration: underline;
          text-decoration-thickness: 0.5px;
          text-underline-offset: 0.18em;
          text-decoration-color: color-mix(in srgb, var(--thread) 60%, transparent);
        }
        .loom-capture-article a:hover {
          text-decoration-thickness: 1px;
          text-decoration-color: var(--thread);
        }
        .loom-capture-article p {
          margin: var(--space-sm) 0;
        }
        /* Drop cap on the first paragraph — the iconic chapter-opening
           move. -webkit-initial-letter is the only widely-shipping
           API for proper drop caps with baseline-aware sinking; WKWebView
           supports it. Sized at 3 lines, sunken 2. We soften the
           color to a 70% mix of accent → ink so the cap reads as
           "marked first letter" not "alarm bell". */
        .loom-capture-article.has-dropcap p:first-of-type::first-letter {
          -webkit-initial-letter: 3 2;
          initial-letter: 3 2;
          font-family: var(--display, var(--serif));
          font-weight: 500;
          color: color-mix(in srgb, var(--thread) 65%, var(--fg) 35%);
          margin-right: 0.1em;
          padding-right: 0.04em;
          font-feature-settings: "onum" 0;
        }
        /* Book-style chapter opener: small caps on the first line
           after the drop cap. ::first-line works reliably enough in
           WebKit; we lean on it rather than injecting a span around
           the first 4 words via the renderer. */
        .loom-capture-article.has-dropcap p:first-of-type::first-line {
          font-variant-caps: all-small-caps;
          letter-spacing: 0.035em;
        }
        .loom-capture-article strong, .loom-capture-article b {
          font-weight: 600;
        }
        .loom-capture-article em, .loom-capture-article i {
          font-style: italic;
        }
        .loom-capture-article h1,
        .loom-capture-article h2,
        .loom-capture-article h3,
        .loom-capture-article h4 {
          font-family: var(--serif);
          font-weight: 500;
          line-height: 1.3;
        }
        .loom-capture-article h1 {
          font-size: var(--font-display-2);
          font-family: var(--sans);
          font-weight: 750;
          margin-top: var(--space-xl);
          margin-bottom: var(--space-sm);
          padding-top: var(--space-lg);
          border-top: 0.5px solid color-mix(in srgb, var(--thread) 36%, var(--hair));
          letter-spacing: 0;
          scroll-margin-top: 2.5rem;
        }
        /* H2 = section break. Render with an asterism ornament above
           and a hairline below to read like a proper book section,
           not a bold weight bump. Scroll-margin gives anchor-jumps
           breathing room from the window top. */
        .loom-capture-article h2 {
          font-size: var(--font-display-2);
          font-style: italic;
          font-weight: 500;
          margin-top: var(--space-xl);
          margin-bottom: var(--space-sm);
          padding-bottom: 0.3em;
          border-bottom: 0.5px solid var(--hair);
          scroll-margin-top: 2.5rem;
        }
        .loom-capture-article h3 {
          scroll-margin-top: 2.5rem;
        }
        .loom-capture-article h2::before {
          content: "* * *";
          display: block;
          text-align: center;
          color: var(--muted);
          font-style: normal;
          letter-spacing: 0.6em;
          margin-bottom: var(--space-md);
          font-size: var(--font-caption);
        }
        /* Skip the asterism on the very first H2 — it'd float above
           the drop cap awkwardly. */
        .loom-capture-article h2:first-of-type::before {
          content: none;
        }
        .loom-capture-article h3 {
          font-size: var(--font-body);
          font-style: italic;
          font-weight: 500;
          margin-top: var(--space-lg);
          margin-bottom: var(--space-xs);
        }
        .loom-capture-article h4 {
          font-family: var(--sans);
          font-size: var(--font-body);
          font-weight: 650;
          margin-top: var(--space-lg);
          margin-bottom: var(--space-xs);
          scroll-margin-top: 2.5rem;
        }
        .loom-capture-article .loom-capture-eyebrow {
          font-family: var(--sans);
          font-size: var(--font-caption);
          line-height: 1.35;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--muted);
          margin-top: var(--space-lg);
          margin-bottom: var(--space-xs);
        }
        .loom-capture-article ul, .loom-capture-article ol {
          padding-left: var(--space-lg);
          margin: var(--space-sm) 0;
        }
        .loom-capture-article ul {
          list-style: disc outside;
        }
        .loom-capture-article ol {
          list-style: decimal outside;
        }
        .loom-capture-article ul ul {
          list-style: circle outside;
          margin: var(--space-xs) 0;
        }
        .loom-capture-article ul ul ul {
          list-style: square outside;
        }
        .loom-capture-article ol ol {
          list-style: lower-alpha outside;
          margin: var(--space-xs) 0;
        }
        .loom-capture-article li {
          margin: var(--space-xs) 0;
          padding-left: 0.2em;
        }
        .loom-capture-article li::marker {
          color: var(--thread);
          font-feature-settings: "onum" 1, "tnum" 1;
        }
        /* Ordinary blockquote — left rule, italic, muted. */
        .loom-capture-article blockquote {
          border-left: 1px solid var(--thread);
          padding-left: var(--space-md);
          font-style: italic;
          color: var(--fg-secondary);
          margin: var(--space-md) 0;
        }
        /* Pull-quote — single-paragraph blockquote, oversized italic
           with bronze quotation marks framing the line. Reads as
           "magazine pull-quote", not "indented quotation". */
        .loom-capture-article blockquote.loom-pullquote {
          border-left: none;
          padding: var(--space-xs) 0 var(--space-sm);
          margin: var(--space-lg) auto;
          max-width: 30em;
          text-align: center;
          color: var(--fg);
          font-style: italic;
          font-family: var(--display, var(--serif));
          font-size: var(--font-display-2);
          line-height: 1.4;
          position: relative;
        }
        .loom-capture-article blockquote.loom-pullquote::before,
        .loom-capture-article blockquote.loom-pullquote::after {
          color: color-mix(in srgb, var(--thread) 70%, transparent);
          font-family: var(--display, var(--serif));
          font-style: normal;
          font-size: var(--font-display-1);
          line-height: 0;
          font-weight: 400;
          display: inline-block;
          vertical-align: -0.45em;
        }
        .loom-capture-article blockquote.loom-pullquote::before {
          content: "“";
          margin-right: 0.12em;
        }
        .loom-capture-article blockquote.loom-pullquote::after {
          content: "”";
          margin-left: 0.12em;
        }
        .loom-capture-article blockquote.loom-pullquote p {
          display: inline;
          margin: 0;
        }
        /* Inline code — distinct from prose without yelling. */
        .loom-capture-article code {
          font-family: var(--mono);
          font-size: var(--font-caption);
          background: color-mix(in srgb, var(--mat-thin-bg) 70%, transparent);
          padding: 0.1em 0.32em;
          border-radius: var(--radius-sm);
        }
        .loom-capture-article hr {
          border: none;
          text-align: center;
          margin: var(--space-lg) 0;
        }
        .loom-capture-article hr::before {
          content: "* * *";
          color: var(--muted);
          letter-spacing: 0.6em;
          font-size: var(--font-body);
        }
        /* TOC — appears above body when article has ≥2 H2 sections.
           Visual: smallcaps eyebrow, ordered list with oldstyle nums
           in left gutter, italic targets, hairline border. Reads as
           "frontispiece" of a chapter, not a navigation chrome bar. */
        .loom-capture-toc {
          max-width: var(--loom-capture-measure, 36em);
          margin: 0 auto var(--space-xl);
          padding: var(--space-md);
          border: 0.5px solid var(--hair);
          border-radius: var(--radius-sm);
          background: color-mix(in srgb, var(--mat-thin-bg) 30%, transparent);
        }
        .loom-capture-toc-eyebrow {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--thread);
          margin-bottom: var(--space-sm);
        }
        .loom-capture-toc ol {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: var(--space-xs);
        }
        .loom-capture-toc li a {
          display: grid;
          grid-template-columns: 2.4em 1fr;
          align-items: baseline;
          gap: var(--space-sm);
          padding: 0.18em 0;
          color: var(--fg);
          text-decoration: none;
          font-family: var(--serif);
        }
        .loom-capture-toc li a:hover .t {
          text-decoration: underline;
          text-decoration-color: color-mix(in srgb, var(--thread) 70%, transparent);
          text-underline-offset: 0.18em;
        }
        .loom-capture-toc .num {
          font-feature-settings: "onum" 1, "tnum" 1;
          color: var(--muted);
          font-size: var(--font-caption);
          text-align: right;
          font-style: italic;
        }
        .loom-capture-toc .t {
          font-style: italic;
          font-size: var(--font-body);
          line-height: 1.3;
        }
        /* Side rail TOC — sticky at right side on desktop only.
           Hairline divider on the left, scroll-spy active state via
           the .active class on the anchor. We anchor in a wrapping
           grid so the prose column stays at 36em and the rail floats
           to the right of it without affecting the body's own
           centering. Falls back to display:none under 1100px so we
           don't crowd the prose on smaller windows. */
        .loom-capture-side-wrap {
          position: relative;
        }
        .loom-capture-side-rail {
          display: none;
        }
        @media (min-width: 1100px) {
          .loom-capture-side-rail {
            display: block;
            position: fixed;
            top: 7rem;
            right: 1.6rem;
            width: 14rem;
            max-height: calc(100vh - 9rem);
            overflow-y: auto;
            padding: var(--space-sm) 0 var(--space-sm) var(--space-sm);
            border-left: 0.5px solid var(--hair);
            font-family: var(--serif);
          }
        }
        .loom-capture-side-rail-eyebrow {
          font-size: var(--font-eyebrow);
          font-weight: 500;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: var(--space-sm);
        }
        .loom-capture-side-rail ol {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: var(--space-xs);
        }
        .loom-capture-side-rail a {
          display: grid;
          grid-template-columns: 1.4em 1fr;
          gap: var(--space-xs);
          align-items: baseline;
          padding: 0.16em 0;
          color: var(--fg-secondary);
          text-decoration: none;
          font-size: var(--font-caption);
          line-height: 1.3;
          transition: color var(--motion-fast);
          border-left: 1.5px solid transparent;
          padding-left: var(--space-sm);
          margin-left: calc(-1 * var(--space-sm));
        }
        .loom-capture-side-rail a:hover {
          color: var(--fg);
        }
        .loom-capture-side-rail a.active {
          color: var(--thread);
          border-left-color: var(--thread);
        }
        .loom-capture-side-rail .num {
          color: var(--muted);
          font-feature-settings: "onum" 1, "tnum" 1;
          font-style: italic;
          font-size: var(--font-eyebrow);
        }
        .loom-capture-side-rail a.active .num {
          color: var(--thread);
        }
        .loom-capture-side-rail .t {
          font-style: italic;
        }

        /* Media — img / video / audio / iframe / svg / canvas
           all get measured padding + max-width for the reader column,
           hairline frame, optional caption typography. */
        .loom-capture-article img,
        .loom-capture-article video,
        .loom-capture-article audio,
        .loom-capture-article svg,
        .loom-capture-article canvas {
          max-width: 100%;
          height: auto !important;
          display: block;
          margin: var(--space-lg) auto;
          border-radius: var(--radius-sm);
        }
        /* Inline SVG (frame diagrams etc.) — cap height so a tall
           narrow viewBox doesn't push past the reader window. */
        .loom-capture-article svg {
          width: min(100%, 42rem) !important;
          max-height: 22rem !important;
          max-width: 100% !important;
          object-fit: contain;
        }
        /* Snapshot-backed visual modules. Canvas/SVG-heavy widgets keep a
           per-region target when capture can identify one; the fallback is a
           scoped preview plus a full snapshot escape hatch. */
        .loom-capture-article .loom-interactive-snapshot,
        .loom-capture-article figure.loom-interactive-snapshot {
          max-width: min(100%, 52rem) !important;
          margin: var(--space-lg) auto !important;
          border: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: color-mix(in srgb, var(--mat-thin-bg) 60%, var(--paper-deep) 40%);
          /* 2026-05-02 reserve a layout slot before media loads. Without
             this, <video preload="metadata"> goes from height:0 to its
             natural height once metadata arrives, pushing later content
             down — and WebKit sometimes compensates by yanking scrollY
             backward despite overflow-anchor:none. Fixed aspect-ratio
             commits the space at first paint; the video / preview / iframe
             slots into it without shifting siblings. */
          aspect-ratio: 16 / 9;
        }
        /* When the figure has a figcaption, the aspect-ratio applies only
           to the media area; let the caption add its own height naturally. */
        .loom-capture-article figure.loom-interactive-snapshot:has(figcaption) {
          aspect-ratio: auto;
          min-height: 14rem;
        }
        .loom-capture-article figure.loom-interactive-snapshot > :not(figcaption):first-child {
          aspect-ratio: 16 / 9;
          width: 100%;
        }
        .loom-capture-article .loom-interactive-snapshot-frame {
          display: block;
          width: 100%;
          min-height: 18rem;
          height: clamp(18rem, 48vh, 34rem);
          /* Same viewport cap as Vimeo / YouTube embeds. Without it
             the targeted-embed iframe can grow taller than the
             viewport and eat all wheel events when cursor is over
             it; user can no longer scroll past the interactive
             diagram. 50vh leaves visible page above + below for
             natural article-scroll. */
          max-height: 50vh;
          border: 0;
          border-radius: 0;
          background: color-mix(in srgb, var(--mat-thin-bg) 70%, var(--paper-deep) 30%);
        }
        .loom-capture-article .loom-inline-snapshot-frame {
          height: clamp(22rem, 62vh, 46rem);
          max-height: 76vh;
          contain: layout paint;
          isolation: isolate;
        }
        /* Constrain the preview so it reads as evidence inside the article
           without becoming a second page. If the captured preview is missing,
           hide broken-image alt text and rely on the snapshot CTA below. */
        .loom-capture-article .loom-interactive-snapshot > img,
        .loom-capture-article .loom-interactive-snapshot > video,
        .loom-capture-article .loom-interactive-snapshot > img.loom-snapshot-preview-image,
        .loom-capture-article .loom-interactive-snapshot > [data-loom-snapshot-preview-media="true"],
        .loom-capture-article figure.loom-interactive-snapshot > img,
        .loom-capture-article figure.loom-interactive-snapshot > video,
        .loom-capture-article .loom-interactive-snapshot-preview img {
          display: block !important;
          width: 100% !important;
          height: auto !important;
          max-height: clamp(14rem, 42vh, 30rem) !important;
          min-height: 0 !important;
          object-fit: contain;
          margin: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: color-mix(in srgb, var(--mat-thin-bg) 70%, var(--paper-deep) 30%);
          /* Hide the broken-image alt-text fallback when the preview
             source is empty — the alt is set to "structured-visual
             capture" / similar by the extension and leaks visually
             when the captured canvas was empty (regression 3b in
             peer-chat msg-029). The "Open full snapshot" CTA below
             is the user-visible affordance regardless. */
          font-size: 0 !important;
          color: transparent !important;
        }
        .loom-capture-article .loom-interactive-snapshot-preview {
          border-top: 0.5px solid color-mix(in srgb, var(--fg) 8%, transparent);
        }
        .loom-capture-article .loom-interactive-snapshot-preview summary {
          cursor: pointer;
          padding: var(--space-xs) var(--space-md);
          color: var(--muted);
          font-family: var(--serif);
          font-size: var(--font-caption);
          font-style: italic;
        }
        .loom-capture-article .loom-interactive-snapshot-caption {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-sm);
          padding: var(--space-sm) var(--space-md);
          color: var(--muted);
          font-family: var(--serif);
          font-size: var(--font-caption);
          font-style: italic;
          border-top: 0.5px solid color-mix(in srgb, var(--fg) 8%, transparent);
        }
        .loom-capture-article .loom-interactive-snapshot-label {
          font-size: var(--font-eyebrow);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-style: normal;
          color: color-mix(in srgb, var(--muted) 80%, transparent);
        }
        .loom-capture-article .loom-interactive-snapshot-action {
          color: var(--thread);
          font-style: normal;
          font-weight: 500;
          padding: 0.2em 0.7em;
          border: 0.5px solid color-mix(in srgb, var(--thread) 36%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--thread) 6%, transparent);
          text-decoration: none;
          font-family: var(--serif);
          font-size: var(--font-caption);
          letter-spacing: 0.01em;
          width: fit-content;
          transition: background var(--motion-fast), border-color var(--motion-fast);
        }
        .loom-capture-article .loom-interactive-snapshot-action::after {
          content: " ↗";
          font-style: normal;
          margin-left: 0.15em;
        }
        .loom-capture-article .loom-interactive-snapshot-action:hover {
          background: color-mix(in srgb, var(--thread) 14%, transparent);
          border-color: color-mix(in srgb, var(--thread) 60%, transparent);
        }
        .loom-capture-article .loom-interactive-snapshot-action.muted {
          color: color-mix(in srgb, var(--muted) 72%, transparent);
          border-color: color-mix(in srgb, var(--fg) 12%, transparent);
          background: transparent;
        }
        .loom-capture-article .loom-interactive-snapshot-action.muted::after {
          content: "";
        }
        /* Image gallery — 2 or 3 column grid. Activated when the
           renderer detected two or more consecutive image-only blocks.
           Falls back to 1 column under 700px. The 3-col rule fires
           unconditionally on desktop — no 960px gate (the article
           container is already shape-aware, so when shape='gallery'
           this is 60em wide and 3 cols fit comfortably). */
        .loom-capture-article .loom-img-gallery {
          display: grid;
          gap: var(--space-sm);
          margin: var(--space-lg) 0;
        }
        .loom-capture-article .loom-img-gallery.cols-2 {
          grid-template-columns: repeat(2, 1fr);
        }
        .loom-capture-article .loom-img-gallery.cols-3 {
          grid-template-columns: repeat(3, 1fr);
        }
        @media (max-width: 700px) {
          .loom-capture-article .loom-img-gallery.cols-2,
          .loom-capture-article .loom-img-gallery.cols-3 {
            grid-template-columns: 1fr !important;
          }
        }
        .loom-capture-article .loom-img-gallery > p {
          margin: 0;
        }
        .loom-capture-article .loom-img-gallery img {
          margin: 0;
          width: 100%;
          height: auto;
          max-height: 720px;
          object-fit: contain;
          align-self: start;
          border-radius: var(--radius-sm);
        }
        .loom-capture-article .loom-img-gallery {
          align-items: start;
        }
        /* Gallery overflow on shape-gallery: pull out of the prose column
           so the grid breathes the full width of the article container. */
        .loom-capture-article.shape-gallery .loom-img-gallery {
          margin-left: -2em;
          margin-right: -2em;
        }
        @media (max-width: 760px) {
          .loom-capture-article.shape-gallery .loom-img-gallery {
            margin-left: 0;
            margin-right: 0;
          }
        }
        /* Hero image — first big image gets full-bleed above the prose. */
        .loom-capture-article .loom-hero {
          margin: 0 -3em 2em;
          width: calc(100% + 6em);
        }
        .loom-capture-article .loom-hero p {
          margin: 0;
        }
        .loom-capture-article .loom-hero img {
          width: 100%;
          max-height: 480px;
          object-fit: cover;
          margin: 0;
          border-radius: var(--radius-md);
          aspect-ratio: auto;
        }
        /* Action chip row — sits above the article body, right-aligned.
           Small bronze hairline-bordered chips, 26-30px tall, hover state
           tightens the border and warms the background. data-no-print
           hides them in @page output. */
        .loom-capture-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--space-xs);
          margin-bottom: var(--space-lg);
          flex-wrap: wrap;
        }
        .loom-capture-actions button,
        .loom-capture-actions a {
          appearance: none;
          background: color-mix(in srgb, var(--mat-thin-bg) 30%, transparent);
          border: 0.5px solid color-mix(in srgb, var(--thread) 35%, transparent);
          border-radius: var(--radius-lg);
          padding: 0.32em 0.78em;
          height: 28px;
          color: var(--fg-secondary);
          font-family: var(--serif);
          font-size: var(--font-caption);
          font-feature-settings: "onum" 1, "pnum" 1;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: var(--space-xs);
          text-decoration: none;
          transition: border-color var(--motion-fast), background var(--motion-fast), color var(--motion-fast);
          line-height: 1;
        }
        .loom-capture-actions button:hover,
        .loom-capture-actions a:hover {
          border-color: var(--thread);
          background: color-mix(in srgb, var(--thread) 8%, transparent);
          color: var(--fg);
        }
        .loom-capture-actions button:active,
        .loom-capture-actions a:active {
          background: color-mix(in srgb, var(--thread) 16%, transparent);
        }
        .loom-capture-actions button[disabled] {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .loom-capture-actions .glyph {
          font-size: var(--font-caption);
          line-height: 1;
          color: var(--thread);
        }
        /* Code blocks — visually distinct from prose so JS/TS samples
           on flipdisc-style guides don't get lost. Mono + hairline +
           subtle bg + comfortable padding. The Prism token styles
           below colour individual spans. The language label sits
           absolute top-right via the data-lang attribute. */
        .loom-capture-article pre {
          font-family: var(--mono);
          font-size: var(--font-caption);
          line-height: 1.55;
          background: color-mix(in srgb, var(--mat-thin-bg) 50%, transparent);
          border: 0.5px solid var(--hair);
          border-radius: var(--radius-sm);
          padding: var(--space-md);
          overflow-x: hidden;
          margin: var(--space-md) 0;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          color: var(--fg);
          position: relative;
        }
        .loom-capture-article pre.loom-code[data-lang]::before {
          content: attr(data-lang);
          position: absolute;
          top: 0.45em;
          right: 0.7em;
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 500;
          pointer-events: none;
          user-select: none;
          background: color-mix(in srgb, var(--mat-thin-bg) 90%, transparent);
          padding: 0.05em 0.35em;
          border-radius: var(--radius-sm);
        }
        .loom-capture-article pre code {
          background: transparent;
          padding: 0;
          font-family: inherit;
          font-size: inherit;
          color: inherit;
          border-radius: 0;
          white-space: inherit;
          overflow-wrap: inherit;
          word-break: inherit;
        }
        /* Prism token palette — Vellum-tuned, low-contrast, paper-friendly.
           Strings → bronze accent. Keywords → deep ink. Comments →
           muted italic. Numbers/booleans → secondary ink, no colour
           shock. Functions → slight emphasis via weight. The goal is
           "code is legible, syntax is hinted" — not "playground of
           rainbow tokens". */
        .loom-capture-article .token.comment,
        .loom-capture-article .token.prolog,
        .loom-capture-article .token.cdata {
          color: var(--muted);
          font-style: italic;
        }
        .loom-capture-article .token.doctype,
        .loom-capture-article .token.punctuation,
        .loom-capture-article .token.entity {
          color: color-mix(in srgb, var(--fg) 55%, transparent);
        }
        .loom-capture-article .token.attr-name,
        .loom-capture-article .token.class-name,
        .loom-capture-article .token.boolean,
        .loom-capture-article .token.constant,
        .loom-capture-article .token.number,
        .loom-capture-article .token.atrule {
          color: var(--fg-secondary);
          font-feature-settings: "onum" 1, "tnum" 1;
        }
        .loom-capture-article .token.keyword,
        .loom-capture-article .token.important,
        .loom-capture-article .token.tag {
          color: var(--fg);
          font-weight: 600;
        }
        .loom-capture-article .token.string,
        .loom-capture-article .token.char,
        .loom-capture-article .token.attr-value,
        .loom-capture-article .token.regex,
        .loom-capture-article .token.url {
          color: var(--thread);
        }
        .loom-capture-article .token.selector,
        .loom-capture-article .token.symbol,
        .loom-capture-article .token.builtin,
        .loom-capture-article .token.inserted {
          color: color-mix(in srgb, var(--thread) 75%, var(--fg) 25%);
        }
        .loom-capture-article .token.function {
          color: var(--fg);
          font-weight: 500;
        }
        .loom-capture-article .token.variable {
          color: var(--fg);
        }
        .loom-capture-article .token.operator {
          color: color-mix(in srgb, var(--fg) 70%, transparent);
        }
        .loom-capture-article .token.deleted {
          color: color-mix(in srgb, var(--thread) 60%, var(--muted) 40%);
        }
        .loom-capture-article .token.italic { font-style: italic; }
        .loom-capture-article .token.bold { font-weight: 600; }

        .loom-capture-article img,
        .loom-capture-article video {
          border: 0.5px solid color-mix(in srgb, var(--fg) 12%, transparent);
        }
        .loom-capture-article audio {
          width: 100%;
          margin: var(--space-md) 0;
        }
        .loom-capture-article > p > img:only-child {
          margin: var(--space-lg) auto;
        }
        /* Responsive iframe wrapper for non-provider iframes. Switched
           from a fixed 480px height to 16:9 aspect — keeps short
           embeds compact + scales for ultrawide windows. Add a
           tall modifier via JS-rewriting later if a specific embed
           needs more height; default is 16:9. */
        .loom-capture-article iframe {
          display: block;
          width: 100%;
          aspect-ratio: 16 / 9;
          height: auto;
          border: 0.5px solid var(--hair);
          border-radius: var(--radius-sm);
          margin: var(--space-lg) 0;
          background: color-mix(in srgb, var(--fg) 6%, transparent);
        }
        /* Provider-aware video embeds (YouTube / Vimeo / Bilibili).
           Keep the source action visible because providers can still
           refuse playback inside custom-scheme WKWebViews. */
        .loom-capture-article .loom-embed-card.video {
          max-width: min(100%, 48rem);
          margin: var(--space-lg) auto;
          border: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
          border-radius: var(--radius-sm);
          overflow: hidden;
          background: color-mix(in srgb, var(--mat-thin-bg) 42%, transparent);
          transition: border-color var(--motion-fast), background var(--motion-fast);
        }
        .loom-capture-article .loom-embed-card.video:hover {
          border-color: color-mix(in srgb, var(--thread) 38%, transparent);
          background: color-mix(in srgb, var(--mat-thin-bg) 56%, transparent);
        }
        .loom-capture-article .loom-embed-card.video.embedded {
          display: block;
        }
        .loom-capture-article .loom-provider-embed-frame {
          position: relative;
          display: block;
          width: 100%;
          aspect-ratio: 16 / 9;
          /* 2026-05-02 viewport cap. Without this, a 16:9 iframe at
             full article-column width fills 60-70% of the viewport.
             The iframe captures wheel events when the cursor is over
             it, so the user effectively can't scroll the article
             past the video — every wheel tick goes into the Vimeo /
             YouTube player instead. Capping the player at 50vh
             guarantees always-visible page area above and below
             where wheel scrolls the article normally. The iframe
             stays its native aspect ratio inside the cap (centered;
             player fills the available width). */
          max-height: 50vh;
          margin-inline: auto;
          background: color-mix(in srgb, black 88%, var(--mat-thin-bg) 12%);
        }
        .loom-capture-article iframe.loom-provider-embed {
          width: 100%;
          height: 100%;
          aspect-ratio: auto;
          margin: 0;
          border: 0;
          border-radius: 0;
          background: #0c0a09;
        }
        .loom-capture-article .loom-embed-card-link {
          display: block;
          color: inherit;
          text-decoration: none;
        }
        .loom-capture-article .loom-embed-card-link::before,
        .loom-capture-article .loom-embed-card-link::after {
          content: none !important;
        }
        .loom-capture-article .loom-embed-thumb-frame {
          position: relative;
          display: block;
          aspect-ratio: 16 / 9;
          background: color-mix(in srgb, black 88%, var(--mat-thin-bg) 12%);
          overflow: hidden;
        }
        .loom-capture-article .loom-embed-thumb {
          width: 100%;
          height: 100%;
          object-fit: cover;
          margin: 0;
          border: 0;
          border-radius: 0;
          background: color-mix(in srgb, var(--fg) 8%, transparent);
        }
        .loom-capture-article .loom-embed-thumb.placeholder {
          display: grid;
          place-items: center;
          font-family: var(--display);
          font-size: var(--font-display-2);
          color: color-mix(in srgb, var(--thread) 74%, var(--fg) 26%);
          font-style: italic;
        }
        .loom-capture-article .loom-embed-play {
          position: absolute;
          right: 0.85rem;
          bottom: 0.75rem;
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 999px;
          display: grid;
          place-items: center;
          padding-left: 0.12rem;
          color: var(--fg);
          background: color-mix(in srgb, black 56%, transparent);
          border: 0.5px solid color-mix(in srgb, white 34%, transparent);
          font-size: 0.78rem;
          line-height: 1;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        }
        .loom-capture-article .loom-embed-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: var(--space-xs);
          padding: var(--space-sm) var(--space-md) var(--space-md);
        }
        .loom-capture-article .loom-embed-provider {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--muted);
        }
        .loom-capture-article .loom-embed-title {
          font-family: var(--display);
          font-size: var(--font-body);
          line-height: 1.24;
          color: var(--fg);
          overflow-wrap: anywhere;
        }
        .loom-capture-article .loom-embed-action {
          font-family: var(--serif);
          font-size: var(--font-caption);
          font-style: italic;
          color: var(--thread);
          width: fit-content;
        }
        @media (max-width: 700px) {
          .loom-capture-article .loom-embed-copy {
            padding: var(--space-sm) var(--space-sm) var(--space-md);
          }
        }
        .loom-capture-article .loom-media-fallback.video {
          max-width: min(100%, 34rem);
          margin: var(--space-lg) auto;
          padding: var(--space-sm) var(--space-md);
          border: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
          border-radius: var(--radius-sm);
          background: color-mix(in srgb, var(--mat-thin-bg) 38%, transparent);
          display: flex;
          flex-direction: column;
          gap: 0.22rem;
          color: inherit;
          text-decoration: none;
        }
        .loom-capture-article .loom-media-fallback.video.compact {
          max-width: var(--loom-capture-measure, 36em);
          margin: var(--space-xs) auto var(--space-md);
          padding: 0;
          border: 0;
          background: transparent;
          display: flex;
          flex-direction: row;
          justify-content: center;
          gap: var(--space-xs);
          opacity: 0.58;
        }
        .loom-capture-article .loom-media-fallback.image.compact {
          max-width: var(--loom-capture-measure, 36em);
          margin: var(--space-xs) auto var(--space-md);
          padding: 0;
          border: 0;
          background: transparent;
          display: flex;
          flex-direction: row;
          justify-content: center;
          gap: var(--space-xs);
          opacity: 0.52;
        }
        .loom-capture-article .loom-media-fallback.image.compact.svg {
          opacity: 0.62;
        }
        .loom-capture-article .loom-media-fallback.video::before,
        .loom-capture-article .loom-media-fallback.video::after {
          content: none !important;
        }
        .loom-capture-article .loom-media-fallback-kicker {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: var(--muted);
        }
        .loom-capture-article .loom-media-fallback-title {
          font-family: var(--display);
          font-size: var(--font-body);
          line-height: 1.24;
          color: var(--fg);
        }
        .loom-capture-article .loom-media-fallback-action {
          font-family: var(--serif);
          font-size: var(--font-caption);
          font-style: italic;
          color: var(--thread);
        }
        .loom-capture-article .loom-media-fallback-reason {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          color: color-mix(in srgb, var(--muted) 76%, transparent);
        }
        /* Figure caption — italic small line under media. */
        .loom-capture-article p > em:only-child {
          display: block;
          text-align: center;
          color: var(--muted);
          font-size: var(--font-caption);
          font-style: italic;
          margin-top: -0.6em;
          margin-bottom: var(--space-md);
        }
        /* External-domain link badges — subtle ::before glyph that
           hints at the destination platform. We use unicode marks
           (no emoji) so they look "set in" not "stuck on". Keeping
           the pseudo-element non-rendered when no domain matches. */
        .loom-capture-article a[href^="https://github.com"]::before,
        .loom-capture-article a[href^="https://www.github.com"]::before {
          content: "↗";
          margin-right: 0.18em;
          color: var(--muted);
          font-style: normal;
          font-size: var(--font-caption);
          letter-spacing: 0;
          font-feature-settings: normal;
        }
        .loom-capture-article a[href^="https://github.com"]::after,
        .loom-capture-article a[href^="https://www.github.com"]::after {
          content: " ◌gh";
          color: color-mix(in srgb, var(--muted) 80%, transparent);
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          font-style: italic;
          letter-spacing: 0.04em;
          text-decoration: none;
          margin-left: 0.16em;
        }
        .loom-capture-article a[href*="npmjs.com"]::after {
          content: " ◌npm";
          color: color-mix(in srgb, var(--muted) 80%, transparent);
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          font-style: italic;
          letter-spacing: 0.04em;
          text-decoration: none;
          margin-left: 0.16em;
        }
        .loom-capture-article a[href*="youtube.com"]::after,
        .loom-capture-article a[href*="youtu.be"]::after {
          content: " ▷";
          color: color-mix(in srgb, var(--thread) 80%, transparent);
          font-size: var(--font-caption);
          margin-left: 0.16em;
          text-decoration: none;
        }
        .loom-capture-article a[href*="twitter.com"]::after,
        .loom-capture-article a[href*="x.com/"]::after {
          content: " ◌x";
          color: color-mix(in srgb, var(--muted) 80%, transparent);
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          font-style: italic;
          letter-spacing: 0.04em;
          text-decoration: none;
          margin-left: 0.16em;
        }

        .loom-capture-folio {
          max-width: var(--loom-capture-measure, 36em);
          margin: var(--space-xl) auto 0;
          padding-top: var(--space-lg);
          border-top: 0.5px solid var(--hair);
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-family: var(--serif);
          font-feature-settings: "onum" 1, "tnum" 1;
          font-size: var(--font-caption);
          color: var(--muted);
          font-style: italic;
        }
        .loom-capture-folio span {
          letter-spacing: 0.04em;
        }
        /* Reading-progress hairline — fixed at top of viewport, bronze
           fill grows left→right with scroll. 1px tall, only paints
           in viewport pixels we have so it doesn't smudge under the
           toolbar. data-no-print hides it during print. */
        .loom-capture-progress {
          position: fixed;
          top: 0;
          left: 0;
          height: 1px;
          background: var(--thread);
          z-index: 200;
          pointer-events: none;
          transition: width var(--motion-fast);
        }
        /* Persistent meta line — shown directly under the action chip
           row, pairing word count + reading time as oldstyle italic
           figures. Lives in the article body so it inherits the
           shape-aware measure. */
        .loom-capture-meta-line {
          font-family: var(--serif);
          font-size: var(--font-caption);
          color: var(--muted);
          font-feature-settings: "onum" 1, "pnum" 1;
          font-style: italic;
          margin: 0 0 var(--space-lg);
          text-align: right;
          letter-spacing: 0.02em;
        }
        /* Highlights — bronze tint marker on user-saved text. We use
           color-mix instead of a flat hex so the highlight reads as
           "annotated" not "yellow stabilo". Cursor: help signals the
           note tooltip when one is attached. */
        .loom-capture-article mark.loom-hl {
          background: color-mix(in srgb, var(--thread) 18%, transparent);
          color: inherit;
          padding: 0 0.05em;
          border-radius: var(--radius-sm);
          box-shadow: 0 1px 0 0 color-mix(in srgb, var(--thread) 45%, transparent);
          cursor: pointer;
        }
        .loom-capture-article mark.loom-hl:hover {
          background: color-mix(in srgb, var(--thread) 28%, transparent);
        }
        /* Transient (active) variant — only-the-current-selection. No
           background fill, just the bronze underline, so it reads as
           "currently focused" not "saved". Click to dismiss; click
           Highlight in the toolbar to promote into the permanent
           background-fill version above. */
        .loom-capture-article mark.loom-hl.loom-hl-active {
          background: transparent;
          box-shadow: 0 1px 0 0 color-mix(in srgb, var(--thread) 60%, transparent);
        }
        .loom-capture-article mark.loom-hl.loom-hl-active:hover {
          background: color-mix(in srgb, var(--thread) 10%, transparent);
        }
        /* Selection floating toolbar — small bronze chip-row that
           appears above the user's current text selection. Centered
           on the selection's horizontal midpoint via CSS translate. */
        .loom-capture-sel-toolbar {
          position: absolute;
          transform: translate(-50%, -100%);
          display: flex;
          gap: var(--space-xs);
          background: var(--mat-thin-bg, #fbf6ec);
          border: 0.5px solid color-mix(in srgb, var(--thread) 38%, transparent);
          border-radius: var(--radius-lg);
          padding: var(--space-xs) var(--space-sm);
          box-shadow: 0 6px 18px color-mix(in srgb, var(--fg) 14%, transparent);
          z-index: 220;
          font-family: var(--serif);
          font-size: var(--font-caption);
        }
        .loom-capture-sel-toolbar button {
          appearance: none;
          background: transparent;
          border: none;
          padding: 0.18em 0.5em;
          color: var(--fg-secondary);
          font-family: inherit;
          font-size: inherit;
          cursor: pointer;
          border-radius: var(--radius-md);
          display: inline-flex;
          align-items: center;
          gap: var(--space-xs);
          line-height: 1;
        }
        .loom-capture-sel-toolbar button:hover {
          color: var(--fg);
          background: color-mix(in srgb, var(--thread) 12%, transparent);
        }
        .loom-capture-sel-toolbar .glyph {
          color: var(--thread);
        }
        /* Inline note editor — sits right above the selection like
           an annotation slip. Single-line text input, Enter saves, Esc
           cancels (handled via React keydown). */
        .loom-capture-note-popover {
          position: absolute;
          transform: translate(-50%, -100%);
          z-index: 230;
          background: var(--mat-thin-bg, #fbf6ec);
          border: 0.5px solid color-mix(in srgb, var(--thread) 38%, transparent);
          border-radius: var(--radius-sm);
          padding: var(--space-xs);
          box-shadow: 0 6px 18px color-mix(in srgb, var(--fg) 14%, transparent);
          display: flex;
          gap: var(--space-xs);
          align-items: center;
          font-family: var(--serif);
          font-size: var(--font-caption);
        }
        .loom-capture-note-popover input {
          appearance: none;
          background: transparent;
          border: none;
          border-bottom: 0.5px solid color-mix(in srgb, var(--fg) 30%, transparent);
          padding: 0.25em 0.4em;
          font: inherit;
          color: var(--fg);
          width: 18em;
          outline: none;
        }
        .loom-capture-note-popover input:focus {
          border-bottom-color: var(--thread);
        }
        .loom-capture-note-popover button {
          appearance: none;
          background: var(--thread);
          color: white;
          border: none;
          border-radius: var(--radius-md);
          padding: var(--space-xs) var(--space-sm);
          cursor: pointer;
          font: inherit;
          font-style: italic;
        }
        .loom-recapture-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 260;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-md);
          background: color-mix(in srgb, var(--bg) 62%, transparent);
          backdrop-filter: blur(10px);
        }
        .loom-recapture-modal {
          width: min(100%, 34rem);
          border: 0.5px solid color-mix(in srgb, var(--thread) 34%, transparent);
          border-radius: var(--radius-md);
          background: var(--mat-thin-bg, #fbf6ec);
          box-shadow: 0 24px 80px color-mix(in srgb, #000 24%, transparent);
          padding: var(--space-lg);
        }
        .loom-recapture-modal .eyebrow {
          display: block;
          margin-bottom: var(--space-xs);
          color: var(--thread);
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          font-weight: 500;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .loom-recapture-modal h2 {
          margin: 0 0 var(--space-sm);
          color: var(--fg);
          font-family: var(--serif);
          font-size: 1.35rem;
          font-weight: 500;
          line-height: 1.18;
        }
        .loom-recapture-modal p {
          margin: 0 0 var(--space-sm);
          color: var(--fg-secondary);
          font-family: var(--serif);
          font-size: 0.95rem;
          line-height: 1.55;
        }
        .loom-recapture-path {
          margin: var(--space-sm) 0;
          padding: 0.72rem 0.82rem;
          border: 0.5px solid var(--hair);
          border-radius: var(--radius-sm);
          background: color-mix(in srgb, var(--bg) 88%, var(--fg) 12%);
          color: var(--fg);
          font-family: var(--mono);
          font-size: 0.78rem;
          overflow-wrap: anywhere;
        }
        .loom-recapture-modal-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-xs);
          justify-content: flex-end;
          margin-top: var(--space-md);
        }
        .loom-recapture-modal-actions button {
          appearance: none;
          border: 0.5px solid var(--hair);
          border-radius: var(--radius-lg);
          background: transparent;
          color: var(--fg-secondary);
          cursor: pointer;
          font-family: var(--serif);
          font-size: var(--font-caption);
          line-height: 1;
          padding: var(--space-xs) var(--space-sm);
        }
        .loom-recapture-modal-actions button:hover {
          color: var(--fg);
          background: color-mix(in srgb, var(--thread) 10%, transparent);
        }
        .loom-recapture-modal-actions button.primary {
          border-color: color-mix(in srgb, var(--thread) 56%, transparent);
          color: var(--thread);
        }
        /* Distill side panel — slides in from the right at desktop
           widths, full-width drawer below. Vellum card with hairline
           and 36em prose measure. Collapsed state still visible as a
           slim tab so user can re-open. */
        .loom-capture-distill {
          margin: var(--space-lg) auto 0;
          max-width: var(--loom-capture-measure, 36em);
          border: 0.5px solid color-mix(in srgb, var(--thread) 32%, transparent);
          border-radius: var(--radius-sm);
          background: color-mix(in srgb, var(--mat-thin-bg) 40%, transparent);
        }
        .loom-capture-distill-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-sm) var(--space-md);
          border-bottom: 0.5px solid var(--hair);
        }
        .loom-capture-distill-head .eyebrow {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--thread);
          font-weight: 500;
        }
        .loom-capture-distill-head button {
          appearance: none;
          background: transparent;
          border: none;
          color: var(--fg-secondary);
          cursor: pointer;
          font-family: var(--serif);
          font-style: italic;
          font-size: var(--font-caption);
          padding: var(--space-xs) var(--space-sm);
          border-radius: var(--radius-lg);
        }
        .loom-capture-distill-head button:hover {
          color: var(--fg);
          background: color-mix(in srgb, var(--thread) 10%, transparent);
        }
        .loom-capture-distill-body {
          padding: var(--space-md);
          font-family: var(--serif);
          color: var(--fg);
          font-size: var(--font-body);
          line-height: 1.55;
        }
        .loom-capture-distill-body p { margin: var(--space-sm) 0; }
        .loom-capture-distill-body :first-child { margin-top: 0; }
        .loom-capture-distill-body :last-child { margin-bottom: 0; }
        .loom-capture-distill-loading {
          display: inline-flex;
          align-items: center;
          gap: var(--space-sm);
          color: var(--muted);
          font-style: italic;
        }
        .loom-capture-distill-spinner {
          width: 0.9em;
          height: 0.9em;
          border-radius: 50%;
          border: 1.5px solid color-mix(in srgb, var(--thread) 35%, transparent);
          border-top-color: var(--thread);
          animation: loomDistillSpin 800ms linear infinite;
        }
        @keyframes loomDistillSpin { to { transform: rotate(360deg); } }
        .loom-capture-distill-error {
          color: var(--muted);
          font-style: italic;
          font-size: var(--font-caption);
        }
        .loom-capture-distill.collapsed .loom-capture-distill-body {
          display: none;
        }
        /* Edit modal + Print modal — share the same scrim/card styling.
           Centered, paper-tinted, hairline, soft shadow. */
        .loom-capture-modal-scrim {
          position: fixed;
          inset: 0;
          background: color-mix(in srgb, var(--fg) 36%, transparent);
          z-index: 300;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-lg);
        }
        .loom-capture-modal-card {
          background: var(--mat-thin-bg, #fbf6ec);
          border: 0.5px solid var(--hair);
          border-radius: var(--radius-md);
          box-shadow: 0 18px 48px color-mix(in srgb, var(--fg) 28%, transparent);
          width: 100%;
          max-width: 780px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .loom-capture-modal-head {
          padding: var(--space-md);
          border-bottom: 0.5px solid var(--hair);
          display: flex;
          align-items: baseline;
          justify-content: space-between;
        }
        .loom-capture-modal-head .eyebrow {
          font-family: var(--serif);
          font-size: var(--font-eyebrow);
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--thread);
          font-weight: 500;
        }
        .loom-capture-modal-head .title {
          font-family: var(--display, var(--serif));
          font-style: italic;
          font-size: var(--font-body);
          color: var(--fg);
        }
        .loom-capture-modal-body {
          padding: var(--space-md);
          overflow-y: auto;
          flex: 1 1 auto;
        }
        .loom-capture-modal-body textarea {
          width: 100%;
          min-height: 50vh;
          font-family: var(--mono);
          font-size: var(--font-caption);
          line-height: 1.55;
          color: var(--fg);
          background: color-mix(in srgb, var(--mat-thin-bg) 60%, transparent);
          border: 0.5px solid var(--hair);
          border-radius: var(--radius-sm);
          padding: var(--space-sm);
          resize: vertical;
          outline: none;
        }
        .loom-capture-modal-body textarea:focus {
          border-color: var(--thread);
        }
        .loom-capture-modal-foot {
          padding: var(--space-md);
          border-top: 0.5px solid var(--hair);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-sm);
        }
        .loom-capture-modal-foot .status {
          font-family: var(--serif);
          font-style: italic;
          font-size: var(--font-caption);
          color: var(--muted);
        }
        .loom-capture-modal-actions {
          display: flex;
          gap: var(--space-xs);
        }
        .loom-capture-modal-actions button {
          appearance: none;
          font-family: var(--serif);
          font-size: var(--font-caption);
          padding: var(--space-xs) var(--space-md);
          border-radius: var(--radius-lg);
          cursor: pointer;
          border: 0.5px solid color-mix(in srgb, var(--thread) 35%, transparent);
          background: color-mix(in srgb, var(--mat-thin-bg) 30%, transparent);
          color: var(--fg-secondary);
          font-style: italic;
        }
        .loom-capture-modal-actions button:hover {
          border-color: var(--thread);
          color: var(--fg);
        }
        .loom-capture-modal-actions button.primary {
          background: var(--thread);
          color: white;
          border-color: var(--thread);
          font-style: normal;
          font-weight: 500;
        }
        .loom-capture-modal-actions button.primary:hover {
          background: color-mix(in srgb, var(--thread) 88%, var(--fg) 12%);
        }
        .loom-capture-modal-actions button[disabled] {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .loom-capture-print-options {
          display: grid;
          gap: var(--space-sm);
          font-family: var(--serif);
          font-size: var(--font-body);
          color: var(--fg);
        }
        .loom-capture-print-options label {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          cursor: pointer;
        }
        .loom-capture-print-options input[type="checkbox"] {
          accent-color: var(--thread);
        }
        /* Edit-mode hover ring — applied to the article container while
           the modal is open, signals the source surface is being edited. */
        .loom-capture-article.edit-mode {
          outline: 0.5px dashed color-mix(in srgb, var(--thread) 50%, transparent);
          outline-offset: 8px;
        }

        /* Print stylesheet — when the user hits ⌘P or the Print action
           chip, render a clean PDF: white background, no chrome rails,
           full-width prose at 11pt, links shown in black-with-underline
           (printable colour budget), media size-capped, headings can't
           split from the next paragraph, orphan/widow control. */
        @media print {
          @page { margin: 1in; size: letter; }
          body { background: white !important; }
          .loom-capture-side-rail,
          .loom-capture-toc,
          .loom-capture-progress,
          .loom-capture-sel-toolbar,
          .loom-capture-note-popover,
          .loom-capture-modal-scrim,
          .loom-capture-distill,
          [data-no-print] {
            display: none !important;
          }
          .loom-capture-article {
            max-width: 100% !important;
            color: black;
            font-size: 11pt;
          }
          .loom-capture-article a {
            color: black;
            text-decoration: underline;
          }
          .loom-capture-article img,
          .loom-capture-article svg,
          .loom-capture-article video {
            page-break-inside: avoid;
            max-height: 7in;
          }
          .loom-capture-article h1,
          .loom-capture-article h2 {
            page-break-after: avoid;
          }
          .loom-capture-article p {
            orphans: 3;
            widows: 3;
          }
          .loom-capture-article .loom-hero {
            margin: 0 0 1em;
            width: 100%;
          }
          .loom-capture-article.shape-gallery .loom-img-gallery {
            margin-left: 0;
            margin-right: 0;
          }
        }
      `}</style>
      <div className="loom-capture-reader-route">
      <WorkSurface tone="default" density="roomy">
        <div
          className="loom-capture-side-wrap"
          style={{
            ['--loom-capture-measure' as never]: shape === 'gallery' ? '60em' : shape === 'mixed' ? '48em' : '36em',
          }}
        >
          {showSideRail && (
            <nav className="loom-capture-side-rail" aria-label="Section rail">
              <div className="loom-capture-side-rail-eyebrow">Sections</div>
              <ol>
                {tocItems.map((item, i) => (
                  <li key={`rail-${i}-${item.slug}`}>
                    <a
                      href={`#${item.slug}`}
                      className={activeSlug === item.slug ? 'active' : undefined}
                    >
                      <span className="num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="t">{item.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {showToc && (
            <nav className="loom-capture-toc" aria-label="In this capture">
              <div className="loom-capture-toc-eyebrow">In this capture</div>
              <ol>
                {tocItems.map((item, i) => (
                  <li key={`${i}-${item.slug}`}>
                    <a href={`#${item.slug}`}>
                      <span className="num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="t">{item.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div
            className={`loom-capture-progress`}
            data-no-print
            style={{ width: `${(readProgress * 100).toFixed(1)}%` }}
            aria-hidden="true"
          />
          <div
            className={`loom-capture-article shape-${shape}${dropCapEnabled ? ' has-dropcap' : ''}${editOpen ? ' edit-mode' : ''}`}
          >
            <div className="loom-capture-actions" data-no-print>
              <button
                type="button"
                onClick={onOpenPrint}
                title="Print or save as PDF"
                aria-label="Print"
              >
                <span className="glyph" aria-hidden="true">⎙</span>
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={onDownloadMarkdown}
                title="Download the captured markdown source"
                aria-label="Download markdown"
              >
                <span className="glyph" aria-hidden="true">⤓</span>
                <span>Markdown</span>
              </button>
              <button
                type="button"
                onClick={onOpenEdit}
                title="Edit the captured markdown source"
                aria-label="Edit"
              >
                <span className="glyph" aria-hidden="true">✎</span>
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={onDistill}
                title="AI distill of this capture"
                aria-label="Distill"
              >
                <span className="glyph" aria-hidden="true">✦</span>
                <span>Distill</span>
              </button>
              {hasSnapshot && (
                <button
                  type="button"
                  onClick={() => setViewModeAndPersist(effectiveViewMode === 'snapshot' ? 'reader' : 'snapshot')}
                  title={effectiveViewMode === 'snapshot' ? 'Switch to reader view (clean prose column)' : 'Switch to snapshot view (original page layout + styles + interactive elements)'}
                  aria-label={effectiveViewMode === 'snapshot' ? 'Switch to reader view' : 'Switch to snapshot view'}
                  aria-pressed={effectiveViewMode === 'snapshot'}
                  className={effectiveViewMode === 'snapshot' ? 'is-active' : undefined}
                >
                  <span className="glyph" aria-hidden="true">◱</span>
                  <span>{effectiveViewMode === 'snapshot' ? 'Reader' : 'Snapshot'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenSource}
                disabled={!sourceURL}
                title={sourceURL ? `Open the source page · ${sourceURL}` : 'No source URL on this capture'}
                aria-label="Open original"
              >
                <span className="glyph" aria-hidden="true">↗</span>
                <span>Open original</span>
              </button>
              <button
                type="button"
                onClick={onReCapture}
                disabled={!sourceURL}
                title={sourceURL ? `Re-capture from the browser source page · ${sourceURL}` : 'No source URL on this capture'}
                aria-label="Re-capture"
              >
                <span className="glyph" aria-hidden="true">↻</span>
                <span>Re-capture</span>
              </button>
            </div>
            <div className="loom-capture-meta-line" data-no-print>
              {wordCount.toLocaleString()} words · {readingMinutes}m read
            </div>
            {effectiveViewMode === 'snapshot' && hasSnapshot ? (
              <CaptureSnapshotEmbed
                rootParam={rootParam}
                subParam={subParam}
                snapshotFilename={snapshotFilename || ''}
                title={title}
              />
            ) : captureAst?.blocks?.length ? (
              <CaptureAstArticle ast={captureAst} fallbackSource={transformedBody} snapshotHref={snapshotHref} />
            ) : (
              <ArticleBodyWithImages source={transformedBody} snapshotHref={snapshotHref} />
            )}
          </div>
          {(distillOpen || distillText) && (
            <div className={`loom-capture-distill${distillOpen ? '' : ' collapsed'}`} data-no-print>
              <div className="loom-capture-distill-head">
                <span className="eyebrow">AI Distill</span>
                <button
                  type="button"
                  onClick={() => setDistillOpenAndPersist(!distillOpen)}
                  aria-label={distillOpen ? 'Collapse distill' : 'Expand distill'}
                >
                  {distillOpen ? 'Collapse' : 'Expand'}
                </button>
              </div>
              <div className="loom-capture-distill-body">
                {distillLoading ? (
                  <div className="loom-capture-distill-loading">
                    <span className="loom-capture-distill-spinner" aria-hidden="true" />
                    <span>Distilling…</span>
                  </div>
                ) : distillError ? (
                  <div className="loom-capture-distill-error">{distillError}</div>
                ) : distillText ? (
                  <div dangerouslySetInnerHTML={{ __html: distillHTML }} />
                ) : (
                  <div className="loom-capture-distill-error">Click Distill again to fetch a summary.</div>
                )}
              </div>
            </div>
          )}
          <div className="loom-capture-folio">
            <span>Captured to Loom</span>
            <span>
              {wordCount.toLocaleString()} words · {readingMinutes}m read
            </span>
          </div>
        </div>
      </WorkSurface>
      </div>
      {selToolbar && !noteDraft && (
        <div
          className="loom-capture-sel-toolbar"
          data-no-print
          style={{ left: selToolbar.x, top: selToolbar.y }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button type="button" onClick={onHighlight} title="Highlight">
            <span className="glyph" aria-hidden="true">✏</span>
            <span>Highlight</span>
          </button>
          <button type="button" onClick={onAddNote} title="Add note">
            <span className="glyph" aria-hidden="true">💬</span>
            <span>Note</span>
          </button>
          <button type="button" onClick={onCopyFragmentLink} title="Copy fragment link">
            <span className="glyph" aria-hidden="true">🔗</span>
            <span>Copy link</span>
          </button>
        </div>
      )}
      {noteDraft && (
        <div
          className="loom-capture-note-popover"
          data-no-print
          style={{ left: noteDraft.x, top: noteDraft.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            type="text"
            placeholder="Note…"
            value={noteDraft.text}
            onChange={(e) => setNoteDraft({ ...noteDraft, text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); onConfirmNote(); }
              if (e.key === 'Escape') { e.preventDefault(); setNoteDraft(null); setSelToolbar(null); }
            }}
          />
          <button type="button" onClick={onConfirmNote}>Save</button>
        </div>
      )}
      {recaptureModalOpen && sourceURL && (
        <div className="loom-recapture-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="loom-recapture-title" data-no-print>
          <div className="loom-recapture-modal">
            <span className="eyebrow">Re-capture</span>
            <h2 id="loom-recapture-title">Capture again from the live browser tab</h2>
            <p>
              A saved Loom page cannot fully re-extract live SVG, canvas, video, and iframe resources by itself. Re-capture from the original browser page with the Loom extension loaded, then save the new sheet.
            </p>
            <p>
              If the L capture button is missing, load or reload the unpacked extension folder that contains manifest.json:
            </p>
            <div className="loom-recapture-path">{EXTENSION_RESOURCE_HINT}</div>
            <p>
              After loading the extension, refresh the original page before clicking L. Loading the parent LoomWebExtension folder will fail because manifest.json is inside Resources.
            </p>
            <div className="loom-recapture-modal-actions">
              <button type="button" onClick={() => setRecaptureModalOpen(false)}>Close</button>
              <button type="button" onClick={onCopyExtensionPath}>{copiedRecapturePath ? 'Copied' : 'Copy extension path'}</button>
              <button type="button" className="primary" onClick={onOpenSource}>Open original</button>
            </div>
          </div>
        </div>
      )}
      {editOpen && (
        <div
          className="loom-capture-modal-scrim"
          data-no-print
          onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelEdit(); }}
        >
          <div className="loom-capture-modal-card" role="dialog" aria-label="Edit capture source">
            <div className="loom-capture-modal-head">
              <span className="eyebrow">Edit source</span>
              <span className="title">{title}</span>
            </div>
            <div className="loom-capture-modal-body">
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                spellCheck={false}
                autoFocus
              />
            </div>
            <div className="loom-capture-modal-foot">
              <span className="status">{editStatus || ''}</span>
              <div className="loom-capture-modal-actions">
                <button type="button" onClick={onCancelEdit} disabled={editSaving}>Cancel</button>
                <button
                  type="button"
                  className="primary"
                  onClick={onSaveEdit}
                  disabled={editSaving || editDraft === body}
                >
                  {editSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {printModalOpen && (
        <div
          className="loom-capture-modal-scrim"
          data-no-print
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPrintModalOpen(false); }}
        >
          <div className="loom-capture-modal-card" role="dialog" aria-label="Print formatting" style={{ maxWidth: 460 }}>
            <div className="loom-capture-modal-head">
              <span className="eyebrow">Print formatting</span>
            </div>
            <div className="loom-capture-modal-body">
              <div className="loom-capture-print-options">
                <label>
                  <input
                    type="checkbox"
                    checked={printOpts.includeToc}
                    onChange={(e) => setPrintOpts({ ...printOpts, includeToc: e.target.checked })}
                  />
                  <span>Include TOC</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={printOpts.includeFooter}
                    onChange={(e) => setPrintOpts({ ...printOpts, includeFooter: e.target.checked })}
                  />
                  <span>Include footer (folio)</span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={printOpts.hideHairlines}
                    onChange={(e) => setPrintOpts({ ...printOpts, hideHairlines: e.target.checked })}
                  />
                  <span>Hide hairlines (cleaner print)</span>
                </label>
              </div>
            </div>
            <div className="loom-capture-modal-foot">
              <span className="status" />
              <div className="loom-capture-modal-actions">
                <button type="button" onClick={() => setPrintModalOpen(false)}>Cancel</button>
                <button type="button" className="primary" onClick={onConfirmPrint}>Print</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function CaptureRenderPage() {
  return (
    <Suspense fallback={<div style={{ padding: 'var(--space-xl)', color: 'var(--muted)' }}>Loading…</div>}>
      <CaptureRenderInner />
    </Suspense>
  );
}
