// Capture Tier 2 (block-based article) contract tests — pin the
// 2026-05-02 architectural fix for the multi-source scroll
// oscillation that survived every tactical workaround (wheel
// batcher, autoplay strip, snapshot-iframe disable, NSEvent monitor
// disable, etc.). The fix is per-block CSS containment: each AST
// block becomes its own React subtree wrapped in a div with
// `contain: layout paint style`, so internal reflow (video metadata
// load, lazy image load, iframe mount, highlight wrapping) cannot
// propagate to document scroll position.
//
// Replaces the prior wheel-batcher contract. The wheel batcher
// itself was retired — Tier 2 makes the wheel-eating problem moot
// at the architecture level by:
//   1. Click-to-mount video: no <video> element on the page until
//      user clicks, so WebKit's "keep playing media in view" cannot
//      yank scroll for media that doesn't exist yet.
//   2. CSS layout containment on each block: even when media does
//      mount, its reflow is bounded by the block wrapper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(repoRoot, relative), 'utf8');
}

test('CaptureAstArticle renders the full markdown body (content-completeness over AST round-trip)', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // Signature pinned for the same outer call site
  // <CaptureAstArticle ast={...} fallbackSource={...} snapshotHref={...} />.
  assert.match(source, /function CaptureAstArticle\(\{ ast, fallbackSource, snapshotHref = '' \}/);
  // 2026-05-02 reversal: AST-driven block render dropped 25
  // visualAssembly blocks (empty block.url) and missed the
  // canvas-recording video entirely. The full markdown body
  // (transformedBody) is the only path that captures every
  // paragraph / heading / code block / image / video / embed.
  assert.match(source, /<ArticleBodyWithImages source=\{fallbackSource\} snapshotHref=\{snapshotHref\} \/>/);
  assert.match(source, /data-loom-capture-ast-mode="markdown-body"/);
});

test('Each AST block is wrapped in `loom-article-block` with `data-block-kind`', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // The contained-block wrapper exists and carries the kind hook.
  assert.match(source, /<div className="loom-article-block" data-block-kind=\{kind\}/);
  // BlockArticle iterates blocks and renders ContainedAstBlock.
  assert.match(source, /<ContainedAstBlock/);
});

test('CSS containment is applied to every block (`contain: layout paint style`)', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // The architectural invariant. Without `contain: layout paint
  // style` on the block wrapper, internal reflow can propagate up
  // to the article scroll position — the very bug Tier 2 fixes.
  assert.match(source, /\.loom-capture-article \.loom-article-block \{[\s\S]*?contain: layout paint style/);
  // overflow-anchor: none on every block prevents browser scroll
  // anchoring from picking a block as anchor and reverse-scrolling
  // when the block reflows.
  assert.match(source, /\.loom-capture-article \.loom-article-block \{[\s\S]*?overflow-anchor: none/);
});

test('Media blocks (video/image/providerEmbed) reserve a min-height slot', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // The slot reservation prevents zero-height collapse on first
  // paint and keeps the surrounding block stack predictable while
  // the asset loads.
  assert.match(
    source,
    /\.loom-article-block\[data-block-kind="video"\][\s\S]*?\.loom-article-block\[data-block-kind="image"\][\s\S]*?\.loom-article-block\[data-block-kind="providerEmbed"\][\s\S]*?\{[\s\S]*?min-height:\s*12rem/,
  );
});

test('Drop cap migrates from :first-of-type to [data-first-prose="true"]', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // Per-block CSS containment isolates each block's
  // :first-of-type to its own scope; the legacy drop-cap selector
  // would match every block's first paragraph. The fix pins the
  // rule to the explicit first-prose block React marks.
  assert.match(
    source,
    /\.loom-capture-article\.has-dropcap \.loom-article-block\[data-first-prose="true"\] p:first-of-type::first-letter/,
  );
  // H2 asterism suppression migrated the same way — without this,
  // every H2 in every block would re-trigger the asterism that
  // belongs only on the very first heading.
  assert.match(
    source,
    /\.loom-capture-article \.loom-article-block\[data-first-heading="true"\] h2::before \{\s*content: none/,
  );
});

test('Video blocks render click-to-mount placeholder by default (no <video> on page-load)', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // The placeholder card replaces the <video> element until the
  // user clicks Play. Pre-click there is no media element on the
  // page, so WebKit's "keep playing media in view" + metadata-load
  // reflow cannot perturb the article scroll.
  assert.match(source, /function AstVideoBlock/);
  // Click-to-mount placeholder uses the same recorded-video card
  // class the legacy regex path emitted, so existing CSS keeps
  // working.
  assert.match(source, /className="loom-recorded-video-card loom-recorded-video-load"/);
});

test('Provider embeds (YouTube/Vimeo/Bilibili) render click-to-load placeholder', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // Same architectural reason as video: the iframe (which can
  // call parent.scrollTo from a YouTube error page via
  // allow-same-origin) only mounts after explicit user click.
  assert.match(source, /function AstProviderEmbedBlock/);
  assert.match(source, /className="loom-embed-card-link loom-embed-load"/);
});

test('Transient `loom://media/` URLs surface a Re-capture CTA, not a broken player', () => {
  const source = read('app/loom-render/capture/page.tsx');
  // Save-substitution dropped this attachment. The legacy
  // wrapSnapshotBackedMedia path emitted the same fallback; the
  // Tier 2 React path mirrors it so the user sees a recoverable
  // action instead of a black box.
  assert.match(source, /data-loom-interactive-snapshot-mode="transient-fail"/);
  assert.match(source, /Recording was not saved/);
  assert.match(source, /Use the Re-capture button at the top of this page to retry\./);
});
