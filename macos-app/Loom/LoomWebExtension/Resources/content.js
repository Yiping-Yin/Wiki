// Content script: runs in every page context. Listens for "capture"
// messages from the background script. On message, extracts the page
// content (semantic tags, then chrome-stripped
// body clone — same ladder as the bookmarklet) and triggers the
// `loom://capture?payload=...` URL scheme via a synthetic anchor
// click.
//
// Why fire the URL inside the content script (not background)? Some
// browsers (Safari especially) block background scripts from
// navigating to non-http(s) schemes. Content scripts running in the
// page context can navigate freely because the click counts as a
// user gesture.

(function () {
  'use strict';

  // Runtime detection — Safari uses `browser`, Chromium uses `chrome`.
  // Both expose the same shape; alias for ergonomics.
  const ext = (typeof browser !== 'undefined') ? browser : chrome;

  ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'capture') {
      // Async: default one-click capture keeps the rich reader body AND
      // writes an interactive snapshot evidence file. The reader remains
      // searchable/editable; canvas/WebGL/JS-driven regions stay
      // inspectable in Snapshot instead of being silently flattened to a
      // screenshot. Wrap in IIFE; return true
      // to keep the message channel open until sendResponse fires.
      (async () => {
        try {
          const payload = await captureReaderWithSnapshotPayload(undefined);
          await triggerLoomScheme(payload);
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: String(e) });
        }
      })();
      return true;
    }
  });

  function getMeta(name) {
    const el = document.querySelector(
      'meta[name="' + name + '"], meta[property="' + name + '"]'
    );
    return el && el.content ? el.content : '';
  }

  // Extraction: mini-Defuddle markdown of main content >
  // mini-Defuddle markdown of chrome-stripped body. Selection is still
  // carried separately on the payload, but it must not short-circuit
  // the rich-media walk; otherwise any accidental selection drops
  // videos, GIFs, provider cards, and canvas sidecars.
  function extractMainContent() {
    // Site-specific extractors for "list-of-pointers" pages. Generic
    // HTML→markdown on these gives readable-but-noisy output (every
    // `[hide]`, `[36 comments](item?id=…)`, `(from?site=…)` link
    // shows up). Per-site extractors pull the tuple semantics
    // ((rank, title, url, site, points, author, age, comments)) and
    // emit a clean record per row. Add more sites as the test cases
    // arrive — the dispatch is a single switch on hostname.
    const host = (location.hostname || '').toLowerCase();
    if (host === 'news.ycombinator.com') {
      const hn = extractHackerNewsFront();
      if (hn) return hn;
    }

    const semantic = document.querySelector('article, main, [role="main"]');
    if (semantic && semantic.innerText && semantic.innerText.length > 500) {
      if (shouldWalkLiveDOMForMedia(semantic)) {
        return htmlToMarkdown(semantic);
      }
      const semClone = semantic.cloneNode(true);
      stripChrome(semClone);
      return htmlToMarkdown(semClone);
    }

    if (shouldWalkLiveDOMForMedia(document.body)) {
      return htmlToMarkdown(document.body);
    }

    const clone = document.body.cloneNode(true);
    stripChrome(clone);
    return htmlToMarkdown(clone);
  }

  function shouldWalkLiveDOMForMedia(root) {
    if (!root || !root.querySelector) return false;
    return !!root.querySelector(
      'canvas, svg, video, audio, iframe, picture, ' +
      'lite-youtube, youtube-player, youtube-embed, ' +
      '[data-youtube-id], [data-videoid], [data-youtubeid]'
    );
  }

  // Hacker News frontpage / news / newest / etc — anywhere the layout
  // is a list of `tr.athing` story rows each followed by a subtext tr.
  // Returns null if the layout isn't present so the caller falls
  // through to the generic mini-Defuddle path.
  function extractHackerNewsFront() {
    const stories = document.querySelectorAll('tr.athing');
    if (!stories.length) return null;
    const lines = [];
    const pageTitle = document.title || 'Hacker News';
    lines.push('# ' + pageTitle.trim());
    lines.push('');
    stories.forEach((story) => {
      const rankRaw = (story.querySelector('.rank') || {}).textContent || '';
      const rank = rankRaw.replace(/\D/g, '');
      const titleAnchor = story.querySelector('.titleline > a, .titleline a');
      if (!titleAnchor) return;
      const title = (titleAnchor.textContent || '').trim();
      const href = titleAnchor.getAttribute('href') || '';
      // Resolve relative `item?id=…` links to full URLs so the saved
      // capture isn't broken when read outside the browser context.
      const url = (() => {
        try { return new URL(href, location.origin).toString(); }
        catch (_) { return href; }
      })();
      const sitestr = story.querySelector('.sitebit .sitestr, .sitestr');
      const site = sitestr ? sitestr.textContent.trim() : '';

      const subtextRow = story.nextElementSibling;
      const meta = [];
      if (subtextRow) {
        const score = subtextRow.querySelector('.score');
        const userA = subtextRow.querySelector('.hnuser');
        const ageA  = subtextRow.querySelector('.age a, .age');
        const subline = subtextRow.querySelector('.subline');
        if (score && score.textContent.trim()) meta.push(score.textContent.trim());
        if (userA && userA.textContent.trim()) meta.push('by ' + userA.textContent.trim());
        if (ageA  && ageA.textContent.trim())  meta.push(ageA.textContent.trim());
        if (subline) {
          const links = subline.querySelectorAll('a');
          const lastA = links[links.length - 1];
          if (lastA && /comment|discuss/i.test(lastA.textContent || '')) {
            const cText = lastA.textContent.trim();
            const cHref = lastA.getAttribute('href') || '';
            const cUrl = (() => {
              try { return new URL(cHref, location.origin).toString(); }
              catch (_) { return cHref; }
            })();
            meta.push(`[${cText}](${cUrl})`);
          }
        }
      }

      const titleLink = url ? `[${title}](${url})` : title;
      const siteSuffix = site ? ` _(${site})_` : '';
      const prefix = rank ? `${rank}. ` : '- ';
      lines.push(prefix + titleLink + siteSuffix);
      if (meta.length) lines.push('   ' + meta.join(' · '));
      lines.push('');
    });
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Strip non-content elements from a cloned subtree before walking.
  // Applied to both semantic-tag and full-body paths so screen-reader
  // text, form controls, and Moodle-style accordion chrome don't leak
  // into the markdown body.
  function stripChrome(root) {
    // Structural chrome + interactive controls. Media tags (iframe /
    // svg / canvas / video / audio) are NO LONGER stripped — Phase
    // C M2 keeps them so the rich-media capture flow can preserve
    // videos, charts, figures alongside prose. Walker has explicit
    // handlers for each.
    root.querySelectorAll(
      'nav, header, footer, aside, script, style, noscript, ' +
      'button, input, select, textarea, form, ' +
      '[role="navigation"], [role="banner"], [role="contentinfo"], ' +
      '[role="complementary"], [role="button"], [role="search"], ' +
      '[aria-hidden="true"]'
    ).forEach((e) => e.remove());

    // Tracking pixels — 1×1 transparent images, no semantic value.
    root.querySelectorAll('img').forEach((img) => {
      const w = parseInt(img.getAttribute('width') || '0', 10);
      const h = parseInt(img.getAttribute('height') || '0', 10);
      if ((w === 1 && h === 1) ||
          /pixel|tracker|beacon/i.test(img.getAttribute('src') || '') ||
          /pixel|tracker|beacon/i.test(img.className || '')) {
        img.remove();
      }
    });

    // Ad / analytics iframes — never useful, big bandwidth.
    root.querySelectorAll('iframe').forEach((frame) => {
      const src = frame.getAttribute('src') || '';
      if (/doubleclick|googletagmanager|googlesyndication|google-analytics|facebook\.(com|net)\/tr|hotjar|segment\.io|mixpanel|chartbeat/i.test(src)) {
        frame.remove();
      }
    });

    // Visually-hidden helpers (Bootstrap/Moodle sr-only spans inject
    // labels like "Select activity " before every activity link).
    root.querySelectorAll(
      '.sr-only, .visually-hidden, .screen-reader-text, .screenreader-only, ' +
      '.assistive-text, .accesshide, .visuallyhidden'
    ).forEach((e) => e.remove());

    const skipPattern = /(^|[\s_-])(nav|menu|sidebar|breadcrumb|toolbar|cookie|consent|banner|advert|ads?|popup|modal|comments?|share|social|footer|header|widget|related|recommended|teaching[-_\s]?contact|skip[-_]?link|progress[-_]?bar|completion|drawer)([\s_-]|$)/i;

    root.querySelectorAll('[id],[class]').forEach((el) => {
      const id = (el.id || '').toLowerCase();
      const cls = (typeof el.className === 'string' ? el.className : '').toLowerCase();
      if (skipPattern.test(id) || skipPattern.test(cls)) {
        el.remove();
      }
    });
  }

  // Mini-Defuddle: walks a DOM subtree and emits markdown that
  // preserves the structure that matters for re-reading later —
  // headings, ordered/unordered lists, links, code, blockquotes,
  // paragraph boundaries. Intentionally conservative: when we don't
  // recognize a tag, fall through to its children's text rather than
  // dropping. ~120 lines, no external lib.
  function htmlToMarkdown(root) {
    const lines = [];
    walk(root, lines, { listDepth: 0, listType: null, listIndex: 0 });
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ----- Media handlers (Phase C M2) -----

  /// Resolve a relative URL against the current document origin so
  /// captured assets work outside the browser context.
  function absUrl(raw) {
    if (!raw) return '';
    try { return new URL(raw, location.href).toString(); } catch (_) { return raw; }
  }

  function escapeAttr(raw) {
    return String(raw || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escapeHTML(raw) {
    return escapeAttr(raw);
  }

  function pushBlankBlock(out, lines) {
    flushLine(out);
    if (out.length && out[out.length - 1] !== '') out.push('');
    lines.forEach((l) => out.push(l));
    out.push('');
  }

  /// `<img>` and `<picture>` → markdown image with absolute URL.
  /// Prefer explicit animated/lazy source attributes first; many sites
  /// keep a static placeholder in `src`/`srcset` and the playable GIF /
  /// WebP / APNG in data-*.
  function handleImage(node, out) {
    let src = '';
    let alt = '';
    if (node.tagName.toLowerCase() === 'picture') {
      const inner = node.querySelector('img');
      if (inner) {
        src = pickFromImg(inner);
        alt = inner.getAttribute('alt') || '';
      } else {
        const source = node.querySelector('source');
        if (source) src = absUrl(pickFromSrcset(source.getAttribute('srcset') || source.getAttribute('data-srcset') || ''));
      }
    } else {
      src = pickFromImg(node);
      alt = node.getAttribute('alt') || '';
    }
    if (!src) return;

    // Skip oversize inline data URLs — bloat the Loom.md and most
    // are decorative SVG sprites we don't need to round-trip.
    if (src.startsWith('data:') && src.length > 200000) return;

    // Emit raw <img> HTML rather than markdown image syntax. Many
    // modern sites use `data:image/svg+xml;utf8,<svg…>` URIs whose
    // unescaped `<` `>` `(` `)` characters break markdown link
    // parsing and produce raw "data:..." text in the rendered page.
    // HTML attribute-encoding sidesteps that entirely; marked
    // passes <img> through unchanged.
    // Animated formats — GIF / WebP / APNG. Detect by URL extension
    // (cheap; no HEAD fetch). Marker `data-animated="true"` lets
    // renderer CSS preserve playback. Skip lazy-loading and use
    // `decoding="async"` so the file actually streams + animates
    // when the page mounts. Lazy-loading defers decode until
    // scrolled-into-view, which on a one-shot capture viewer is
    // exactly when the user wants it playing instantly.
    const lowerSrc = src.toLowerCase().split('?')[0];
    const isAnimated = /\.(gif|webp|apng)$/.test(lowerSrc);
    const renderedSrc = isAnimated
      ? stageRemoteMedia(src, {
          role: 'animated-image',
          mimeHint: inferMimeFromURL(src) || 'image/gif',
          maxBytes: REMOTE_IMAGE_MAX_BYTES,
        })
      : src;
    const escapedSrc = escapeAttr(renderedSrc);
    const escapedAlt = escapeAttr(alt);
    if (isAnimated) {
      pushBlankBlock(out, [`<img src="${escapedSrc}" alt="${escapedAlt}" data-animated="true" decoding="async">`]);
    } else {
      pushBlankBlock(out, [`<img src="${escapedSrc}" alt="${escapedAlt}" loading="lazy">`]);
    }
  }

  function firstAttr(el, names) {
    for (const name of names) {
      const value = el.getAttribute(name);
      if (value) return value;
    }
    return '';
  }

  function pickFromSrcset(srcset) {
    if (!srcset) return '';
    // Pick the highest-density / widest entry: "url 2x, url 1x" or
    // "url 800w, url 400w". Last entry usually largest in standard
    // formatting; sort to be safe.
    const entries = srcset.split(',').map((e) => e.trim()).map((entry) => {
      const parts = entry.split(/\s+/);
      const url = parts[0];
      const desc = parts[1] || '';
      const m = desc.match(/(\d+(?:\.\d+)?)([wx])/);
      const score = m ? parseFloat(m[1]) * (m[2] === 'w' ? 1 : 1000) : 0;
      return { url, score };
    }).filter((e) => e.url);
    if (!entries.length) return '';
    entries.sort((a, b) => b.score - a.score);
    return entries[0].url;
  }

  function pickFromImg(img) {
    const animatedSrc = firstAttr(img, [
      'data-gifsrc',
      'data-animated-src',
      'data-animation-src',
      'data-anim-src',
    ]);
    if (animatedSrc) return absUrl(animatedSrc);
    const lazySrc = firstAttr(img, [
      'data-fullsrc',
      'data-full-src',
      'data-large-src',
      'data-original',
      'data-lazy-src',
      'data-src',
    ]);
    if (lazySrc) return absUrl(lazySrc);
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    const responsiveSrc = pickFromSrcset(srcset);
    return absUrl(responsiveSrc || img.currentSrc || img.src || img.getAttribute('src') || '');
  }

  /// `<iframe>` → emit raw HTML so the renderer can re-mount the
  /// frame (sandbox + responsive wrapper added on render side).
  /// Recognized video / embed providers get a special marker so
  /// rendering can replace them with a fast component.
  function handleIframe(node, out) {
    const src = absUrl(node.getAttribute('src') || node.getAttribute('data-src') || node.getAttribute('data-lazy-src') || '');
    const title = providerTitleFromElement(node);
    const provider = src ? providerFromUrl(src) : providerFromElement(node);
    if (provider) {
      emitProviderEmbed(out, provider, src || provider.url || '', title);
    } else if (src) {
      pushBlankBlock(out, [`<iframe src="${escapeAttr(src)}" title="${escapeAttr(title)}" loading="lazy" allowfullscreen></iframe>`]);
    } else {
      return;
    }
  }

  function providerTitleFromElement(node) {
    const img = node.querySelector && node.querySelector('img');
    return (
      node.getAttribute('title') ||
      node.getAttribute('aria-label') ||
      (img && img.getAttribute('alt')) ||
      node.textContent ||
      ''
    ).replace(/\s+/g, ' ').trim();
  }

  function emitProviderEmbed(out, provider, url, title) {
    const href = absUrl(url || provider.url || provider.fallbackURL || '');
    pushBlankBlock(out, [
      `<!-- loom-embed kind="${provider.kind}" id="${escapeAttr(provider.id)}" url="${escapeAttr(href)}" title="${escapeAttr(title)}" -->`,
    ]);
  }

  function providerFromElement(node) {
    const attrs = [
      'videoid',
      'video-id',
      'data-videoid',
      'data-video-id',
      'data-youtube-id',
      'data-youtubeid',
      'youtubeid',
    ];
    for (const attr of attrs) {
      const value = (node.getAttribute && node.getAttribute(attr) || '').trim();
      const m = value.match(/^[\w-]{6,}$/);
      if (m) {
        return {
          kind: 'youtube',
          id: value,
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(value)}`,
        };
      }
    }
    const urlAttrs = ['href', 'data-href', 'data-url', 'data-src', 'data-lazy-src', 'src'];
    for (const attr of urlAttrs) {
      const raw = node.getAttribute && node.getAttribute(attr);
      const provider = raw ? providerFromUrl(absUrl(raw)) : null;
      if (provider) return { ...provider, url: absUrl(raw) };
    }
    const srcdoc = node.getAttribute && node.getAttribute('srcdoc');
    if (srcdoc) {
      const m = srcdoc.match(/(?:youtube(?:-nocookie)?\.com\/embed\/|youtu\.be\/)([\w-]{6,})/i);
      if (m) {
        return {
          kind: 'youtube',
          id: m[1],
          url: `https://www.youtube.com/watch?v=${encodeURIComponent(m[1])}`,
        };
      }
    }
    return null;
  }

  function providerFromUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      // YouTube
      let m;
      if (/(?:youtube\.com|youtube-nocookie\.com)$/.test(host)) {
        m = u.pathname.match(/\/embed\/([\w-]{6,})/);
        if (m) return { kind: 'youtube', id: m[1] };
        m = u.pathname.match(/\/shorts\/([\w-]{6,})/);
        if (m) return { kind: 'youtube', id: m[1] };
        const v = u.searchParams.get('v');
        if (v) return { kind: 'youtube', id: v };
      }
      if (host === 'youtu.be') {
        m = u.pathname.match(/^\/([\w-]{6,})/);
        if (m) return { kind: 'youtube', id: m[1] };
      }
      // Vimeo
      if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        m = u.pathname.match(/(?:\/video)?\/(\d{5,})/);
        if (m) return { kind: 'vimeo', id: m[1] };
      }
      // Bilibili
      if (/bilibili\.com$/.test(host)) {
        m = u.pathname.match(/\/(BV[\w]+|av\d+)/);
        if (m) return { kind: 'bilibili', id: m[1] };
      }
    } catch (_) {}
    return null;
  }

  /// `<video>` → emit `<video controls>` with explicit src + poster.
  /// Multiple `<source>` children are kept for codec fallback.
  function handleVideo(node, out) {
    const src = absUrl(
      node.currentSrc ||
      node.getAttribute('src') ||
      node.getAttribute('data-src') ||
      node.getAttribute('data-original') ||
      ''
    );
    const poster = absUrl(node.getAttribute('poster') || node.getAttribute('data-poster') || '');
    const sources = [];
    node.querySelectorAll('source').forEach((s) => {
      const ss = absUrl(s.getAttribute('src') || s.getAttribute('data-src') || '');
      const type = s.getAttribute('type') || '';
      if (ss) {
        const staged = stageRemoteMedia(ss, {
          role: 'video-source',
          mimeHint: type || inferMimeFromURL(ss) || 'video/mp4',
          maxBytes: REMOTE_VIDEO_MAX_BYTES,
        });
        sources.push(`<source src="${escapeAttr(staged)}"${type ? ` type="${escapeAttr(type)}"` : ''}>`);
      }
    });
    if (!src && sources.length === 0) return;
    const stagedSrc = src
      ? stageRemoteMedia(src, {
          role: 'video-source',
          mimeHint: inferMimeFromURL(src) || 'video/mp4',
          maxBytes: REMOTE_VIDEO_MAX_BYTES,
        })
      : '';
    let html = '<video controls preload="metadata"';
    if (poster) html += ` poster="${escapeAttr(poster)}"`;
    if (stagedSrc) html += ` src="${escapeAttr(stagedSrc)}"`;
    html += '>';
    sources.forEach((s) => { html += s; });
    if (src) {
      html += `<a href="${escapeAttr(src)}">Open video source</a>`;
    }
    html += '</video>';
    pushBlankBlock(out, [html]);
  }

  /// `<audio>` → similar to video, controls + sources.
  function handleAudio(node, out) {
    const src = absUrl(node.getAttribute('src') || '');
    const sources = [];
    node.querySelectorAll('source').forEach((s) => {
      const ss = absUrl(s.getAttribute('src') || '');
      const type = s.getAttribute('type') || '';
      if (ss) sources.push(`<source src="${ss}"${type ? ` type="${type}"` : ''}>`);
    });
    if (!src && sources.length === 0) return;
    let html = '<audio controls preload="metadata"';
    if (src) html += ` src="${src}"`;
    html += '>';
    sources.forEach((s) => { html += s; });
    html += '</audio>';
    pushBlankBlock(out, [html]);
  }

  const SVG_PRESENTATION_PROPS = [
    'fill',
    'fill-opacity',
    'fill-rule',
    'clip-rule',
    'stroke',
    'stroke-width',
    'stroke-linecap',
    'stroke-linejoin',
    'stroke-miterlimit',
    'stroke-dasharray',
    'stroke-dashoffset',
    'stroke-opacity',
    'opacity',
    'color',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'text-anchor',
    'dominant-baseline',
  ];

  function inlineSvgPresentationStyles(source, clone) {
    try {
      const sources = [source, ...source.querySelectorAll('*')];
      const clones = [clone, ...clone.querySelectorAll('*')];
      for (let i = 0; i < sources.length && i < clones.length; i++) {
        const sourceEl = sources[i];
        const cloneEl = clones[i];
        const computed = window.getComputedStyle(sourceEl);
        if (!computed) continue;
        const declarations = [];
        SVG_PRESENTATION_PROPS.forEach((prop) => {
          const value = (computed.getPropertyValue(prop) || '').trim();
          if (!value) return;
          declarations.push(`${prop}: ${value}`);
          cloneEl.setAttribute(prop, value);
        });
        if (declarations.length) {
          const existing = cloneEl.getAttribute('style') || '';
          cloneEl.setAttribute('style', `${existing}${existing && !existing.trim().endsWith(';') ? '; ' : ''}${declarations.join('; ')}`);
        }
      }
    } catch (err) {
      console.warn('[Loom] svg style inlining skipped', err);
    }
  }

  function svgHasInlinePresentation(clone) {
    const nodes = [clone, ...clone.querySelectorAll('*')];
    return nodes.some((node) => {
      if (!node || !node.getAttribute) return false;
      if (SVG_PRESENTATION_PROPS.some((attr) => node.hasAttribute(attr))) return true;
      const style = node.getAttribute('style') || '';
      return style.split(';').some((part) => {
        const prop = part.split(':')[0].trim().toLowerCase();
        return SVG_PRESENTATION_PROPS.includes(prop);
      });
    });
  }

  function svgUsesClassPresentation(clone) {
    return clone.hasAttribute('class') || !!clone.querySelector('[class]');
  }

  function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function svgClassTokens(clone) {
    const tokens = new Set();
    [clone, ...clone.querySelectorAll('[class]')].forEach((node) => {
      const raw = node && node.getAttribute ? node.getAttribute('class') || '' : '';
      raw.split(/\s+/).map((part) => part.trim()).filter(Boolean).forEach((part) => tokens.add(part));
    });
    return tokens;
  }

  function svgHasEmbeddedStyleForClass(clone) {
    const styleText = Array.from(clone.querySelectorAll('style'))
      .map((style) => style.textContent || '')
      .join('\n');
    if (!styleText.trim()) return false;
    return Array.from(svgClassTokens(clone)).some((name) => {
      return new RegExp(`\\.${escapeRegex(name)}(?:\\b|[\\s\\{\\.,:#>+~])`).test(styleText);
    });
  }

  function svgIsSelfContainedForReader(clone) {
    if (!svgUsesClassPresentation(clone)) return true;
    return svgHasInlinePresentation(clone) || svgHasEmbeddedStyleForClass(clone);
  }

  const SVG_LAYOUT_STYLE_PROPS = new Set([
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

  function stripSvgReaderLayout(source, clone) {
    // Source SVGs often carry page-layout declarations such as
    // `height:96%`, absolute positioning, or transform offsets. Those
    // are correct inside the original page's component tree, but they
    // become unreadable black slabs when the SVG is lifted into Loom's
    // reader markdown. Keep computed presentation separately; drop
    // layout from the root SVG only.
    const rootStyle = clone.getAttribute('style') || '';
    if (rootStyle) {
      const kept = rootStyle
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .filter((part) => {
          const prop = part.split(':')[0].trim().toLowerCase();
          return prop && !SVG_LAYOUT_STYLE_PROPS.has(prop);
        });
      if (kept.length) clone.setAttribute('style', kept.join('; '));
      else clone.removeAttribute('style');
    }
    ['width', 'height', 'x', 'y'].forEach((attr) => clone.removeAttribute(attr));

    const rect = source && source.getBoundingClientRect ? source.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0) {
      clone.setAttribute('data-loom-source-width', String(Math.round(rect.width)));
      clone.setAttribute('data-loom-source-height', String(Math.round(rect.height)));
    }
    clone.setAttribute('data-loom-inline-svg', 'true');
  }

  /// `<svg>` → emit inline markup with computed presentation styles.
  /// Raw class-dependent SVG loses its page CSS after capture, so we
  /// bake fill/stroke/font presentation onto the clone. Strip event
  /// handlers as a security guard.
  function handleSvg(node, out) {
    try {
      const cloned = node.cloneNode(true);
      stripSvgReaderLayout(node, cloned);
      inlineSvgPresentationStyles(node, cloned);
      [cloned, ...cloned.querySelectorAll('*')].forEach((child) => {
        for (const attr of [...child.attributes]) {
          const unsafeURLAttr = (attr.name === 'href' || attr.name.endsWith(':href')) && /javascript:/i.test(attr.value || '');
          if (attr.name.startsWith('on') || unsafeURLAttr) {
            child.removeAttribute(attr.name);
          }
        }
      });
      // Cap size — SVG can balloon; skip huge ones.
      const html = cloned.outerHTML;
      if (html.length > 40000) {
        // Big inline SVG: emit a screenshot instead via canvas.
        captureElementScreenshot(node, out, 'svg');
        return;
      }
      if (!svgIsSelfContainedForReader(cloned)) {
        captureElementScreenshot(node, out, 'svg');
        return;
      }
      pushBlankBlock(out, [html]);
    } catch (e) {
      console.warn('[Loom] svg capture failed', e);
    }
  }

  /// `<canvas>` → register for async recording AND emit a placeholder
  /// block containing the static JPEG fallback. The placeholder is
  /// later resolved by `applyCanvasRecordings`: either replaced by a
  /// `<video>` if recording succeeded, or unwrapped to expose the
  /// static fallback. The walker is strictly synchronous, so the
  /// recording itself runs after extractMainContent returns.
  ///
  /// If MediaRecorder / captureStream aren't available, we skip the
  /// placeholder wrapper entirely and just emit the static JPEG —
  /// preserving the v1.2.x behaviour exactly.
  function handleCanvas(node, out) {
    if (canvasLooksVisuallyBlank(node)) {
      const rect = visibleRectFor(node);
      if (rect && rect.width >= 240 && rect.height >= 80) {
        queueElementScreenshot(node, out, 'canvas', elementScreenshotAlt(node, 'canvas'));
      }
      return;
    }
    if (canvasIsTooSmallToRecord(node)) {
      captureElementScreenshot(node, out, 'canvas');
      return;
    }

    const canRecord = (
      typeof MediaRecorder !== 'undefined' &&
      typeof node.captureStream === 'function' &&
      (node.width || node.clientWidth) > 0 &&
      (node.height || node.clientHeight) > 0 &&
      pendingCanvasRecordings.size < 8
    );

    if (!canRecord) {
      captureElementScreenshot(node, out, 'canvas');
      return;
    }

    const id = 'cnv_' + Math.random().toString(36).slice(2, 10);
    pendingCanvasRecordings.set(id, node);

    // Emit the static fallback wrapped in begin/end markers so the
    // async pass can either swap it for a <video> or strip the
    // markers and keep the JPEG.
    flushLine(out);
    if (out.length && out[out.length - 1] !== '') out.push('');
    out.push(`<!-- loom-canvas-fallback-begin id="${id}" -->`);
    // Capture the static JPEG into the same buffer.
    captureElementScreenshot(node, out, 'canvas');
    out.push(`<!-- loom-canvas-fallback-end id="${id}" -->`);
    out.push('');
  }

  // ----- Async canvas recording (Phase ANIM) -----
  //
  // Map of id → canvas node, populated by handleCanvas during the
  // synchronous walk. After extractMainContent returns, we kick off
  // recordPendingCanvases() which records ~4s of each canvas in
  // parallel, encodes to webm+vp9 (or vp8/mp4 fallback), base64-data-URL
  // encodes, and resolves to {id, html} pairs that replace the
  // placeholders in the markdown body.
  const pendingCanvasRecordings = new Map();
  // v1.4.0 — binary media attachments staged here during async recording
  // pass. Each entry: { tmpId, mime, base64, role }. capturePagePayload
  // attaches the array to the payload then clears it. Swift side writes
  // each as a sibling file and rewrites `loom://media/{tmpId}` refs in
  // body to `loom://content/...` paths.
  let pendingMediaAttachments = [];
  // v1.4.2 — direct animated images and direct video sources are
  // staged here during the synchronous DOM walk. After the walk, the
  // async pass attempts to fetch each blob and attach it as a sidecar.
  // On fetch/CORS/size failure the body is rewritten back to the
  // original URL, so capture never leaves an unresolved loom://media
  // placeholder behind.
  const pendingRemoteMedia = new Map();
  // v1.4.3 — composite visual assemblies (multiple SVG/canvas nodes
  // arranged by page CSS) need to be captured as one visual resource.
  // Walking each child separately destroys the layout: flipdisc.io's
  // aluminum-frame drawing is twelve SVGs inside a grid, and the
  // dither comparison mixes canvas + SVG controls. We queue those
  // live DOM nodes during the synchronous walk and resolve them after
  // extraction, once we can await image decode.
  const pendingElementScreenshots = new Map();
  // v1.4.1 — Esc-to-cancel during recording / extraction.
  // Each capture run gets a fresh AbortController-shaped object held in
  // `activeCaptureCtrl`. Pressing Esc while the L button is in its
  // pulsing-rec / extracting state flips `cancelled = true` and stops
  // any in-flight MediaRecorder so the run unwinds quickly. The capture
  // path checks the flag at every async hand-off and short-circuits.
  // We do NOT reuse AbortController/AbortSignal because we want
  // synchronous reads on the flag and explicit recorder.stop()
  // semantics.
  let activeCaptureCtrl = null;
  const RECORDING_DURATION_MS = 4000;
  const RECORDING_TIMEOUT_MS = 6000;
  const REMOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
  const REMOTE_VIDEO_MAX_BYTES = 12 * 1024 * 1024;
  const REMOTE_MEDIA_FETCH_TIMEOUT_MS = 8000;
  // 800KB per clip — larger than this and the body cap (200K chars,
  // base64 is ~4/3 of binary) starts crowding out prose. 600KB binary
  // = ~800K base64 = 0.4× of the cap. Leave headroom for everything else.
  // Cap at 400KB binary (~533KB base64) so a recording doesn't
  // dominate the body cap. Earlier 800KB cap meant a single video
  // could exceed the 200K body cap and silently truncate trailing
  // prose / code blocks.
  const RECORDING_MAX_BYTES = 400 * 1024;
  // MediaRecorder can emit a valid-looking WebM header with no video
  // frames when the canvas never paints during the recording window.
  // Those files are usually ~100 bytes and fail in WKWebView. Treat
  // them as failed recordings so the static canvas screenshot remains.
  const RECORDING_MIN_BYTES = 2 * 1024;
  const RECORDING_MIN_CANVAS_AREA = 2048;
  const BLANK_CANVAS_SAMPLE_SIZE = 32;
  const BLANK_CANVAS_LUMA_RANGE = 10;
  const BLANK_CANVAS_STDDEV = 4;
  const ELEMENT_SCREENSHOT_MAX_DATA_URL = 600000;
  const ELEMENT_SCREENSHOT_MAX_DIM = 1400;
  const CANVAS_CAPTURE_SETTLE_MS = 500;

  function waitForPaintFrame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function nodeHasCanvas(node) {
    if (!node) {
      return !!(document.querySelector && document.querySelector('canvas'));
    }
    const tag = (node.tagName || '').toLowerCase();
    return tag === 'canvas' || !!(node.querySelector && node.querySelector('canvas'));
  }

  async function waitForDynamicCanvasPaint(ctrl, node) {
    if (ctrl && ctrl.cancelled) return;
    if (!nodeHasCanvas(node)) return;
    await waitForPaintFrame();
    if (ctrl && ctrl.cancelled) return;
    await new Promise((resolve) => setTimeout(resolve, CANVAS_CAPTURE_SETTLE_MS));
    if (ctrl && ctrl.cancelled) return;
    await waitForPaintFrame();
  }

  async function preparePageForCapture(ctrl) {
    try {
      const scrollingEl = document.scrollingElement || document.documentElement;
      const maxY = Math.max(0, scrollingEl.scrollHeight - window.innerHeight);
      if (maxY <= Math.max(600, window.innerHeight)) return;
      const startX = window.scrollX || window.pageXOffset || 0;
      const startY = window.scrollY || window.pageYOffset || 0;
      const step = Math.max(480, Math.floor(window.innerHeight * 0.85));
      const targets = [0];
      for (let y = step; y < maxY; y += step) targets.push(y);
      targets.push(maxY);
      const stride = Math.max(1, Math.ceil(targets.length / 28));
      try {
        for (let i = 0; i < targets.length; i += stride) {
          if (ctrl && ctrl.cancelled) return;
          window.scrollTo(startX, targets[i]);
          await waitForPaintFrame();
        }
      } finally {
        window.scrollTo(startX, startY);
        await waitForPaintFrame();
      }
    } catch (err) {
      console.warn('[Loom] page prepare skipped', err);
    }
  }

  function canvasArea(canvas) {
    const w = canvas.width || canvas.clientWidth || 0;
    const h = canvas.height || canvas.clientHeight || 0;
    return Math.max(0, w) * Math.max(0, h);
  }

  function canvasVisualStats(canvas) {
    try {
      const sourceW = canvas.width || canvas.clientWidth || 0;
      const sourceH = canvas.height || canvas.clientHeight || 0;
      if (!sourceW || !sourceH) return null;
      const sampleW = Math.max(1, Math.min(BLANK_CANVAS_SAMPLE_SIZE, sourceW));
      const sampleH = Math.max(1, Math.min(BLANK_CANVAS_SAMPLE_SIZE, sourceH));
      const sample = document.createElement('canvas');
      sample.width = sampleW;
      sample.height = sampleH;
      const ctx = sample.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(canvas, 0, 0, sampleW, sampleH);
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
      if (!count) return null;
      const opaqueRatio = opaque / count;
      if (!opaque) return { opaqueRatio, lumaRange: 0, stddev: 0 };
      const mean = sum / opaque;
      const variance = Math.max(0, (sumSq / opaque) - (mean * mean));
      return {
        opaqueRatio,
        lumaRange: max - min,
        stddev: Math.sqrt(variance),
      };
    } catch (_) {
      // Tainted/WebGL canvases can throw on readback. Treat as
      // "unknown", not blank, so the normal capture/record path can
      // still make a best-effort attempt.
      return null;
    }
  }

  function canvasLooksVisuallyBlank(canvas) {
    const stats = canvasVisualStats(canvas);
    if (!stats) return false;
    if (stats.opaqueRatio < 0.02) return true;
    return stats.lumaRange <= BLANK_CANVAS_LUMA_RANGE &&
      stats.stddev <= BLANK_CANVAS_STDDEV;
  }

  function canvasIsTooSmallToRecord(canvas) {
    const area = canvasArea(canvas);
    return area > 0 && area < RECORDING_MIN_CANVAS_AREA;
  }

  function pickRecorderMime() {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4',
    ];
    for (const m of candidates) {
      try {
        if (MediaRecorder.isTypeSupported(m)) return m;
      } catch (_) {}
    }
    return '';
  }

  /// Generate a short random alphanumeric id used as the temporary
  /// media handle. Swift rewrites `loom://media/{tmpId}` references
  /// in body → stable `loom://content/...` paths after writing the
  /// binary as a sibling file.
  function randomTmpId() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 8; i++) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  }

  /// Record a single canvas for ~4 seconds. Resolves with
  /// `{ blob, mime }` or null on any failure. Never rejects —
  /// failure is just "no video this time" and the static JPEG
  /// fallback wins.
  function recordCanvas(canvas, ctrl) {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (v) => { if (!settled) { settled = true; resolve(v); } };
      try {
        const stream = canvas.captureStream(30);
        const mime = pickRecorderMime();
        if (!mime) return settle(null);
        const recorder = new MediaRecorder(stream, {
          mimeType: mime,
          // Cap at ~1.2 Mbps so 4s ≈ 600KB binary. v1.4.0 — binary
          // ships as a sidecar file (mediaAttachments), no longer
          // counts against body cap, but keep the bitrate sane to
          // avoid pathological multi-MB clips.
          videoBitsPerSecond: 1_200_000,
        });
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunks.push(e.data);
        };
        recorder.onerror = (e) => {
          console.warn('[Loom] MediaRecorder error', e);
          settle(null);
        };
        recorder.onstop = async () => {
          try {
            // v1.4.1 — if user hit Esc, drop the partial recording on
            // the floor regardless of size.
            if (ctrl && ctrl.cancelled) return settle(null);
            const blob = new Blob(chunks, { type: mime });
            if (blob.size < RECORDING_MIN_BYTES || blob.size > RECORDING_MAX_BYTES) {
              console.log('[Loom] canvas recording skipped — size', blob.size, 'range', RECORDING_MIN_BYTES, RECORDING_MAX_BYTES);
              return settle(null);
            }
            settle({ blob, mime });
          } catch (err) {
            console.warn('[Loom] canvas recording finalize failed', err);
            settle(null);
          } finally {
            // Stop tracks so the canvas isn't held open.
            try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
          }
        };

        // Hard timeout — if recorder somehow doesn't fire onstop
        // (browser quirk), force resolution at TIMEOUT.
        const tid = setTimeout(() => {
          try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) {}
          // Settle null after a grace period if onstop still hasn't run.
          setTimeout(() => settle(null), 500);
        }, RECORDING_TIMEOUT_MS);

        recorder.start();
        const stopTid = setTimeout(() => {
          try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) {}
          clearTimeout(tid);
        }, RECORDING_DURATION_MS);

        // v1.4.1 — wire user cancellation. activeCaptureCtrl exposes
        // a list of stop callbacks; pressing Esc invokes them all,
        // forcing recorder.stop() before the natural duration elapses.
        if (ctrl && Array.isArray(ctrl.stoppers)) {
          ctrl.stoppers.push(() => {
            try { if (recorder.state !== 'inactive') recorder.stop(); } catch (_) {}
            clearTimeout(tid);
            clearTimeout(stopTid);
          });
        }
      } catch (err) {
        console.warn('[Loom] recordCanvas threw', err);
        settle(null);
      }
    });
  }

  /// Convert a Blob to a base64 string (no data: prefix). The Swift
  /// side decodes from base64 directly; the data-URL header is dead
  /// weight on the wire when we already pass mime alongside.
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const result = fr.result || '';
        // FileReader.readAsDataURL returns "data:<mime>;base64,<...>"
        const idx = (typeof result === 'string') ? result.indexOf(',') : -1;
        if (idx < 0) return reject(new Error('FileReader returned non-data-URL'));
        resolve(result.slice(idx + 1));
      };
      fr.onerror = () => reject(fr.error || new Error('FileReader failed'));
      fr.readAsDataURL(blob);
    });
  }

  function stageDataURLMedia(dataUrl, role, mimeFallback) {
    // v1.4.4 — generated canvas/composite screenshots are binary
    // media too. Keep them out of the markdown body so large diagrams
    // cannot crowd out prose or degrade to "too large" placeholders.
    const raw = String(dataUrl || '');
    const match = raw.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
    if (!match) return '';
    const mime = (match[1] || mimeFallback || 'application/octet-stream').trim() || 'application/octet-stream';
    const base64 = (match[2] || '').trim();
    if (!base64) return '';
    const tmpId = randomTmpId();
    pendingMediaAttachments.push({
      tmpId,
      mime,
      base64,
      role: role || 'element-screenshot',
    });
    return `loom://media/${tmpId}`;
  }

  function inferMimeFromURL(url) {
    const clean = String(url || '').toLowerCase().split('?')[0].split('#')[0];
    if (clean.endsWith('.gif')) return 'image/gif';
    if (clean.endsWith('.webp')) return 'image/webp';
    if (clean.endsWith('.apng')) return 'image/png';
    if (clean.endsWith('.png')) return 'image/png';
    if (clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return 'image/jpeg';
    if (clean.endsWith('.webm')) return 'video/webm';
    if (clean.endsWith('.mp4') || clean.endsWith('.m4v')) return 'video/mp4';
    if (clean.endsWith('.mov')) return 'video/quicktime';
    return '';
  }

  function canFetchAsAttachment(url) {
    return /^(https?:|blob:)/i.test(String(url || ''));
  }

  function stageRemoteMedia(url, opts) {
    const abs = absUrl(url);
    if (!canFetchAsAttachment(abs)) return abs;
    const tmpId = randomTmpId();
    pendingRemoteMedia.set(tmpId, {
      url: abs,
      role: (opts && opts.role) || 'remote-media',
      mimeHint: (opts && opts.mimeHint) || inferMimeFromURL(abs),
      maxBytes: (opts && opts.maxBytes) || REMOTE_IMAGE_MAX_BYTES,
    });
    return `loom://media/${tmpId}`;
  }

  function replaceAllLiteral(body, needle, replacement) {
    return String(body || '').split(needle).join(replacement);
  }

  async function fetchRemoteMediaBlob(entry, ctrl) {
    if (ctrl && ctrl.cancelled) return null;
    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => {
          try { controller.abort(); } catch (_) {}
        }, REMOTE_MEDIA_FETCH_TIMEOUT_MS)
      : null;
    try {
      let credentials = 'omit';
      try {
        const u = new URL(entry.url, location.href);
        credentials = u.origin === location.origin ? 'include' : 'omit';
      } catch (_) {}
      const res = await fetch(entry.url, {
        mode: 'cors',
        credentials,
        signal: controller ? controller.signal : undefined,
      });
      if (!res || !res.ok) return null;
      const blob = await res.blob();
      if (!blob || !blob.size || blob.size > entry.maxBytes) return null;
      return blob;
    } catch (err) {
      console.warn('[Loom] remote media fetch skipped:', entry.url, err);
      return null;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async function fetchPendingRemoteMedia(body, ctrl) {
    if (pendingRemoteMedia.size === 0) return body;
    let out = body;
    const entries = [...pendingRemoteMedia.entries()];
    pendingRemoteMedia.clear();
    for (const [tmpId, entry] of entries) {
      const placeholder = `loom://media/${tmpId}`;
      if (ctrl && ctrl.cancelled) {
        out = replaceAllLiteral(out, placeholder, escapeAttr(entry.url));
        continue;
      }
      const blob = await fetchRemoteMediaBlob(entry, ctrl);
      if (!blob) {
        out = replaceAllLiteral(out, placeholder, escapeAttr(entry.url));
        continue;
      }
      let base64;
      try {
        base64 = await blobToBase64(blob);
      } catch (err) {
        console.warn('[Loom] remote media base64 encode failed:', entry.url, err);
        out = replaceAllLiteral(out, placeholder, escapeAttr(entry.url));
        continue;
      }
      if (ctrl && ctrl.cancelled) {
        out = replaceAllLiteral(out, placeholder, escapeAttr(entry.url));
        continue;
      }
      pendingMediaAttachments.push({
        tmpId,
        mime: blob.type || entry.mimeHint || inferMimeFromURL(entry.url) || 'application/octet-stream',
        base64,
        role: entry.role,
      });
    }
    return out;
  }

  /// Records all queued canvases in parallel, then resolves to a map
  /// canvasId → `<video>` placeholder HTML referencing `loom://media/{tmpId}`.
  /// Each successful recording also pushes a `{tmpId, mime, base64,
  /// role}` entry into the module-level `pendingMediaAttachments`
  /// array, which capturePagePayload drains onto the payload.
  /// Empty map if none recorded successfully.
  async function recordPendingCanvases(ctrl) {
    if (pendingCanvasRecordings.size === 0) return new Map();
    const tasks = [];
    pendingCanvasRecordings.forEach((canvas, id) => {
      tasks.push(recordCanvas(canvas, ctrl).then((rec) => ({ id, rec })));
    });
    const results = await Promise.all(tasks);
    // v1.4.1 — short-circuit if cancelled at any point during the wait.
    if (ctrl && ctrl.cancelled) {
      pendingCanvasRecordings.clear();
      return new Map();
    }
    const map = new Map();
    for (const { id, rec } of results) {
      if (!rec || !rec.blob) continue;
      let base64;
      try {
        base64 = await blobToBase64(rec.blob);
      } catch (err) {
        console.warn('[Loom] base64 encode failed for', id, err);
        continue;
      }
      // Re-check cancellation after each base64 encode — these are
      // CPU-bound and can take real time on big clips.
      if (ctrl && ctrl.cancelled) {
        pendingCanvasRecordings.clear();
        return new Map();
      }
      const tmpId = randomTmpId();
      pendingMediaAttachments.push({
        tmpId,
        mime: rec.mime,
        base64,
        role: 'canvas-recording',
      });
      // Placeholder: Swift rewrites src to a stable
      // `loom://content/{rootID}/sub/{path}/Loom-media-{stableID}.webm`
      // path after writing the sidecar file.
      const html =
        `<video controls autoplay muted loop playsinline data-canvas-id="${id}" src="loom://media/${tmpId}"></video>`;
      map.set(id, html);
    }
    pendingCanvasRecordings.clear();
    return map;
  }

  /// For each canvas-fallback block in the body, decide what to keep:
  ///   - recording succeeded → emit `<video src="loom://media/X">`, drop the static JPEG
  ///   - recording failed   → strip markers, keep the static JPEG
  /// Markers are `<!-- loom-canvas-fallback-begin id="X" -->` and
  /// `<!-- loom-canvas-fallback-end id="X" -->`.
  function applyCanvasRecordings(body, recordings) {
    return body.replace(
      /<!-- loom-canvas-fallback-begin id="([^"]+)" -->([\s\S]*?)<!-- loom-canvas-fallback-end id="\1" -->/g,
      (_, id, fallback) => {
        const video = recordings.get(id);
        if (video) return video;
        return fallback;
      }
    );
  }

  function mediaNodeCount(node, selector) {
    if (!node || !node.querySelectorAll) return 0;
    return node.querySelectorAll(selector).length;
  }

  function readableNodeText(node) {
    if (!node) return '';
    try {
      const clone = node.cloneNode(true);
      if (clone.querySelectorAll) {
        clone.querySelectorAll('style, script, template, noscript').forEach((el) => el.remove());
        clone.querySelectorAll('input, textarea').forEach((el) => {
          const value = (el.getAttribute('value') || el.value || el.getAttribute('placeholder') || '').trim();
          el.replaceWith(document.createTextNode(value ? ` ${value} ` : ' '));
        });
      }
      return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
    }
  }

  function visualBlockLabel(node, allowFallback = true) {
    if (!node || !node.querySelector) return '';
    const heading = node.querySelector('h1,h2,h3,h4,h5,h6');
    if (heading) {
      const text = readableNodeText(heading);
      if (text) return text;
    }
    const label = node.querySelector('.uppercase, [class*="uppercase"], [class*="tracking"]');
    if (label) {
      const text = readableNodeText(label);
      if (text && text.length <= 120) return text;
    }
    if (!allowFallback) return '';
    const text = readableNodeText(node);
    return text ? text.slice(0, 120) : '';
  }

  function isHeadingTag(tag) {
    return /^h[1-6]$/.test(String(tag || '').toLowerCase());
  }

  function emitHeading(node, out) {
    const tag = (node.tagName || '').toLowerCase();
    const level = '#'.repeat(parseInt(tag[1], 10));
    const text = readableNodeText(node);
    if (text) {
      flushLine(out);
      out.push(level + ' ' + text);
      out.push('');
    }
  }

  function containsSemanticHeading(node) {
    if (!node || !node.querySelector) return false;
    const tag = (node.tagName || '').toLowerCase();
    if (tag === 'figure') return false;
    const heading = node.querySelector('h1,h2,h3,h4,h5,h6');
    if (!heading) return false;
    const headingText = readableNodeText(heading);
    if (!headingText) return false;
    if (heading.parentElement === node || tag === 'section') return true;
    if (heading.closest && heading.closest('figure, figcaption')) return false;
    const allText = readableNodeText(node);
    return allText.length > headingText.length + 120;
  }

  function visibleRectFor(node) {
    if (!node || !node.getBoundingClientRect) return null;
    const rect = node.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return rect;
    return null;
  }

  function visualCaptureNode(node) {
    const ownRect = visibleRectFor(node);
    if (ownRect) return node;
    if (!node || !node.querySelectorAll) return null;
    const candidates = [
      ...node.children,
      ...node.querySelectorAll('canvas, svg, [class*="border"], [class*="grid"], [class*="flex"], [data-rcs]'),
    ];
    for (const candidate of candidates) {
      const rect = visibleRectFor(candidate);
      if (rect && rect.width >= 24 && rect.height >= 24) return candidate;
    }
    return null;
  }

  function emitVisualBlockLabel(node, out) {
    const label = visualBlockLabel(node, false);
    if (!label) return;
    const normalized = label.toUpperCase();
    pushBlankBlock(out, [`<p class="loom-capture-eyebrow">${escapeHTML(normalized)}</p>`]);
  }

  function isStandaloneVisualLabel(node) {
    if (!node || !node.matches) return false;
    const tag = (node.tagName || '').toLowerCase();
    if (!['span', 'div', 'p'].includes(tag)) return false;
    if (!node.matches('.uppercase, [class*="uppercase"], [class*="tracking"]')) return false;
    if (node.closest && node.closest('a, button, nav, header, footer')) return false;
    const text = readableNodeText(node);
    return !!text && text.length <= 120;
  }

  function isCompositeMediaBlock(node) {
    if (!node || !node.querySelectorAll || !node.getBoundingClientRect) return false;
    const tag = (node.tagName || '').toLowerCase();
    if (tag !== 'div' && tag !== 'section' && tag !== 'figure') return false;
    if (node.querySelector('iframe, video, audio, lite-youtube, youtube-player, youtube-embed')) return false;
    if (containsSemanticHeading(node)) return false;

    const vectorMediaCount = mediaNodeCount(node, 'svg, canvas');
    if (vectorMediaCount < 2 || vectorMediaCount > 28) return false;

    const rect = node.getBoundingClientRect();
    if (!rect || rect.width < 240 || rect.height < 120) return false;
    if (rect.width > 2200 || rect.height > 1800) return false;

    const text = readableNodeText(node);
    if (text.length > 700) return false;

    // Prefer the outermost compact visual assembly: if an ancestor is
    // also a compact SVG/canvas assembly, let the ancestor handle it.
    let parent = node.parentElement;
    while (parent) {
      if ((parent.tagName || '').toLowerCase() === 'article' || (parent.tagName || '').toLowerCase() === 'main') break;
      if (mediaNodeCount(parent, 'svg, canvas') === vectorMediaCount) {
        const parentRect = parent.getBoundingClientRect && parent.getBoundingClientRect();
        const parentText = readableNodeText(parent);
        if (
          parentRect &&
          parentRect.width >= 240 &&
          parentRect.height >= 120 &&
          parentRect.width <= 2200 &&
          parentRect.height <= 1800 &&
          parentText.length <= 700
        ) {
          return false;
        }
      }
      parent = parent.parentElement;
    }
    return true;
  }

  function isStructuredVisualBlock(node) {
    if (!node || !node.querySelectorAll || !node.getBoundingClientRect) return false;
    const tag = (node.tagName || '').toLowerCase();
    if (!['div', 'section', 'figure', 'astro-island'].includes(tag)) return false;
    if (node.querySelector('iframe, video, audio, lite-youtube, youtube-player, youtube-embed')) return false;
    if (containsSemanticHeading(node)) return false;

    const captureNode = visualCaptureNode(node);
    if (!captureNode) return false;
    const rect = captureNode.getBoundingClientRect();
    const canvasCount = mediaNodeCount(node, 'canvas');
    const looksLikeAstroCanvas = tag === 'astro-island' && canvasCount >= 1;
    if (!rect || rect.width < 240 || rect.height < (looksLikeAstroCanvas ? 80 : 120)) return false;
    if (rect.width > 2200 || rect.height > 1800) return false;

    const formControlCount = node.querySelectorAll('input, textarea, [contenteditable="true"]').length;
    const text = readableNodeText(node);
    const label = visualBlockLabel(node, false);
    const panelSelector = '[class*="divide"], [class*="border"], [class*="grid"], [class*="flex"]';
    const panelStylingCount =
      (node.matches && node.matches(panelSelector) ? 1 : 0) +
      node.querySelectorAll(panelSelector).length;
    const looksLikeFontSpec = /pixel\s+font\s+comparison|font\s+comparison/i.test(text);
    const looksLikeStructuredPanel = formControlCount >= 2 && panelStylingCount >= 3;
    const looksLikeLabeledPanel = !!label && panelStylingCount >= 2;
    if (!looksLikeFontSpec && !looksLikeStructuredPanel && !looksLikeLabeledPanel && !looksLikeAstroCanvas) return false;
    if (text.length > 1400) return false;

    // Prefer the outermost compact structured module, but stop at
    // semantic document roots so we never replace the whole article.
    let parent = node.parentElement;
    while (parent) {
      const parentTag = (parent.tagName || '').toLowerCase();
      if (parentTag === 'article' || parentTag === 'main') break;
      const parentControls = parent.querySelectorAll && parent.querySelectorAll('input, textarea, [contenteditable="true"]').length;
      if (parentControls === formControlCount) {
        const parentRect = parent.getBoundingClientRect && parent.getBoundingClientRect();
        const parentText = readableNodeText(parent);
        if (
          parentRect &&
          parentRect.width >= 240 &&
          parentRect.height >= 120 &&
          parentRect.width <= 2200 &&
          parentRect.height <= 1800 &&
          parentText.length <= 1400 &&
          (/pixel\s+font\s+comparison|font\s+comparison/i.test(parentText) || parentControls >= 2)
        ) {
          return false;
        }
      }
      parent = parent.parentElement;
    }
    return !!label || formControlCount >= 2 || looksLikeAstroCanvas;
  }

  function elementScreenshotAlt(node, kind) {
    const heading = node.querySelector && node.querySelector('h1,h2,h3,h4,h5,h6');
    const headingText = heading ? readableNodeText(heading) : '';
    const text = headingText || visualBlockLabel(node, true) || readableNodeText(node);
    return text ? text.slice(0, 160) : `${kind} capture`;
  }

  function queueElementScreenshot(node, out, kind, alt) {
    const id = 'el_' + randomTmpId();
    pendingElementScreenshots.set(id, { node, kind, alt: alt || elementScreenshotAlt(node, kind) });
    pushBlankBlock(out, [
      `<!-- loom-element-screenshot id="${id}" kind="${escapeAttr(kind)}" alt="${escapeAttr(alt || elementScreenshotAlt(node, kind))}" -->`,
    ]);
  }

  function handleCompositeMediaBlock(node, out) {
    emitVisualBlockLabel(node, out);
    queueElementScreenshot(node, out, 'composite-media', elementScreenshotAlt(node, 'composite-media'));
  }

  function handleStructuredVisualBlock(node, out) {
    const captureNode = visualCaptureNode(node) || node;
    emitVisualBlockLabel(node, out);
    queueElementScreenshot(captureNode, out, 'structured-visual', elementScreenshotAlt(node, 'structured-visual'));
  }

  function inlineComputedStylesForScreenshot(source, clone) {
    try {
      const sources = [source, ...source.querySelectorAll('*')];
      const clones = [clone, ...clone.querySelectorAll('*')];
      for (let i = 0; i < sources.length && i < clones.length; i++) {
        const sourceEl = sources[i];
        const cloneEl = clones[i];
        const computed = window.getComputedStyle(sourceEl);
        if (!computed) continue;
        for (let p = 0; p < computed.length; p++) {
          const prop = computed[p];
          const value = computed.getPropertyValue(prop);
          if (value) cloneEl.style.setProperty(prop, value, computed.getPropertyPriority(prop));
        }
        cloneEl.removeAttribute('id');
        if (cloneEl.tagName && cloneEl.tagName.toLowerCase() === 'img') {
          const src = cloneEl.getAttribute('src') || sourceEl.currentSrc || sourceEl.getAttribute('src') || '';
          if (src && !/^data:/i.test(src)) cloneEl.setAttribute('src', absUrl(src));
        }
      }
    } catch (err) {
      console.warn('[Loom] computed style inlining skipped', err);
    }
  }

  function replaceCloneCanvasesWithImages(source, clone) {
    try {
      const sourceCanvases = [
        ...((source.tagName || '').toLowerCase() === 'canvas' ? [source] : []),
        ...source.querySelectorAll('canvas'),
      ];
      const cloneCanvases = [
        ...((clone.tagName || '').toLowerCase() === 'canvas' ? [clone] : []),
        ...clone.querySelectorAll('canvas'),
      ];
      for (let i = 0; i < sourceCanvases.length && i < cloneCanvases.length; i++) {
        const sourceCanvas = sourceCanvases[i];
        const cloneCanvas = cloneCanvases[i];
        let dataUrl = '';
        try {
          if (!canvasLooksVisuallyBlank(sourceCanvas)) {
            dataUrl = sourceCanvas.toDataURL('image/png');
          }
        } catch (_) {}
        if (!dataUrl) continue;
        const img = document.createElement('img');
        img.setAttribute('src', dataUrl);
        img.setAttribute('alt', cloneCanvas.getAttribute('aria-label') || 'canvas');
        img.setAttribute('decoding', 'async');
        img.setAttribute('data-loom-canvas-replacement', 'true');
        img.setAttribute('style', cloneCanvas.getAttribute('style') || '');
        cloneCanvas.replaceWith(img);
      }
    } catch (err) {
      console.warn('[Loom] canvas replacement skipped', err);
    }
  }

  function cloneElementForScreenshot(source) {
    const clone = source.cloneNode(true);
    inlineComputedStylesForScreenshot(source, clone);
    replaceCloneCanvasesWithImages(source, clone);
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    clone.setAttribute("data-loom-capture-kind", "composite-media");
    const rect = source.getBoundingClientRect();
    clone.style.margin = '0';
    clone.style.position = 'relative';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.right = 'auto';
    clone.style.bottom = 'auto';
    clone.style.transform = 'none';
    clone.style.width = `${Math.max(1, Math.ceil(rect.width))}px`;
    clone.style.height = `${Math.max(1, Math.ceil(rect.height))}px`;
    clone.style.maxWidth = 'none';
    clone.style.maxHeight = 'none';
    clone.querySelectorAll('script, noscript, template').forEach((el) => el.remove());
    clone.querySelectorAll('*').forEach((el) => {
      for (const attr of [...el.attributes]) {
        const unsafeURLAttr = (attr.name === 'href' || attr.name.endsWith(':href') || attr.name === 'src') && /javascript:/i.test(attr.value || '');
        if (attr.name.startsWith('on') || unsafeURLAttr) el.removeAttribute(attr.name);
      }
    });
    return clone;
  }

  function loadImageFromObjectURL(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('element screenshot image decode failed'));
      img.src = url;
    });
  }

  async function captureVisibleTabElementScreenshot(node, kind, alt, ctrl) {
    if (!ext || !ext.runtime || typeof ext.runtime.sendMessage !== 'function') {
      throw new Error('runtime messaging unavailable');
    }
    if (ctrl && ctrl.cancelled) {
      const err = new Error('cancelled');
      err.code = 'LOOM_CANCELLED';
      throw err;
    }
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    await waitForPaintFrame();
    await waitForDynamicCanvasPaint(ctrl, node);
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (ctrl && ctrl.cancelled) {
      const err = new Error('cancelled');
      err.code = 'LOOM_CANCELLED';
      throw err;
    }

    const rect = node.getBoundingClientRect();
    const clipLeft = Math.max(0, rect.left);
    const clipTop = Math.max(0, rect.top);
    const clipRight = Math.min(window.innerWidth || document.documentElement.clientWidth || rect.right, rect.right);
    const clipBottom = Math.min(window.innerHeight || document.documentElement.clientHeight || rect.bottom, rect.bottom);
    const clipWidth = Math.max(0, clipRight - clipLeft);
    const clipHeight = Math.max(0, clipBottom - clipTop);
    if (clipWidth < 24 || clipHeight < 24) {
      throw new Error('element not visible enough for visible-tab capture');
    }

    const res = await ext.runtime.sendMessage({ type: 'capture-visible-tab' });
    if (!res || !res.ok || !res.dataUrl) {
      throw new Error(res && res.error ? res.error : 'visible-tab capture failed');
    }
    const img = await loadImageFromObjectURL(res.dataUrl);
    const viewW = Math.max(1, window.innerWidth || document.documentElement.clientWidth || clipRight);
    const viewH = Math.max(1, window.innerHeight || document.documentElement.clientHeight || clipBottom);
    const scaleX = Math.max(0.01, (img.naturalWidth || img.width || viewW) / viewW);
    const scaleY = Math.max(0.01, (img.naturalHeight || img.height || viewH) / viewH);
    const sourceX = Math.max(0, Math.round(clipLeft * scaleX));
    const sourceY = Math.max(0, Math.round(clipTop * scaleY));
    const sourceW = Math.max(1, Math.min(Math.round(clipWidth * scaleX), (img.naturalWidth || img.width) - sourceX));
    const sourceH = Math.max(1, Math.min(Math.round(clipHeight * scaleY), (img.naturalHeight || img.height) - sourceY));
    const maxDim = ELEMENT_SCREENSHOT_MAX_DIM;
    const outputScale = Math.min(1, maxDim / Math.max(sourceW, sourceH));
    const tw = Math.max(1, Math.round(sourceW * outputScale));
    const th = Math.max(1, Math.round(sourceH * outputScale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('visible-tab crop canvas unavailable');
    ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, tw, th);
    let dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    if (dataUrl.length > ELEMENT_SCREENSHOT_MAX_DATA_URL) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    }
    if (dataUrl.length > ELEMENT_SCREENSHOT_MAX_DATA_URL) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.58);
    }
    const stagedSrc = stageDataURLMedia(dataUrl, `${kind}-screenshot`, 'image/jpeg');
    const src = stagedSrc || dataUrl;
    return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt || `${kind} capture`)}" loading="lazy" data-loom-capture-kind="${escapeAttr(kind)}" data-loom-capture-source="visible-tab">`;
  }

  async function captureElementScreenshotAsync(node, kind, alt, ctrl) {
    const rect = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return `*[${kind} unavailable — source element had no visible size]*`;
    }
    try {
      return await captureVisibleTabElementScreenshot(node, kind, alt, ctrl);
    } catch (err) {
      if (err && err.code === 'LOOM_CANCELLED') throw err;
      console.warn('[Loom] visible-tab element screenshot failed; falling back to serializer', kind, err);
    }
    // Mirror the wait performed in captureVisibleTabElementScreenshot (1618-1620):
    // give canvases inside this element a chance to paint before we clone +
    // serialize. Without this, the SVG-foreignObject fallback path captured
    // empty pixels for any canvas whose first paint happens after page load
    // (peer-chat msg-040 — regression 3b residual on the fallback path).
    await waitForDynamicCanvasPaint(ctrl, node);
    const w = Math.max(1, Math.ceil(Math.min(rect.width, 2200)));
    const h = Math.max(1, Math.ceil(Math.min(rect.height, 1800)));
    const scale = Math.min(1, ELEMENT_SCREENSHOT_MAX_DIM / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    let objectURL = '';
    try {
      const clone = cloneElementForScreenshot(node);
      const xml = new XMLSerializer().serializeToString(clone);
      const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${tw}" height="${th}" viewBox="0 0 ${w} ${h}">` +
        `<foreignObject width="${w}" height="${h}">${xml}</foreignObject>` +
        '</svg>';
      objectURL = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      const img = await loadImageFromObjectURL(objectURL);
      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('element screenshot canvas unavailable');
      ctx.drawImage(img, 0, 0, tw, th);
      let dataUrl = canvas.toDataURL('image/png');
      if (dataUrl.length > ELEMENT_SCREENSHOT_MAX_DATA_URL) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      }
      if (dataUrl.length > ELEMENT_SCREENSHOT_MAX_DATA_URL) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.68);
      }
      const stagedSrc = stageDataURLMedia(dataUrl, `${kind}-screenshot`, 'image/jpeg');
      const src = stagedSrc || dataUrl;
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt || `${kind} capture`)}" loading="lazy" data-loom-capture-kind="${escapeAttr(kind)}">`;
    } catch (err) {
      console.warn('[Loom] element screenshot failed', kind, err);
      return `*[${kind} content not capturable]*`;
    } finally {
      if (objectURL) URL.revokeObjectURL(objectURL);
    }
  }

  async function capturePendingElementScreenshots(ctrl) {
    if (pendingElementScreenshots.size === 0) return new Map();
    const entries = [...pendingElementScreenshots.entries()];
    pendingElementScreenshots.clear();
    const map = new Map();
    const startX = window.scrollX || window.pageXOffset || 0;
    const startY = window.scrollY || window.pageYOffset || 0;
    try {
      for (const [id, entry] of entries) {
        if (ctrl && ctrl.cancelled) return new Map();
        const html = await captureElementScreenshotAsync(entry.node, entry.kind, entry.alt, ctrl);
        map.set(id, html);
      }
    } finally {
      try {
        window.scrollTo(startX, startY);
        await waitForPaintFrame();
      } catch (_) {}
    }
    return map;
  }

  function applyElementScreenshots(body, screenshots) {
    return body.replace(
      /<!-- loom-element-screenshot id="([^"]+)" kind="([^"]+)" alt="([^"]*)" -->/g,
      (_, id, kind, alt) => screenshots.get(id) || `*[${kind || 'visual'} content unavailable]*`
    );
  }

  function captureElementScreenshot(node, out, kind) {
    try {
      // Direct canvas: downscale to keep the body cap usable.
      // Full-resolution canvas screenshots regularly produce 50-200KB
      // base64 strings, which fill the body cap and crowd out all
      // prose. 800px max + JPEG quality 0.75 keeps the image
      // recognizable at ~10-30KB. Cross-origin tainted canvases throw
      // SecurityError → caught + placeholder.
      if (node.tagName.toLowerCase() === 'canvas') {
        const maxDim = 800;
        const w = node.width || node.clientWidth;
        const h = node.height || node.clientHeight;
        if (!w || !h) return;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const tw = Math.max(1, Math.round(w * scale));
        const th = Math.max(1, Math.round(h * scale));
        const off = document.createElement('canvas');
        off.width = tw;
        off.height = th;
        off.getContext('2d').drawImage(node, 0, 0, tw, th);
        if (canvasLooksVisuallyBlank(off)) return;
        let dataUrl;
        dataUrl = off.toDataURL('image/jpeg', scale < 1 ? 0.75 : 0.8);
        if (!dataUrl) return;
        const stagedSrc = stageDataURLMedia(dataUrl, `${kind}-screenshot`, 'image/jpeg');
        const src = stagedSrc || dataUrl;
        pushBlankBlock(out, [`<img src="${escapeAttr(src)}" alt="${escapeAttr(`${kind} capture`)}" loading="lazy" data-loom-capture-kind="${escapeAttr(kind)}">`]);
        return;
      }
      queueElementScreenshot(node, out, kind, elementScreenshotAlt(node, kind));
    } catch (_) {
      // Tainted canvas / cross-origin / serializer failure — skip
      // with a quiet placeholder.
      pushBlankBlock(out, [`*[${kind} content not capturable]*`]);
    }
  }

  /// `<figure>` — usually wraps an image/video with a `<figcaption>`.
  /// Walk children inline so the contained media gets its handler;
  /// emit caption as italic line below.
  function handleFigure(node, out) {
    flushLine(out);
    if (out.length && out[out.length - 1] !== '') out.push('');
    walkChildren(node, out, { listDepth: 0, listType: null, listIndex: 0 });
    const caption = node.querySelector('figcaption');
    if (caption) {
      const text = (caption.textContent || '').trim();
      if (text) {
        out.push(`*${text}*`);
        out.push('');
      }
    }
  }

  function walk(node, out, ctx) {
    if (!node) return;
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const txt = node.textContent.replace(/\s+/g, ' ');
      if (txt.trim()) appendInline(out, txt);
      return;
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return;

    const tag = node.tagName.toLowerCase();

    if (tag === 'lite-youtube' || tag === 'youtube-player' || tag === 'youtube-embed' ||
        node.hasAttribute('data-youtube-id') || node.hasAttribute('data-videoid') ||
        node.hasAttribute('data-youtubeid')) {
      const provider = providerFromElement(node);
      if (provider) {
        emitProviderEmbed(out, provider, provider.url || '', providerTitleFromElement(node));
        return;
      }
    }

    // Hard skip: tags whose textContent is code/markup never meant
    // for human reading. Note media tags (iframe / svg / video /
    // audio / canvas) used to live here but Phase C M2 capture
    // upgrade KEEPS them — we now extract media URLs / inline SVG /
    // canvas screenshots so captured pages preserve videos, charts,
    // figures alongside the prose.
    if (tag === 'style' || tag === 'script' || tag === 'noscript' ||
        tag === 'template') {
      return;
    }

    if (isHeadingTag(tag)) {
      emitHeading(node, out);
      return;
    }

    if (isStandaloneVisualLabel(node)) {
      emitVisualBlockLabel(node, out);
      return;
    }

    if (isCompositeMediaBlock(node)) {
      handleCompositeMediaBlock(node, out);
      return;
    }

    if (isStructuredVisualBlock(node)) {
      handleStructuredVisualBlock(node, out);
      return;
    }

    // Media tags get explicit handlers below. Done early to avoid
    // hitting the inline / container fallthroughs.
    if (tag === 'img' || tag === 'picture') {
      handleImage(node, out);
      return;
    }
    if (tag === 'iframe') {
      handleIframe(node, out);
      return;
    }
    if (tag === 'video') {
      handleVideo(node, out);
      return;
    }
    if (tag === 'audio') {
      handleAudio(node, out);
      return;
    }
    if (tag === 'svg') {
      handleSvg(node, out);
      return;
    }
    if (tag === 'canvas') {
      handleCanvas(node, out);
      return;
    }
    if (tag === 'figure') {
      handleFigure(node, out);
      return;
    }
    if (tag === 'input' || tag === 'textarea') {
      const text = (node.getAttribute('value') || node.value || node.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim();
      if (text) appendInline(out, text);
      return;
    }

    if (tag === 'p') {
      flushLine(out);
      out.push('');
      walkChildren(node, out, ctx);
      flushLine(out);
      out.push('');
      return;
    }

    if (tag === 'br') {
      flushLine(out);
      return;
    }

    if (tag === 'hr') {
      flushLine(out);
      out.push('');
      out.push('---');
      out.push('');
      return;
    }

    if (tag === 'ol' || tag === 'ul') {
      flushLine(out);
      out.push('');
      const childCtx = {
        listDepth: ctx.listDepth + 1,
        listType: tag,
        listIndex: 0,
      };
      walkChildren(node, out, childCtx);
      flushLine(out);
      out.push('');
      return;
    }

    if (tag === 'li') {
      flushLine(out);
      ctx.listIndex += 1;
      const indent = '  '.repeat(Math.max(0, ctx.listDepth - 1));
      const marker = ctx.listType === 'ol' ? `${ctx.listIndex}. ` : '- ';
      out.push(indent + marker);
      // Walk children in inline mode (they append to last line).
      walkChildren(node, out, { ...ctx, listType: null, listIndex: 0 });
      flushLine(out);
      return;
    }

    if (tag === 'blockquote') {
      flushLine(out);
      out.push('');
      const inner = [];
      walkChildren(node, inner, ctx);
      const combined = inner.join('\n').trim();
      combined.split('\n').forEach((line) => {
        out.push('> ' + line);
      });
      out.push('');
      return;
    }

    // Tables: many sites (Hacker News, classic forums, docs) lay out
    // structured content in <table><tr><td> rather than semantic
    // lists. Without explicit handlers the walker collapses every
    // row into one giant paragraph. Treat each <tr> as a line break
    // and each <td>/<th> as a space-separated cell within the row.
    if (tag === 'table' || tag === 'tbody' || tag === 'thead' || tag === 'tfoot') {
      flushLine(out);
      out.push('');
      walkChildren(node, out, ctx);
      flushLine(out);
      out.push('');
      return;
    }

    if (tag === 'tr') {
      flushLine(out);
      if (out.length && out[out.length - 1] !== '') out.push('');
      walkChildren(node, out, ctx);
      flushLine(out);
      return;
    }

    if (tag === 'td' || tag === 'th') {
      walkChildren(node, out, ctx);
      // Inter-cell spacer so text from neighboring cells doesn't run
      // together (rank "1." + title + sitebit live in separate <td>s
      // on Hacker News).
      appendInline(out, ' ');
      return;
    }

    if (tag === 'pre') {
      flushLine(out);
      out.push('');
      // Detect language from `<code class="language-foo">` /
      // `<code class="hljs foo">` / `<pre data-language="foo">`. The
      // language tag travels with the markdown fence so the renderer
      // can syntax-highlight it.
      let lang = '';
      const codeEl = node.querySelector('code');
      const cls = ((codeEl && codeEl.className) || node.className || '').toLowerCase();
      const m1 = cls.match(/language-([\w+#-]+)/);
      const m2 = cls.match(/\bhljs\b\s+([\w+#-]+)/);
      const dl = node.getAttribute('data-language') || (codeEl && codeEl.getAttribute('data-language'));
      if (m1) lang = m1[1];
      else if (m2) lang = m2[1];
      else if (dl) lang = dl.toLowerCase();
      out.push('```' + lang);
      const txt = node.textContent.replace(/\n+$/, '');
      txt.split('\n').forEach((line) => out.push(line));
      out.push('```');
      out.push('');
      return;
    }

    // Inline-level tags that decorate text.
    if (tag === 'a') {
      const href = node.getAttribute('href') || '';
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      const provider = providerFromElement(node);
      if (provider) {
        emitProviderEmbed(out, provider, href, providerTitleFromElement(node) || text);
        return;
      }
      if (text && href) {
        appendInline(out, `[${text}](${href})`);
      } else if (text) {
        appendInline(out, text);
      }
      return;
    }

    if (tag === 'strong' || tag === 'b') {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (text) appendInline(out, `**${text}**`);
      return;
    }

    if (tag === 'em' || tag === 'i') {
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (text) appendInline(out, `*${text}*`);
      return;
    }

    if (tag === 'code') {
      // Skip if inside <pre>; pre already handles
      if (node.parentElement && node.parentElement.tagName.toLowerCase() === 'pre') return;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (text) appendInline(out, `\`${text}\``);
      return;
    }

    // Containers / unknown inline → fall through to children.
    walkChildren(node, out, ctx);

    // After divs / sections / containers, ensure paragraph break so
    // visually-separated content doesn't run together.
    if (tag === 'div' || tag === 'section' || tag === 'article') {
      flushLine(out);
      if (out.length && out[out.length - 1] !== '') out.push('');
    }
  }

  function walkChildren(node, out, ctx) {
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i], out, ctx);
    }
  }

  function appendInline(out, text) {
    if (!out.length) {
      out.push(text);
      return;
    }
    const last = out[out.length - 1];
    if (last === '') {
      // Empty entries are paragraph-break sentinels left by block
      // handlers (<p>, <tr>, <h1>, etc.). Don't overwrite them — push
      // a new line so the break survives. Earlier code treated these
      // as "blank slots to fill", which silently collapsed every
      // structural break into nothing, especially on table-heavy
      // pages like Hacker News.
      out.push(text);
    } else {
      out[out.length - 1] = last.endsWith(' ') || text.startsWith(' ')
        ? last + text
        : last + ' ' + text;
    }
  }

  function flushLine(out) {
    if (out.length === 0) return;
    if (out[out.length - 1] !== '' && !out[out.length - 1].endsWith('\n')) {
      // last line is open — leave as-is, next push starts new line.
    }
  }

  /// Async — runs sync extraction first (which registers any
  /// canvas elements via handleCanvas), then awaits the recording
  /// pass and splices `<video>` blocks back into the body before
  /// applying the 200K char cap. If no canvases were registered
  /// the recording phase resolves immediately.
  async function capturePagePayload(onProgress, ctrl) {
    const url = location.href;
    const title = document.title;
    const selection = window.getSelection ? window.getSelection().toString() : '';
    const description = getMeta('og:description') || getMeta('description');
    const siteName = getMeta('og:site_name');

    pendingCanvasRecordings.clear();
    pendingRemoteMedia.clear();
    pendingElementScreenshots.clear();
    // v1.4.0 — drain any stale attachments from a previous run so we
    // don't double-ship binaries if a prior capture threw mid-flight.
    pendingMediaAttachments = [];
    if (typeof onProgress === 'function') onProgress({ phase: 'preparing' });
    await preparePageForCapture(ctrl);
    await waitForDynamicCanvasPaint(ctrl);
    if (ctrl && ctrl.cancelled) {
      pendingCanvasRecordings.clear();
      pendingRemoteMedia.clear();
      pendingElementScreenshots.clear();
      pendingMediaAttachments = [];
      const err = new Error('cancelled');
      err.code = 'LOOM_CANCELLED';
      throw err;
    }
    let body = extractMainContent() || '';

    // v1.4.1 — Esc-cancellation gate before the (potentially 4s)
    // recording phase. If cancelled before any canvas was queued just
    // throw — caller's catch resets the button.
    if (ctrl && ctrl.cancelled) {
      pendingCanvasRecordings.clear();
      pendingRemoteMedia.clear();
      pendingElementScreenshots.clear();
      pendingMediaAttachments = [];
      const err = new Error('cancelled');
      err.code = 'LOOM_CANCELLED';
      throw err;
    }

    if (pendingElementScreenshots.size > 0) {
      try {
        if (typeof onProgress === 'function') onProgress({ phase: 'element-screenshots', count: pendingElementScreenshots.size });
        const elementScreenshots = await capturePendingElementScreenshots(ctrl);
        if (ctrl && ctrl.cancelled) {
          pendingCanvasRecordings.clear();
          pendingRemoteMedia.clear();
          pendingElementScreenshots.clear();
          pendingMediaAttachments = [];
          const err = new Error('cancelled');
          err.code = 'LOOM_CANCELLED';
          throw err;
        }
        body = applyElementScreenshots(body, elementScreenshots);
      } catch (err) {
        if (err && err.code === 'LOOM_CANCELLED') throw err;
        console.warn('[Loom] element screenshot phase failed', err);
        body = applyElementScreenshots(body, new Map());
        pendingElementScreenshots.clear();
      }
    }

    if (pendingCanvasRecordings.size > 0) {
      try {
        if (typeof onProgress === 'function') onProgress({ phase: 'recording', count: pendingCanvasRecordings.size });
        await waitForDynamicCanvasPaint(ctrl);
        const recordings = await recordPendingCanvases(ctrl);
        if (ctrl && ctrl.cancelled) {
          pendingCanvasRecordings.clear();
          pendingRemoteMedia.clear();
          pendingElementScreenshots.clear();
          pendingMediaAttachments = [];
          const err = new Error('cancelled');
          err.code = 'LOOM_CANCELLED';
          throw err;
        }
        body = applyCanvasRecordings(body, recordings);
        if (typeof onProgress === 'function') onProgress({ phase: 'done', recorded: recordings.size });
      } catch (err) {
        // Re-throw cancellation so caller can distinguish from
        // "recording phase silently degraded to JPEG fallback".
        if (err && err.code === 'LOOM_CANCELLED') throw err;
        console.warn('[Loom] canvas recording phase failed', err);
        // Strip the begin/end markers but keep the static JPEG fallback
        // contents so the user still gets a visual.
        body = body.replace(
          /<!-- loom-canvas-fallback-begin id="[^"]+" -->([\s\S]*?)<!-- loom-canvas-fallback-end id="[^"]+" -->/g,
          '$1'
        );
        pendingCanvasRecordings.clear();
        pendingRemoteMedia.clear();
        // Discard half-collected attachments from the failed run.
        pendingMediaAttachments = [];
      }
    }

    if (pendingRemoteMedia.size > 0) {
      try {
        if (typeof onProgress === 'function') onProgress({ phase: 'media', count: pendingRemoteMedia.size });
        body = await fetchPendingRemoteMedia(body, ctrl);
      } catch (err) {
        if (err && err.code === 'LOOM_CANCELLED') throw err;
        console.warn('[Loom] remote media attachment phase failed', err);
        pendingRemoteMedia.clear();
      }
    }

    // Drain the staged binary attachments onto the payload, then
    // reset so the next capture starts clean.
    const mediaAttachments = pendingMediaAttachments;
    pendingMediaAttachments = [];
    const limitedBody = body.slice(0, 2000000);
    const captureAst = buildCaptureAst(limitedBody, { mediaAttachments });

    return {
      url,
      title,
      selection,
      description,
      siteName,
      // 2M char cap. Pasteboard transport (see triggerLoomScheme)
      // bypasses URL length limits. Earlier 200K cap silently
      // truncated body when canvas recording (≈533KB base64 at
      // 400KB cap) plus rich prose + code blocks pushed past it —
      // user reported missing trailing code blocks on flipdisc.io.
      // 2M comfortably fits 1-2 canvas videos + 30-40K-word article
      // + multiple inline code blocks + screenshots.
      body: limitedBody,
      // v1.4.0 — binary media (currently canvas recordings) ships as
      // sidecar attachments. Swift writes each as
      // `Loom-media-{stableID}.webm` next to the .md, then rewrites
      // every `loom://media/{tmpId}` reference in body to the stable
      // `loom://content/...` path.
      mediaAttachments,
      captureAst,
    };
  }

  // ----- Phase D · Snapshot Mode v0 -----
  //
  // `extractFullSnapshot()` produces a self-contained HTML string capturing
  // the page's design (DOM + inlined CSS + base64-encoded images). Used
  // by default for one-click capture. Companion to the regular
  // markdown extractor — markdown still goes to Loom.md for searchability,
  // but the snapshot HTML preserves visual fidelity for design-rich pages
  // where stripping to prose is destructive (flipdisc.io, design portfolios,
  // editorial layouts, etc.).
  //
  // Tradeoffs:
  //   - Cross-origin CSS fetches that fail silently → that stylesheet is
  //     dropped from the snapshot. Acceptable v0; render still works with
  //     remaining inline <style> blocks + system defaults.
  //   - Image base64 cap at 500KB per image → larger images keep their
  //     original `src` (the iframe has network access in the renderer so
  //     it still loads online; offline view will show broken alt).
  //   - All `<script>` + `<noscript>` stripped + every `on*` event handler
  //     attribute removed. Defense-in-depth alongside the iframe sandbox
  //     wrapper on the render side.
  //   - `<iframe>` tags kept; renderer wraps the whole snapshot in
  //     `sandbox="allow-same-origin allow-scripts"` so YouTube/Vimeo/
  //     Bilibili embeds keep working.

  /// Fetch a stylesheet's CSS text. Returns empty string on failure
  /// (cross-origin block, 404, network error). v0 just skips the
  /// missing rules; future could fall back to extracting computed
  /// styles for the most common selectors.
  async function fetchStylesheetText(href) {
    try {
      const abs = absUrl(href);
      const res = await fetch(abs, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return '';
      return await res.text();
    } catch (_) {
      return '';
    }
  }

  /// Fetch a binary URL and return a `data:` URL. Caps at `maxBytes` —
  /// returns null if the response is larger so the caller can preserve
  /// the original `src` instead of inlining a giant image.
  async function fetchAsDataURL(url, maxBytes) {
    try {
      const abs = absUrl(url);
      const res = await fetch(abs, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (blob.size > maxBytes) return null;
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch (_) {
      return null;
    }
  }

  /// Self-contained HTML snapshot of the live page. Returns:
  ///   { html: <full html>, byteLen: number, thumbnailDataUrl: string|null }
  /// Async because we fan out fetches for stylesheets + images.
  ///
  /// `preserveJS=true` keeps `<script>` tags, `on*` event handler
  /// attributes, and `javascript:` URLs so JS-driven animations
  /// (canvas, GSAP, Three.js) survive in the saved snapshot. The
  /// renderer is expected to mount the snapshot inside a sandboxed
  /// iframe (`allow-scripts` only — no `allow-same-origin`) so the
  /// executing code can't reach the host page. Default is the
  /// safer static path: strip every executable surface.
  async function extractFullSnapshot(preserveJS = false) {
    if (preserveJS) {
      console.warn('[Loom] snapshot extracting with preserveJS=true — <script>/on*/javascript: URLs are kept; renderer MUST mount inside a sandboxed iframe (allow-scripts WITHOUT allow-same-origin) to contain execution risk.');
    }

    const root = document.documentElement.cloneNode(true);

    if (preserveJS) {
      root.setAttribute('data-preserve-js', 'true');
      root.setAttribute('data-loom-snapshot-mode', 'interactive');
      const body = root.querySelector('body');
      if (body) {
        body.setAttribute('data-preserve-js', 'true');
        body.setAttribute('data-loom-snapshot-mode', 'interactive');
      }
    }

    if (!preserveJS) {
      // 1. Strip all <script> / <noscript> tags — no executable code in snapshot.
      root.querySelectorAll('script, noscript').forEach((n) => n.remove());

      // 2. Strip every on* event handler attribute on every element +
      //    javascript: hrefs / srcs. Defense in depth — sandbox iframe on
      //    the render side too.
      root.querySelectorAll('*').forEach((el) => {
        for (const attr of [...el.attributes]) {
          if (attr.name.startsWith('on')) {
            el.removeAttribute(attr.name);
          } else if (attr.name === 'href' && /^\s*javascript:/i.test(attr.value || '')) {
            el.removeAttribute(attr.name);
          } else if (attr.name === 'src' && /^\s*javascript:/i.test(attr.value || '')) {
            el.removeAttribute(attr.name);
          }
        }
      });
    } else {
      // preserveJS: keep <script>, on* handlers, javascript: URLs intact.
      // <noscript> still stripped — irrelevant when scripts run.
      root.querySelectorAll('noscript').forEach((n) => n.remove());
    }

    // 3. Inline external stylesheets. Walk every <link rel="stylesheet">,
    //    fetch CSS, replace the link with a <style> block. Cross-origin
    //    failures silently drop the link to avoid network attempts when
    //    rendered inside Loom.
    const linkPromises = [];
    root.querySelectorAll('link[rel~="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) { link.remove(); return; }
      const p = fetchStylesheetText(href).then((css) => {
        if (css) {
          const style = document.createElement('style');
          style.setAttribute('data-loom-inlined-from', absUrl(href));
          style.textContent = css;
          link.replaceWith(style);
        } else {
          link.remove();
        }
      });
      linkPromises.push(p);
    });

    // 4. Inline images via base64. 500KB cap per image; larger images
    //    keep their original src.
    const IMAGE_CAP_BYTES = 500 * 1024;
    const imgPromises = [];
    root.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;
      const p = fetchAsDataURL(src, IMAGE_CAP_BYTES).then((dataUrl) => {
        if (dataUrl) {
          img.setAttribute('src', dataUrl);
          img.setAttribute('data-loom-original-src', absUrl(src));
        }
      });
      imgPromises.push(p);
    });

    // 5. Iframes — v0 keeps them all. Renderer adds sandbox attribute
    //    so YouTube/Vimeo embeds still play but can't break out.

    // Wait for all fetches.
    await Promise.all([...linkPromises, ...imgPromises]);

    // 6. Inject <base> so any remaining relative URLs resolve against
    //    the original page origin (mostly redundant after image inlining,
    //    but covers @font-face URLs, srcset references, etc.).
    const head = root.querySelector('head');
    if (head && !head.querySelector('base')) {
      const base = document.createElement('base');
      base.setAttribute('href', location.href);
      head.insertBefore(base, head.firstChild);
    }

    const doctype = '<!DOCTYPE html>\n';
    const html = doctype + root.outerHTML;

    // 7. Optional thumbnail from og:image / twitter:image.
    let thumbnailDataUrl = null;
    const og = getMeta('og:image') || getMeta('twitter:image');
    if (og) {
      thumbnailDataUrl = await fetchAsDataURL(og, 250 * 1024);
    }

    return {
      html,
      byteLen: html.length,
      thumbnailDataUrl,
    };
  }

  /// Snapshot variant of capturePagePayload — produces the same shape
  /// plus `snapshotHtml` + optional thumbnail. Async because of
  /// stylesheet + image fetches. Falls back gracefully — if snapshot
  /// extraction throws, regular markdown body still ships.
  ///
  /// `preserveJS=true` flag is forwarded to `extractFullSnapshot` AND
  /// echoed onto the payload as `snapshotPreserveJS` so Swift / the
  /// renderer can apply tighter iframe sandbox flags (no `allow-
  /// same-origin`) when scripts will execute.
  async function captureSnapshotPayload(onProgress, preserveJS = false, ctrl) {
    const base = await capturePagePayload(onProgress, ctrl);
    if (ctrl && ctrl.cancelled) {
      const err = new Error('cancelled');
      err.code = 'LOOM_CANCELLED';
      throw err;
    }
    if (typeof onProgress === 'function') onProgress({ phase: 'snapshot' });
    try {
      const snap = await extractFullSnapshot(preserveJS);
      if (ctrl && ctrl.cancelled) {
        const err = new Error('cancelled');
        err.code = 'LOOM_CANCELLED';
        throw err;
      }
      base.snapshotHtml = snap.html;
      base.snapshotByteLen = snap.byteLen;
      base.snapshotPreserveJS = !!preserveJS;
      if (snap.thumbnailDataUrl) {
        base.snapshotThumbnail = snap.thumbnailDataUrl;
      }
    } catch (e) {
      if (e && e.code === 'LOOM_CANCELLED') throw e;
      console.warn('[Loom] snapshot extraction failed:', e);
    }
    return base;
  }

  /// Default one-click payload: semantic reader capture plus a
  /// JS-preserved snapshot evidence file. The snapshot is not the
  /// primary reading surface; it is the fidelity escape hatch for
  /// canvas/WebGL/animated regions that cannot be represented as
  /// markdown blocks.
  async function captureReaderWithSnapshotPayload(onProgress, preserveJS = true, ctrl) {
    return captureSnapshotPayload(onProgress, preserveJS, ctrl);
  }

  // Pasteboard handoff: write payload JSON to system clipboard, then
  // fire a SHORT `loom://capture?via=clipboard` URL via background
  // main-world scripting. Loom reads clipboard for the actual JSON.
  // Bypasses macOS AppleEvent URL truncation (which empirically caps
  // around 1-3KB) — supports unbounded body length.
  //
  // Cost: user's general clipboard gets temporarily overwritten.
  // Documented in Web Capture setup page; acceptable tradeoff for
  // a gesture that's specifically about capture.
  //
  // v1.4.1 hardening:
  //  - Retry clipboard.writeText once after 200ms when the first
  //    attempt throws. The most common cause is a transient document
  //    focus loss between the click handler and the async clipboard
  //    call (e.g. Chrome devtools open, animated sites yanking focus,
  //    OS-level focus change). A short re-attempt usually succeeds
  //    once the click gesture is processed.
  //  - When clipboard fails AND the payload is too large to safely
  //    overflow into the URL (legacy fallback), surface a visible
  //    error instead of silently shipping a truncated capture. The
  //    URL fallback path tolerates a few KB at most — anything past
  //    `URL_FALLBACK_MAX_BYTES` would either be truncated by macOS
  //    AppleEvent limits or rejected by the OS as malformed.
  // Threshold sized to match historical "URL fallback worked here"
  // observations: 500KB is well past any reasonable AppleEvent +
  // browser navigation cap, but generous enough that small captures
  // (no media attachments) still ship via URL when clipboard breaks.
  const URL_FALLBACK_MAX_BYTES = 500 * 1024;

  function showCaptureError(message) {
    const btn = document.getElementById(FLOAT_ID);
    if (!btn) return;
    showReloadHint(btn); // reuses the bronze bubble; swap text below.
    const hint = document.getElementById(HINT_ID);
    if (hint) hint.textContent = message;
  }

  function tryExecCommandClipboardWrite(json) {
    const previousActive = document.activeElement;
    const selection = window.getSelection ? window.getSelection() : null;
    const ranges = [];
    try {
      if (selection) {
        for (let i = 0; i < selection.rangeCount; i += 1) {
          ranges.push(selection.getRangeAt(i).cloneRange());
        }
      }

      const textarea = document.createElement('textarea');
      textarea.value = json;
      textarea.setAttribute('readonly', '');
      textarea.setAttribute('aria-hidden', 'true');
      textarea.style.cssText = [
        'position: fixed',
        'top: 0',
        'left: 0',
        'width: 1px',
        'height: 1px',
        'opacity: 0',
        'pointer-events: none',
        'z-index: -1',
      ].join(';');
      document.documentElement.appendChild(textarea);
      textarea.focus({ preventScroll: true });
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const ok = document.execCommand('copy');
      textarea.remove();
      if (ok) return { ok: true, method: 'execCommand' };
      return { ok: false, error: new Error('document.execCommand("copy") returned false') };
    } catch (err) {
      return { ok: false, error: err };
    } finally {
      try {
        if (selection) {
          selection.removeAllRanges();
          ranges.forEach((range) => selection.addRange(range));
        }
      } catch (_) {}
      try {
        if (previousActive && typeof previousActive.focus === 'function') {
          previousActive.focus({ preventScroll: true });
        }
      } catch (_) {}
    }
  }

  async function tryClipboardWrite(json) {
    let asyncError = null;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(json);
        return { ok: true, method: 'asyncClipboard' };
      }
    } catch (err) {
      asyncError = err;
    }

    const fallback = tryExecCommandClipboardWrite(json);
    if (fallback.ok && asyncError) {
      return { ok: true, method: fallback.method, warning: asyncError };
    }
    if (fallback.ok) return fallback;
    return { ok: false, error: asyncError || fallback.error || new Error('clipboard write unavailable') };
  }

  function getExtensionManifest() {
    try {
      if (ext && ext.runtime && typeof ext.runtime.getManifest === 'function') {
        return ext.runtime.getManifest() || {};
      }
    } catch (_) {}
    return {};
  }

  function countWords(body) {
    const text = String(body || '').trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }

  function countMediaRoles(mediaAttachments) {
    const counts = {};
    (mediaAttachments || []).forEach((attachment) => {
      const role = String((attachment && attachment.role) || 'unknown');
      counts[role] = (counts[role] || 0) + 1;
    });
    return counts;
  }

  function measurePayloadBytes(payload) {
    try {
      const clone = { ...payload };
      delete clone.loomExtension;
      return JSON.stringify(clone).length;
    } catch (_) {
      return 0;
    }
  }

  function classifyCaptureMedia(node) {
    if (!node) return null;
    // CaptureAST rule: never downgrade dynamic media to screenshots.
    // Screenshots can be auxiliary evidence, but GIF/video/provider
    // semantics must stay visible to native + reader layers.
    const tag = String(node.tagName || '').toLowerCase();
    const provider = providerFromElement(node);
    if (provider) {
      return {
        kind: 'providerEmbed',
        provider: provider.kind || '',
        url: provider.url || provider.fallbackURL || '',
      };
    }
    if (tag === 'iframe') {
      const src = absUrl(node.getAttribute('src') || node.getAttribute('data-src') || '');
      const frameProvider = src ? providerFromUrl(src) : null;
      if (frameProvider) {
        return {
          kind: 'providerEmbed',
          provider: frameProvider.kind || '',
          url: src,
        };
      }
    }
    if (tag === 'video' || tag === 'audio') {
      return {
        kind: tag === 'video' ? 'video' : 'audio',
        url: absUrl(node.currentSrc || node.getAttribute('src') || ''),
      };
    }
    if (tag === 'img' || tag === 'picture') {
      const img = tag === 'img' ? node : node.querySelector('img');
      const src = img ? pickFromImg(img) : '';
      const animatedHint = !!(img && firstAttr(img, [
        'data-gifsrc',
        'data-gif-src',
        'data-animated-src',
        'data-animation-src',
        'data-anim-src',
      ]));
      if (animatedHint || /\.(gif|webp|apng)(\?|#|$)/i.test(src)) {
        return { kind: 'gif', url: src };
      }
      return { kind: 'image', url: src };
    }
    if (tag === 'canvas' || tag === 'svg' || tag === 'astro-island') {
      return { kind: 'visualAssembly', url: '' };
    }
    return null;
  }

  function buildCaptureCensus(root) {
    const scope = root && root.querySelectorAll ? root : document;
    const mediaNodes = Array.from(scope.querySelectorAll(
      'iframe, video, audio, img, picture, canvas, svg, astro-island, lite-youtube, youtube-player, youtube-embed, [data-youtube-id], [data-videoid], [data-youtubeid]'
    ));
    const mediaKindCounts = {};
    mediaNodes.forEach((node) => {
      const media = classifyCaptureMedia(node);
      if (!media) return;
      mediaKindCounts[media.kind] = (mediaKindCounts[media.kind] || 0) + 1;
    });
    const headings = Array.from(scope.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .map((node) => readableNodeText(node))
      .filter(Boolean)
      .slice(0, 80);
    const visualLabels = Array.from(scope.querySelectorAll('.uppercase, [class*="uppercase"], [class*="tracking"]'))
      .map((node) => readableNodeText(node))
      .filter((text) => text && text.length <= 120)
      .slice(0, 80);
    const sectionHeadings = Array.from(new Set(headings.concat(visualLabels))).slice(0, 120);
    return {
      headingCount: headings.length,
      sectionHeadings,
      mediaNodeCount: mediaNodes.length,
      mediaKindCounts,
      imageCount: mediaKindCounts.image || 0,
      gifCount: mediaKindCounts.gif || 0,
      videoCount: mediaKindCounts.video || 0,
      providerEmbedCount: mediaKindCounts.providerEmbed || 0,
      visualAssemblyCount: mediaKindCounts.visualAssembly || 0,
      codeBlockCount: scope.querySelectorAll('pre, code').length,
      linkCount: scope.querySelectorAll('a[href]').length,
    };
  }

  function parseProviderEmbedMarker(line) {
    const m = String(line || '').match(/<!--\s*loom-embed\s+kind="([^"]*)"\s+id="([^"]*)"\s+url="([^"]*)"\s+title="([^"]*)"\s*-->/);
    if (!m) return null;
    return {
      kind: 'providerEmbed',
      provider: m[1],
      id: m[2],
      url: m[3],
      title: m[4],
      markdown: line,
    };
  }

  function mediaBlockFromMarkdown(line) {
    const text = String(line || '').trim();
    const provider = parseProviderEmbedMarker(text);
    if (provider) return provider;
    if (/^<video\b/i.test(text)) {
      return { kind: 'video', markdown: line };
    }
    if (/^<audio\b/i.test(text)) {
      return { kind: 'audio', markdown: line };
    }
    const imgMatch = text.match(/^<img\b[^>]*\bsrc="([^"]+)"/i) || text.match(/^!\[[^\]]*\]\(([^)]+)\)/);
    const imgSrc = imgMatch ? imgMatch[1] : '';
    if (imgSrc) {
      if (/\.(gif|webp|apng)(\?|#|$)/i.test(imgSrc)) {
        return { kind: 'gif', url: imgSrc, markdown: line };
      }
      return { kind: 'image', url: imgSrc, markdown: line };
    }
    if (/data-loom-capture-kind="(structured-visual|composite-media|svg|canvas)"/i.test(text)) {
      return { kind: 'visualAssembly', markdown: line };
    }
    return null;
  }

  function makeCaptureAstID(index) {
    return `b${String(index + 1).padStart(4, '0')}`;
  }

  function buildCaptureAst(body, options = {}) {
    const blocks = [];
    const lines = String(body || '').split(/\r?\n/);
    let paragraph = [];
    let inFence = false;
    let fence = [];

    const flushParagraph = () => {
      const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
      if (text) {
        blocks.push({
          id: makeCaptureAstID(blocks.length),
          kind: 'paragraph',
          text: text.slice(0, 1200),
          markdown: paragraph.join('\n').slice(0, 4000),
        });
      }
      paragraph = [];
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (/^(```|~~~)/.test(trimmed)) {
        fence.push(line);
        if (inFence) {
          blocks.push({
            id: makeCaptureAstID(blocks.length),
            kind: 'code',
            text: fence.join('\n').slice(0, 4000),
            markdown: fence.join('\n').slice(0, 4000),
          });
          fence = [];
          inFence = false;
        } else {
          flushParagraph();
          inFence = true;
        }
        return;
      }
      if (inFence) {
        fence.push(line);
        return;
      }

      const mediaBlock = mediaBlockFromMarkdown(trimmed);
      if (mediaBlock) {
        flushParagraph();
        blocks.push({
          id: makeCaptureAstID(blocks.length),
          ...mediaBlock,
        });
        return;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        const level = heading[1].length;
        const text = heading[2].replace(/[#*_`]/g, '').trim();
        if (level <= 2) {
          blocks.push({
            id: makeCaptureAstID(blocks.length),
            kind: 'section',
            level,
            text,
            markdown: line,
          });
        } else {
          blocks.push({
            id: makeCaptureAstID(blocks.length),
            kind: 'heading',
            level,
            text,
            markdown: line,
          });
        }
        return;
      }

      if (/loom-capture-eyebrow/.test(trimmed)) {
        flushParagraph();
        blocks.push({
          id: makeCaptureAstID(blocks.length),
          kind: 'eyebrow',
          text: trimmed.replace(/<[^>]+>/g, '').trim().slice(0, 240),
          markdown: line,
        });
        return;
      }

      if (!trimmed) {
        flushParagraph();
        return;
      }
      paragraph.push(line);
    });
    if (inFence && fence.length) {
      blocks.push({
        id: makeCaptureAstID(blocks.length),
        kind: 'code',
        text: fence.join('\n').slice(0, 4000),
        markdown: fence.join('\n').slice(0, 4000),
      });
    }
    flushParagraph();

    const captureCensus = buildCaptureCensus(document.body);
    return {
      version: 1,
      sourceURL: location.href,
      title: document.title || '',
      diagnostics: {
        captureCensus,
        sectionHeadings: captureCensus.sectionHeadings || [],
        blockCount: blocks.length,
      },
      // Keep the sidecar useful without turning it into a duplicate
      // article blob. Markdown remains canonical until the structured
      // renderer is fully promoted.
      blocks: blocks.slice(0, 240),
    };
  }

  function warningMessage(err) {
    if (!err) return '';
    const message = err && err.message ? err.message : String(err);
    return message.slice(0, 240);
  }

  function buildLoomExtensionDiagnostics(payload, transport) {
    const manifest = getExtensionManifest();
    const body = String((payload && payload.body) || '');
    const mediaAttachments = (payload && Array.isArray(payload.mediaAttachments))
      ? payload.mediaAttachments
      : [];
    return {
      manifestName: manifest.name || '',
      manifestVersion: manifest.version || '',
      extensionId: (ext && ext.runtime && ext.runtime.id) || '',
      extensionBaseUrl: (ext && ext.runtime && typeof ext.runtime.getURL === 'function')
        ? ext.runtime.getURL('')
        : '',
      manifestUrl: (ext && ext.runtime && typeof ext.runtime.getURL === 'function')
        ? ext.runtime.getURL('manifest.json')
        : '',
      captureUrl: payload.url || location.href,
      capturedAt: new Date().toISOString(),
      bodyLength: body.length,
      bodyWordCount: countWords(body),
      mediaAttachmentCount: mediaAttachments.length,
      mediaAttachmentRoleCounts: countMediaRoles(mediaAttachments),
      captureAstBlockCount: payload.captureAst && Array.isArray(payload.captureAst.blocks)
        ? payload.captureAst.blocks.length
        : 0,
      captureCensus: payload.captureAst && payload.captureAst.diagnostics
        ? payload.captureAst.diagnostics.captureCensus
        : null,
      payloadByteCount: measurePayloadBytes(payload),
      transportMethod: transport.method,
      clipboardWarnings: transport.warnings || [],
    };
  }

  function withClipboardWarning(warnings, err) {
    const message = warningMessage(err);
    return message ? warnings.concat(message) : warnings;
  }

  async function triggerLoomScheme(payload) {
    try {
      let clipboardWarnings = [];
      payload.loomExtension = buildLoomExtensionDiagnostics(payload, {
        method: 'pending',
        warnings: clipboardWarnings,
      });
      let json = JSON.stringify(payload);

      // Attempt 1.
      let attempt = await tryClipboardWrite(json);
      if (attempt.warning) clipboardWarnings = withClipboardWarning(clipboardWarnings, attempt.warning);
      if (!attempt.ok) {
        // Attempt 2 after a 200ms breather — gives the page a moment
        // to regain document focus after the click + async chain.
        console.warn('[Loom] clipboard write attempt 1 failed, retrying in 200ms:', attempt.error);
        clipboardWarnings = withClipboardWarning(clipboardWarnings, attempt.error);
        await new Promise((r) => setTimeout(r, 200));
        attempt = await tryClipboardWrite(json);
        if (attempt.warning) clipboardWarnings = withClipboardWarning(clipboardWarnings, attempt.warning);
      }

      if (attempt.ok) {
        payload.loomExtension = buildLoomExtensionDiagnostics(payload, {
          method: attempt.method,
          warnings: clipboardWarnings,
        });
        json = JSON.stringify(payload);
        const finalAttempt = await tryClipboardWrite(json);
        if (finalAttempt.warning) clipboardWarnings = withClipboardWarning(clipboardWarnings, finalAttempt.warning);
        if (!finalAttempt.ok) {
          clipboardWarnings = withClipboardWarning(clipboardWarnings, finalAttempt.error);
          console.warn('[Loom] final clipboard write with diagnostics failed:', finalAttempt.error);
          attempt = finalAttempt;
        } else {
          if (finalAttempt.method !== attempt.method) {
            clipboardWarnings = clipboardWarnings.concat(
              'clipboard transport changed while writing diagnostics: ' + attempt.method + ' -> ' + finalAttempt.method
            );
            payload.loomExtension = buildLoomExtensionDiagnostics(payload, {
              method: finalAttempt.method,
              warnings: clipboardWarnings,
            });
            json = JSON.stringify(payload);
            const settledAttempt = await tryClipboardWrite(json);
            if (settledAttempt.warning) clipboardWarnings = withClipboardWarning(clipboardWarnings, settledAttempt.warning);
            if (!settledAttempt.ok) {
              clipboardWarnings = withClipboardWarning(clipboardWarnings, settledAttempt.error);
              console.warn('[Loom] settled clipboard write with diagnostics failed:', settledAttempt.error);
              attempt = settledAttempt;
            } else {
              attempt = settledAttempt;
            }
          } else {
            attempt = finalAttempt;
          }
        }
      }

      if (attempt.ok) {
        const res = await ext.runtime.sendMessage({ type: 'open-loom-via-clipboard' });
        return !!(res && res.ok);
      }

      // Both clipboard attempts failed. Decide whether the payload is
      // small enough to safely fit through the URL fallback path.
      console.warn('[Loom] clipboard write failed twice, evaluating URL fallback:', attempt.error);
      clipboardWarnings = withClipboardWarning(clipboardWarnings, attempt.error);
      payload.loomExtension = buildLoomExtensionDiagnostics(payload, {
        method: 'urlFallback',
        warnings: clipboardWarnings,
      });
      json = JSON.stringify(payload);
      const payloadBytes = json.length; // approx — JSON is ASCII-ish
      if (payloadBytes > URL_FALLBACK_MAX_BYTES) {
        console.error(
          '[Loom] payload too large for URL fallback (',
          payloadBytes, 'bytes >',
          URL_FALLBACK_MAX_BYTES, 'cap). Aborting to avoid silent truncation.'
        );
        payload.loomExtension = buildLoomExtensionDiagnostics(payload, {
          method: 'failed',
          warnings: clipboardWarnings,
        });
        showCaptureError('Loom 剪贴板写入失败且内容过大；请刷新页面重试');
        return false;
      }

      const res = await ext.runtime.sendMessage({ type: 'open-loom', payload });
      return !!(res && res.ok);
    } catch (err) {
      console.warn('[Loom] triggerLoomScheme failed:', err);
      return false;
    }
  }

  // Floating capture button — universal trigger that doesn't depend
  // on toolbar UI or context menu surfaces. Some browsers (notably
  // OpenAI Atlas) hide / filter both, leaving DOM injection as the
  // only reliable extension affordance. Lives bottom-right at 36px,
  // semi-transparent at rest, full opacity on hover. Plain click runs
  // the rich reader capture; snapshot modes are explicit fallbacks.
  const FLOAT_ID = '__loom_capture_floating_btn__';
  const HINT_ID  = '__loom_capture_reload_hint__';

  // Surfaces an unmissable bubble next to the L button telling the
  // user this tab is orphaned (extension was reloaded after the page
  // mounted). The fix is Cmd+R; spelling that out beats a red flash
  // which the user has to debug. Auto-dismisses after 6s.
  function showReloadHint(btn) {
    const existing = document.getElementById(HINT_ID);
    if (existing) existing.remove();
    const hint = document.createElement('div');
    hint.id = HINT_ID;
    hint.textContent = 'Loom扩展已升级，⌘R 刷新本页再试';
    hint.style.cssText = [
      'position: fixed',
      'bottom: 64px',
      'right: 20px',
      'max-width: 240px',
      'padding: 8px 12px',
      'border-radius: 8px',
      'background: #2a1c12',
      'color: #fbf6ec',
      'font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      'font-size: 12px',
      'line-height: 1.35',
      'box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08)',
      'z-index: 2147483647',
      'pointer-events: none',
      'opacity: 0',
      'transform: translateY(4px)',
      'transition: opacity 0.18s ease, transform 0.18s ease',
    ].join(';');
    document.body.appendChild(hint);
    requestAnimationFrame(() => {
      hint.style.opacity = '1';
      hint.style.transform = 'translateY(0)';
    });
    if (btn) {
      btn.style.background = 'linear-gradient(180deg, #b07a3a 0%, #6e4524 100%)';
    }
    setTimeout(() => {
      hint.style.opacity = '0';
      setTimeout(() => hint.remove(), 200);
      if (btn) {
        btn.style.background = 'linear-gradient(180deg, #a36a3a 0%, #6e4524 100%)';
      }
    }, 6000);
  }

  function injectFloatingButton() {
    if (document.getElementById(FLOAT_ID)) return;
    if (!document.body) return;

    // One-time stylesheet for the recording-state pulse. Scoped to
    // the floating button class so it can't leak into page styles.
    if (!document.getElementById('__loom_capture_floating_style__')) {
      const style = document.createElement('style');
      style.id = '__loom_capture_floating_style__';
      style.textContent = `
        @keyframes __loom_record_pulse__ {
          0%   { box-shadow: 0 2px 6px rgba(0,0,0,0.22), 0 0 0 0 rgba(200, 50, 50, 0.55); }
          70%  { box-shadow: 0 2px 6px rgba(0,0,0,0.22), 0 0 0 8px rgba(200, 50, 50, 0); }
          100% { box-shadow: 0 2px 6px rgba(0,0,0,0.22), 0 0 0 0 rgba(200, 50, 50, 0); }
        }
        #${FLOAT_ID}.__loom-recording {
          animation: __loom_record_pulse__ 1.1s ease-out infinite;
          opacity: 1 !important;
          font-size: 10px !important;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
      `;
      (document.head || document.documentElement).appendChild(style);
    }

    const btn = document.createElement('button');
    btn.id = FLOAT_ID;
    btn.type = 'button';
    btn.title = 'Capture to Loom · click = Reader + Snapshot (dynamic evidence) · shift+click = Reader + static Snapshot · cmd+click = Reader + Snapshot+JS (interactive evidence; sandboxed at render)';
    btn.textContent = 'L';
    btn.setAttribute('aria-label', 'Capture this page to Loom');
    btn.style.cssText = [
      'position: fixed',
      'bottom: 20px',
      'right: 20px',
      'width: 36px',
      'height: 36px',
      'border-radius: 50%',
      'background: linear-gradient(180deg, #a36a3a 0%, #6e4524 100%)',
      'color: #fbf6ec',
      'font-family: Georgia, "Times New Roman", serif',
      'font-size: 16px',
      'font-weight: 600',
      'line-height: 1',
      'border: 1px solid rgba(255, 255, 255, 0.18)',
      'cursor: pointer',
      'padding: 0',
      'box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.04)',
      'opacity: 0.55',
      'transition: opacity 0.15s ease, transform 0.15s ease',
      'z-index: 2147483647',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'user-select: none',
      '-webkit-user-select: none',
    ].join(';');
    btn.addEventListener('mouseenter', () => {
      btn.style.opacity = '1';
      btn.style.transform = 'scale(1.06)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.opacity = '0.55';
      btn.style.transform = 'scale(1)';
    });
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Loom] floating button clicked');

      // Pre-check: if the extension was reloaded after this tab
      // mounted (Atlas Remove + Load unpacked / dev iteration cycle),
      // ext.runtime.id reads as undefined here. Detect early and
      // show the reload hint BEFORE attempting clipboard write —
      // otherwise we leak the page clipboard with a half-written
      // payload before failing.
      try {
        if (typeof ext === 'undefined' || !ext.runtime || !ext.runtime.id) {
          console.warn('[Loom] orphaned content.js detected (ext.runtime.id undefined). Tab needs reload.');
          showReloadHint(btn);
          return;
        }
      } catch (probeErr) {
        console.warn('[Loom] runtime probe threw — orphan tab likely:', probeErr);
        showReloadHint(btn);
        return;
      }

      btn.style.background = 'linear-gradient(180deg, #6e4524 0%, #4a2e18 100%)';

      // Recording state: when handleCanvas registers any canvas, the
      // payload pass takes ~4s. Show a pulse-red recording dot so the
      // user doesn't think the click was lost. capturePagePayload
      // calls onProgress when recording phase starts and ends.
      const setLabel = (txt) => { btn.textContent = txt; };
      const startRecordingState = () => {
        btn.classList.add('__loom-recording');
        btn.style.background = 'linear-gradient(180deg, #c83232 0%, #861818 100%)';
        setLabel('...');
      };
      const clearRecordingState = () => {
        btn.classList.remove('__loom-recording');
        btn.style.background = 'linear-gradient(180deg, #a36a3a 0%, #6e4524 100%)';
        setLabel('L');
      };

      // v1.4.8 — three click modes:
      //   plain L               → Reader + interactive Snapshot
      //   shift+L               → Reader + static Snapshot
      //   cmd+L (or ctrl)       → Reader + Snapshot+JS
      // cmd/ctrl wins over shift so cmd+shift+L still means Snapshot+JS.
      const wantsSnapshotJS = !!(e && (e.metaKey || e.ctrlKey));
      const wantsStaticSnapshot = !!(e && e.shiftKey && !wantsSnapshotJS);
      const preserveSnapshotJS = !wantsStaticSnapshot;
      if (wantsSnapshotJS) {
        setLabel('snap+js');
      } else if (wantsStaticSnapshot) {
        setLabel('snap');
      } else {
        setLabel('read');
      }

      // v1.4.1 — Esc-to-cancel during recording / extracting.
      // Install a one-shot controller for this capture. The Esc
      // keydown listener flips `cancelled = true` and invokes any
      // registered stoppers (which force MediaRecorder.stop() so the
      // pending recording promise unwinds quickly). The capture path
      // checks `ctrl.cancelled` between every async hand-off and
      // throws { code: 'LOOM_CANCELLED' } so we can distinguish user
      // cancellation from real failures (don't show red flash).
      const ctrl = { cancelled: false, stoppers: [] };
      activeCaptureCtrl = ctrl;
      const onEscKey = (ev) => {
        if (ev.key === 'Escape' || ev.keyCode === 27) {
          if (ctrl.cancelled) return;
          console.log('[Loom] Esc pressed — cancelling capture');
          ctrl.cancelled = true;
          ctrl.stoppers.forEach((stop) => { try { stop(); } catch (_) {} });
          ev.preventDefault();
          ev.stopPropagation();
        }
      };
      // Capture-phase listener so we win against any page handler
      // that calls preventDefault on Escape (some SPA modal traps).
      window.addEventListener('keydown', onEscKey, true);

      try {
        const onProgress = (progress) => {
          if (progress && progress.phase === 'preparing') {
            console.log('[Loom] preparing page media before capture');
            btn.classList.add('__loom-recording');
            setLabel('...');
          } else if (progress && progress.phase === 'element-screenshots') {
            console.log('[Loom] capturing', progress.count, 'composite visual block(s)');
            btn.classList.add('__loom-recording');
            setLabel('...');
          } else if (progress && progress.phase === 'recording') {
            console.log('[Loom] recording', progress.count, 'canvas element(s) for ~4s · press Esc to cancel');
            startRecordingState();
          } else if (progress && progress.phase === 'done') {
            console.log('[Loom] recording complete; recorded', progress.recorded, 'clip(s)');
            clearRecordingState();
            if (wantsSnapshotJS) setLabel('snap+js');
            else if (wantsStaticSnapshot) setLabel('snap');
            else setLabel('read');
          } else if (progress && progress.phase === 'media') {
            console.log('[Loom] saving', progress.count, 'remote media attachment(s)');
            btn.classList.add('__loom-recording');
            btn.style.background = 'linear-gradient(180deg, #6e4524 0%, #4a2e18 100%)';
            setLabel('...');
          } else if (progress && progress.phase === 'snapshot') {
            console.log('[Loom] snapshot phase: inlining CSS + images', preserveSnapshotJS ? '(preserveJS)' : '(static)');
            setLabel(preserveSnapshotJS ? 'snap+js' : 'snap');
          }
        };
        const payload = await captureReaderWithSnapshotPayload(onProgress, preserveSnapshotJS, ctrl);
        console.log('[Loom] payload captured:', {
          url: payload.url,
          title: payload.title,
          bodyLen: (payload.body || '').length,
          selectionLen: (payload.selection || '').length,
          snapshotBytes: payload.snapshotByteLen || 0,
          snapshotMode: true,
          preserveJS: !!payload.snapshotPreserveJS,
          mediaAttachments: (payload.mediaAttachments || []).length,
        });

        // chrome.scripting.executeScript({world: 'MAIN'}) via
        // background — bypasses page CSP, runs anchor click in main
        // world, hands off `loom://` to OS LaunchServices. Single
        // path: if it fails, we surface the error and let the user
        // retry rather than navigating their current tab away (which
        // would kill scroll position, form state, etc.).
        const ok = await triggerLoomScheme(payload);
        if (ok) {
          console.log('[Loom] launched via main-world scripting.executeScript');
        } else {
          console.error('[Loom] capture failed — main-world scripting did not return ok. Reload extension + tab; try again.');
          showReloadHint(btn);
          return;
        }
      } catch (err) {
        // v1.4.1 — Esc-cancellation: tear down quietly. Clear pending
        // queues, restore button label, no red flash. The capture
        // helpers already cleared `pendingCanvasRecordings` and
        // `pendingMediaAttachments` before throwing; double-clear here
        // is a belt-and-suspenders guard.
        if (err && err.code === 'LOOM_CANCELLED') {
          console.log('[Loom] capture cancelled by user (Esc)');
          pendingCanvasRecordings.clear();
          pendingMediaAttachments = [];
          clearRecordingState();
          // Brief muted-grey flash so user gets visual confirmation.
          btn.style.background = 'linear-gradient(180deg, #6a6258 0%, #4b443c 100%)';
          setTimeout(() => {
            btn.style.background = 'linear-gradient(180deg, #a36a3a 0%, #6e4524 100%)';
          }, 400);
        } else {
          // "Extension context invalidated" specifically means this tab
          // was loaded before the extension was reloaded (Remove + Load
          // unpacked) — the content.js handle to ext.runtime is now
          // orphaned. Cmd+R fixes it. Show that hint instead of a
          // generic red flash.
          console.error('[Loom] floating capture failed:', err);
          clearRecordingState();
          const msg = String(err && err.message || err || '');
          if (msg.includes('Extension context invalidated') ||
              msg.includes('Receiving end does not exist')) {
            showReloadHint(btn);
          } else {
            btn.style.background = 'linear-gradient(180deg, #b03030 0%, #6e1818 100%)';
            setTimeout(() => {
              btn.style.background = 'linear-gradient(180deg, #a36a3a 0%, #6e4524 100%)';
            }, 800);
          }
        }
      } finally {
        // v1.4.1 — always remove the Esc listener and clear the
        // active controller, otherwise a stale listener stacks each
        // capture and Esc-spam would slow down the page.
        window.removeEventListener('keydown', onEscKey, true);
        if (activeCaptureCtrl === ctrl) activeCaptureCtrl = null;
        // Defensive: ensure label reverts to 'L' even if recording
        // state was set but onProgress 'done' never fired, or the
        // snapshot label stuck because of an early return.
        if (btn.classList.contains('__loom-recording')) {
          clearRecordingState();
        }
        setLabel('L');
      }

      setTimeout(() => {
        btn.style.background = 'linear-gradient(180deg, #a36a3a 0%, #6e4524 100%)';
      }, 300);
    });
    document.body.appendChild(btn);
    console.log('[Loom] floating capture button injected');
  }

  // Inject after DOM is ready; some sites construct body lazily.
  if (document.body) {
    injectFloatingButton();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectFloatingButton);
  } else {
    setTimeout(injectFloatingButton, 100);
  }

  // SPA-aware re-injection: some single-page apps wipe / replace the
  // body element on route change. A lightweight observer on the
  // document root re-attaches the button if it's gone missing.
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      if (!document.getElementById(FLOAT_ID) && document.body) {
        injectFloatingButton();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: false });
  }
})();
