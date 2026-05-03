'use client';

import { useEffect, useState, useRef, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Surface, Eyebrow, Display, Body, Stack } from '../../../components/loom';

// Phase D Snapshot Mode v1 — full-featured snapshot viewer.
//
// A snapshot is a self-contained HTML capture (full-fidelity webpage
// freeze with original CSS) written by the web extension's shift-click
// flow. Stored in the LoomFileStore sandbox as `Loom-snapshot-*.html`
// next to the per-domain Loom.md.
//
// We fetch the HTML over the JSON bridge (`loom://native/capture-snapshot.json`)
// rather than loading the file directly — the snapshot lives in the
// sandbox dir, not under `loom://content/<root>/...` (which resolves
// the user's external folder).
//
// Sandbox: static snapshots use same-origin access so Loom can measure
// the frame and inject the capture banner. JS-preserved snapshots omit
// allow-same-origin and run in a stricter opaque-origin sandbox.
//
// v1 ships:
//  - Full toolbar: back link, prev/next chain nav, capture title +
//    eyebrow, action buttons (open original, open in reader, fullscreen,
//    copy URL, distill stub, print, annotate stub).
//  - Captured-by-Loom banner injected into iframe on load.
//  - Keyboard shortcuts: f / o / Esc / ← / →.
//  - Loading skeleton + friendly error state.

interface SnapshotPayload {
  found: boolean;
  html?: string;
  filename?: string;
  fileURL?: string;
  byteLen?: number;
  error?: string;
}

interface CaptureEntry {
  id: string;
  rootID: string;
  rootLabel: string;
  kind: 'inbox' | 'web' | 'page' | 'passage' | 'other';
  subPath: string;
  domain: string;
  title: string;
  eyebrow: string;
  snippet: string;
  timestamp?: string;
  timestampEpoch?: number;
  snapshotFilename?: string;
}

// Pull source URL out of the eyebrow markdown — same shape as
// capture/page.tsx: "clipboard · 2026-04-27 19:15 · [↗](https://...)"
function extractSourceURL(eyebrow: string | undefined): string | null {
  if (!eyebrow) return null;
  const m = eyebrow.match(/\[(?:.+?)\]\(([^)]+)\)/);
  return m ? m[1] : null;
}

// Pull the timestamp string out of the eyebrow ("clipboard · 2026-04-27 19:15 · [↗](...)")
function extractTimestamp(eyebrow: string | undefined): string | null {
  if (!eyebrow) return null;
  // Look for "YYYY-MM-DD HH:MM" pattern.
  const m = eyebrow.match(/\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?/);
  return m ? m[0] : null;
}

// Pull domain from sub path (`Web/example.com/...`) or eyebrow URL.
function extractDomain(sub: string, eyebrow: string | undefined): string {
  const subParts = sub.split('/').filter(Boolean);
  if (subParts.length >= 2 && subParts[0] === 'Web') return subParts[1];
  const url = extractSourceURL(eyebrow);
  if (url) {
    try { return new URL(url).hostname; } catch { /* ignore */ }
  }
  return '';
}

function cssEscapeFallback(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function htmlSafeScriptString(value: string): string {
  return JSON.stringify(value || '').replace(/</g, '\\u003c');
}

function buildTargetedSnapshotSrcDoc(html: string, target: string): string {
  if (!html || !target) return html || '';
  const targetSelector = `[data-loom-snapshot-target="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(target) : cssEscapeFallback(target)}"]`;
  const targetJSON = htmlSafeScriptString(target);
  const style = `
<style data-loom-target-snapshot-style>
  html,
  body {
    margin: 0 !important;
    overflow: hidden !important;
  }
  body.loom-target-mode [data-loom-target-hidden-sibling="true"] {
    display: none !important;
  }
  body.loom-target-mode * {
    pointer-events: none !important;
  }
  body.loom-target-mode ${targetSelector},
  body.loom-target-mode ${targetSelector} * {
    pointer-events: auto !important;
  }
  body.loom-target-mode [data-loom-snapshot-target-active="true"] {
    display: block !important;
    visibility: visible !important;
  }
</style>`;
  const script = `
<script data-loom-target-snapshot-bootstrap>
(function () {
  var target = ${targetJSON};
  function escapeTarget(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value || '').replace(/["\\\\]/g, '\\\\$&');
  }
  function markSiblingsOnPath(node) {
    var current = node;
    var parent = current && current.parentElement;
    while (parent && parent !== document.documentElement) {
      Array.prototype.forEach.call(parent.children || [], function (child) {
        if (child !== current && !child.contains(current)) {
          child.setAttribute('data-loom-target-hidden-sibling', 'true');
        }
      });
      current = parent;
      parent = current.parentElement;
    }
  }
  function applyTargetMode() {
    if (!document.body) return;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('loom-target-mode');
    var selector = '[data-loom-snapshot-target="' + escapeTarget(target) + '"]';
    var node = document.querySelector(selector);
    if (!node) return;
    node.setAttribute('data-loom-snapshot-target-active', 'true');
    markSiblingsOnPath(node);
    // 2026-05-02 critical fix for parent-page scroll oscillation: when
    // the iframe document is forced to overflow: hidden above AND the
    // iframe has allow-same-origin (capture/page.tsx:wrapSnapshotBackedMedia
    // wraps it that way for trusted-route fetches), scrollIntoView
    // cannot find an internal scroll container and walks up the ancestor
    // chain — yanking the PARENT WINDOW scroll to re-center the target.
    // Every visualAssembly img on the reader spawns one such iframe, and
    // each iframe fires applyTargetMode three times (load + 120ms + 700ms),
    // so multiple iframes pull the parent in different directions and the
    // user sees "scroll keeps bouncing, can't move past first screen."
    //
    // The body classList + sibling-hiding CSS already centers the target
    // visually (display: none on siblings collapses everything else).
    // The scrollIntoView call was insurance for snapshots taller than the
    // iframe; with overflow: hidden it never had a useful effect anyway.
    // Drop it entirely. If we need to recenter scroll inside the iframe
    // in a future fix, do it via a contained docEl.scrollTop = ... write
    // that cannot escape this document.
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTargetMode, { once: true });
  } else {
    applyTargetMode();
  }
  window.setTimeout(applyTargetMode, 120);
  window.setTimeout(applyTargetMode, 700);
})();
</script>`;
  const injection = `${style}${script}`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${injection}</head>`);
  if (/<body\b[^>]*>/i.test(html)) return html.replace(/<body\b([^>]*)>/i, `<body$1>${injection}`);
  return `${injection}${html}`;
}

function SnapshotInner() {
  const params = useSearchParams();
  const embedMode = params.get('embed') === '1';
  const target = params.get('target') || '';
  const targetEmbedMode = embedMode && target.length > 0;
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const snapshotPreservesJS = useMemo(() => {
    const html = payload?.html || '';
    return /\bdata-preserve-js=(["'])true\1/i.test(html) ||
      /\bdata-loom-snapshot-mode=(["'])interactive\1/i.test(html);
  }, [payload?.html]);
  const snapshotSandbox = snapshotPreservesJS
    ? 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation'
    : 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation';
  const snapshotSrcDoc = useMemo(() => {
    const html = payload?.html || '';
    if (!html) return '';
    if (targetEmbedMode) return buildTargetedSnapshotSrcDoc(html, target);
    return html;
  }, [payload?.html, target, targetEmbedMode]);

  // Captures-list for prev/next chain nav (web-only, current domain).
  const [allEntries, setAllEntries] = useState<CaptureEntry[] | null>(null);

  // UI state.
  const [fullscreen, setFullscreen] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  const [distillOpen, setDistillOpen] = useState(false);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [snapshotHeight, setSnapshotHeight] = useState<number | null>(null);
  // Chain scope — by default same-domain, but user can flip to date or tag.
  const [chainScope, setChainScope] = useState<'domain' | 'date' | 'tag'>('domain');
  const [chainScopeOpen, setChainScopeOpen] = useState(false);
  // JS-preserved banner (auto-detected on iframe load) + dismiss state.
  const [jsPreserved, setJsPreserved] = useState(false);
  const [jsBannerDismissed, setJsBannerDismissed] = useState(false);

  // Annotations — pin store keyed by snapshot file path. createdAt added
  // for export ordering and metadata.
  const [annotations, setAnnotations] = useState<Array<{ x: number; y: number; note: string; id: string; createdAt: number }>>([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeResizeObserverRef = useRef<ResizeObserver | null>(null);

  // URLSearchParams already decodes form spaces; literal plus signs arrive as
  // %2B and must remain plus signs for exact capture lookup.
  const decode = (s: string | null) => s || '';
  const root = params.get('root') || '';
  const sub = decode(params.get('sub'));
  const filename = decode(params.get('filename'));
  const titleParam = decode(params.get('title'));
  const eyebrowParam = decode(params.get('eyebrow'));

  useEffect(() => {
    setSnapshotHeight(null);
    iframeResizeObserverRef.current?.disconnect();
    iframeResizeObserverRef.current = null;
  }, [filename]);

  useEffect(() => {
    setJsPreserved(snapshotPreservesJS);
  }, [snapshotPreservesJS]);

  useEffect(() => {
    return () => {
      iframeResizeObserverRef.current?.disconnect();
      iframeResizeObserverRef.current = null;
    };
  }, []);

  // Snapshot fetch.
  useEffect(() => {
    if (!root || !filename) {
      setFetchError('Missing root or filename query parameter.');
      return;
    }
    setPayload(null);
    setFetchError(null);
    const url = new URL('loom://native/capture-snapshot.json');
    url.searchParams.set('root', root);
    url.searchParams.set('sub', sub);
    url.searchParams.set('filename', filename);
    fetch(url.toString())
      .then((r) => r.json())
      .then((d: SnapshotPayload) => {
        if (d && d.found && d.html) {
          setPayload(d);
        } else {
          setFetchError(d.error || 'Snapshot not found.');
        }
      })
      .catch((err) => setFetchError(String(err)));
  }, [root, sub, filename]);

  // Captures-list fetch (for prev/next).
  useEffect(() => {
    fetch('loom://native/captures-list.json')
      .then((r) => r.json())
      .then((d) => setAllEntries(d.entries || []))
      .catch(() => { /* nav is optional; silently skip */ });
  }, []);

  // Restore snapshot-local state from localStorage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cs = window.localStorage.getItem('loom.snapshot.chainScope');
      if (cs === 'date' || cs === 'domain' || cs === 'tag') setChainScope(cs);
      const annKey = `loom.snapshot.annotations.${root}/${sub}/${filename}`;
      const ann = window.localStorage.getItem(annKey);
      if (ann) {
        const parsed = JSON.parse(ann);
        if (Array.isArray(parsed)) {
          // Migrate older entries without createdAt — stamp current time
          // so export ordering still works.
          const stamped = parsed.map((a: { x: number; y: number; note: string; id: string; createdAt?: number }) => ({
            ...a,
            createdAt: typeof a.createdAt === 'number' ? a.createdAt : Date.now(),
          }));
          setAnnotations(stamped);
        }
      }
      const dismissed = window.localStorage.getItem(`loom.snapshot.jsBanner.${root}/${sub}/${filename}.dismissed`);
      if (dismissed === '1') setJsBannerDismissed(true);
    } catch { /* ignore storage failures */ }
  }, [root, sub, filename]);

  // Persist snapshot-local preferences.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('loom.snapshot.chainScope', chainScope); } catch {}
  }, [chainScope]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const annKey = `loom.snapshot.annotations.${root}/${sub}/${filename}`;
      window.localStorage.setItem(annKey, JSON.stringify(annotations));
    } catch {}
  }, [annotations, root, sub, filename]);

  // Domain + reader URL + back href.
  const domain = useMemo(() => extractDomain(sub, eyebrowParam), [sub, eyebrowParam]);
  const timestamp = useMemo(() => extractTimestamp(eyebrowParam), [eyebrowParam]);
  const sourceURL = useMemo(() => extractSourceURL(eyebrowParam), [eyebrowParam]);
  const backHref = 'loom://bundle/loom-render/captures/';

  // Reader URL: switch from snapshot mode → reader mode at the same
  // capture entry. capture/page.tsx accepts root/sub/title/eyebrow.
  const readerHref = useMemo(() => {
    const u = new URL('loom://bundle/loom-render/capture/');
    u.searchParams.set('root', root);
    u.searchParams.set('sub', sub);
    if (titleParam) u.searchParams.set('title', titleParam);
    if (eyebrowParam) u.searchParams.set('eyebrow', eyebrowParam);
    return u.toString();
  }, [root, sub, titleParam, eyebrowParam]);

  // Current entry's tags (for chain-by-tag scope). Read from localStorage
  // using the same stable-key scheme as the captures landing.
  const currentEntryTags = useMemo(() => {
    if (typeof window === 'undefined' || !allEntries) return [] as string[];
    const me = allEntries.find((e) => e.subPath === sub && e.snapshotFilename === filename);
    if (!me) return [];
    try {
      const k = `${me.rootID}:${me.title}:${me.eyebrow}`;
      const tv = window.localStorage.getItem(`loom:tags:${k}`);
      if (!tv) return [];
      const arr = JSON.parse(tv);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }, [allEntries, sub, filename]);

  // Resolve tags for any entry on demand (chain-by-tag filter).
  const tagsFor = useCallback((e: CaptureEntry): string[] => {
    if (typeof window === 'undefined') return [];
    try {
      const k = `${e.rootID}:${e.title}:${e.eyebrow}`;
      const tv = window.localStorage.getItem(`loom:tags:${k}`);
      if (!tv) return [];
      const arr = JSON.parse(tv);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }, []);

  // Chain for prev/next nav. Scope determines the filter:
  //   - 'domain' (default) → same `entry.domain`
  //   - 'date'             → all snapshot-bearing entries, by date
  //   - 'tag'              → entries that share at least one tag with current
  // Always sorted newest first.
  const chain = useMemo(() => {
    if (!allEntries) return [] as CaptureEntry[];
    const allSnapshots = allEntries.filter((e) => !!e.snapshotFilename);
    let filtered: CaptureEntry[];
    if (chainScope === 'date') {
      filtered = allSnapshots;
    } else if (chainScope === 'tag') {
      if (currentEntryTags.length === 0) {
        // Fall back to domain so the toolbar isn't empty.
        filtered = domain ? allSnapshots.filter((e) => e.domain === domain) : allSnapshots;
      } else {
        const tagSet = new Set(currentEntryTags);
        filtered = allSnapshots.filter((e) => {
          const ts = tagsFor(e);
          return ts.some((t) => tagSet.has(t));
        });
      }
    } else {
      filtered = domain ? allSnapshots.filter((e) => e.domain === domain) : allSnapshots;
    }
    filtered.sort((a, b) => (b.timestampEpoch ?? 0) - (a.timestampEpoch ?? 0));
    return filtered;
  }, [allEntries, domain, chainScope, currentEntryTags, tagsFor]);

  const currentChainIndex = useMemo(() => {
    if (!chain.length) return -1;
    return chain.findIndex((e) => e.subPath === sub && e.snapshotFilename === filename);
  }, [chain, sub, filename]);

  const navigateChain = useCallback((delta: 1 | -1) => {
    if (!chain.length || currentChainIndex < 0) return;
    const next = (currentChainIndex + delta + chain.length) % chain.length;
    const target = chain[next];
    if (!target || !target.snapshotFilename) return;
    const u = new URL('loom://bundle/loom-render/snapshot/');
    u.searchParams.set('root', target.rootID);
    u.searchParams.set('sub', target.subPath);
    u.searchParams.set('filename', target.snapshotFilename);
    if (target.title) u.searchParams.set('title', target.title);
    if (target.eyebrow) u.searchParams.set('eyebrow', target.eyebrow);
    if (typeof window !== 'undefined') window.location.href = u.toString();
  }, [chain, currentChainIndex]);

  // Action handlers.
  const onOpenOriginal = useCallback(() => {
    if (!sourceURL || typeof window === 'undefined') return;
    window.open(sourceURL, '_blank', 'noopener,noreferrer');
  }, [sourceURL]);

  const onOpenInReader = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.location.href = readerHref;
  }, [readerHref]);

  const onCopyURL = useCallback(() => {
    if (!sourceURL || typeof window === 'undefined') return;
    const finish = () => {
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sourceURL).then(finish).catch(() => {
        // Fallback: textarea trick.
        try {
          const ta = document.createElement('textarea');
          ta.value = sourceURL;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          finish();
        } catch { /* give up silently */ }
      });
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = sourceURL;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        finish();
      } catch { /* give up silently */ }
    }
  }, [sourceURL]);

  const onPrint = useCallback(() => {
    const ifr = iframeRef.current;
    if (!ifr) return;
    try {
      ifr.contentWindow?.focus();
      ifr.contentWindow?.print();
    } catch {
      if (typeof window !== 'undefined') window.print();
    }
  }, []);

  const onToggleFullscreen = useCallback(() => setFullscreen((f) => !f), []);
  const onToggleDistill = useCallback(() => setDistillOpen((d) => !d), []);
  const onToggleAnnotate = useCallback(() => setAnnotateMode((a) => !a), []);
  const onToggleHelp = useCallback(() => setHelpOpen((h) => !h), []);

  const onDismissJsBanner = useCallback(() => {
    setJsBannerDismissed(true);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(`loom.snapshot.jsBanner.${root}/${sub}/${filename}.dismissed`, '1');
    } catch { /* ignore */ }
  }, [root, sub, filename]);

  // Export annotations as JSON (with capture metadata). Filename includes
  // the snapshot filename for traceability.
  const onExportAnnotations = useCallback(() => {
    if (typeof window === 'undefined' || annotations.length === 0) return;
    const exportPayload = {
      schema: 'loom.snapshot.annotations.v1',
      exportedAt: new Date().toISOString(),
      capture: {
        title: titleParam || null,
        eyebrow: eyebrowParam || null,
        domain: domain || null,
        sourceURL: sourceURL || null,
        timestamp: timestamp || null,
        rootID: root,
        subPath: sub,
        snapshotFilename: filename,
      },
      annotations: annotations
        .slice()
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .map((a, i) => ({
          index: i + 1,
          id: a.id,
          xPercent: a.x,
          yPercent: a.y,
          note: a.note,
          createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
        })),
    };
    const json = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stem = (filename || 'snapshot').replace(/\.html?$/i, '');
    a.download = `${stem}.annotations.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [annotations, titleParam, eyebrowParam, domain, sourceURL, timestamp, root, sub, filename]);

  // Inject Captured-by-Loom banner once iframe loads.
  const onIframeLoad = useCallback(() => {
    const ifr = iframeRef.current;
    if (!ifr) return;
    try {
      const currentIframe = ifr;
      const doc = ifr.contentDocument;
      if (!doc || !doc.body) return;

      if (targetEmbedMode) {
        setSnapshotHeight(null);
        return;
      }

      function measureSnapshotFrameHeight() {
        const snapshotDocument = currentIframe.contentDocument;
        if (!snapshotDocument || !snapshotDocument.documentElement) return;
        const nextHeight = Math.ceil(Math.max(
          snapshotDocument.documentElement.scrollHeight || 0,
          snapshotDocument.documentElement.offsetHeight || 0,
          snapshotDocument.body?.scrollHeight || 0,
          snapshotDocument.body?.offsetHeight || 0,
          window.innerHeight - 80,
        ));
        if (Number.isFinite(nextHeight) && nextHeight > 0) {
          setSnapshotHeight(nextHeight);
        }
      }

      // Agent A snapshot+JS mode signals preserved scripts via
      // data-preserve-js="true" on documentElement or body. If found,
      // raise the warning banner unless the user dismissed it earlier.
      const preserveAttr =
        doc.documentElement?.getAttribute('data-preserve-js') === 'true' ||
        doc.body.getAttribute('data-preserve-js') === 'true';
      if (preserveAttr) {
        setJsPreserved(true);
      }
      // Avoid double-injection on re-load.
      if (!doc.getElementById('loom-snapshot-banner')) {
        const banner = doc.createElement('div');
        banner.id = 'loom-snapshot-banner';
        const dateLabel = timestamp || '';
        banner.innerHTML = `
          <div class="loom-snapshot-banner-inner">
            <span class="loom-snapshot-banner-mark">Captured by Loom</span>
            ${dateLabel ? `<span class="loom-snapshot-banner-sep">·</span><span class="loom-snapshot-banner-date">${dateLabel}</span>` : ''}
            <span class="loom-snapshot-banner-sep">·</span>
            <span class="loom-snapshot-banner-note" title="This is a frozen snapshot. Original may have changed since.">frozen snapshot</span>
          </div>
        `;
        const style = doc.createElement('style');
        style.textContent = `
        #loom-snapshot-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 2147483647;
          padding: var(--space-xs) 0;
          /* Solid bg — no backdrop-filter on fixed elements (constitutional rule 1). */
          background: var(--paper-up);
          border-bottom: 0.5px solid var(--hair);
          font-family: var(--font-serif);
          font-size: var(--font-eyebrow);
          color: var(--ink-2);
          text-align: center;
          letter-spacing: 0.16em;
          font-variant: small-caps;
          opacity: 0;
          transition: opacity var(--motion-fast);
          pointer-events: none;
        }
        #loom-snapshot-banner:hover,
        #loom-snapshot-banner.show {
          opacity: 1;
          pointer-events: auto;
        }
        #loom-snapshot-banner .loom-snapshot-banner-inner {
          display: inline-flex;
          gap: var(--space-sm);
          align-items: baseline;
        }
        #loom-snapshot-banner .loom-snapshot-banner-mark {
          color: var(--thread);
          font-weight: 500;
          font-style: italic;
        }
        #loom-snapshot-banner .loom-snapshot-banner-sep {
          color: var(--ink-3);
        }
        #loom-snapshot-banner .loom-snapshot-banner-note {
          font-style: italic;
        }
        /* Hover-zone trigger — top 24px of the document. */
        html::before {
          content: '';
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 24px;
          z-index: 2147483646;
          pointer-events: auto;
        }
        html:hover #loom-snapshot-banner {
          opacity: 1;
        }
      `;
        doc.head.appendChild(style);
        doc.body.prepend(banner);
      }

      iframeResizeObserverRef.current?.disconnect();
      iframeResizeObserverRef.current = null;
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(measureSnapshotFrameHeight);
        observer.observe(doc.documentElement);
        observer.observe(doc.body);
        iframeResizeObserverRef.current = observer;
      }
      measureSnapshotFrameHeight();
      requestAnimationFrame(measureSnapshotFrameHeight);
      window.setTimeout(measureSnapshotFrameHeight, 120);
      window.setTimeout(measureSnapshotFrameHeight, 600);
    } catch {
      // Cross-origin or sandboxing may forbid contentDocument access in
      // some browsers — non-fatal. We still rendered the snapshot.
    }
  }, [timestamp, targetEmbedMode]);

  // Keyboard shortcuts.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: KeyboardEvent) => {
      // Ignore when focus is in form fields.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (e.key === 'Escape') {
        if (helpOpen) {
          setHelpOpen(false);
          e.preventDefault();
        } else if (fullscreen) {
          setFullscreen(false);
          e.preventDefault();
        } else if (annotateMode) {
          setAnnotateMode(false);
          e.preventDefault();
        } else if (distillOpen) {
          setDistillOpen(false);
          e.preventDefault();
        } else if (chainScopeOpen) {
          setChainScopeOpen(false);
          e.preventDefault();
        } else {
          window.location.href = backHref;
          e.preventDefault();
        }
        return;
      }
      // `?` opens help (Shift+/ on US keyboards). No modifier guard so it
      // fires from `e.key === '?'` even with Shift.
      if (e.key === '?') {
        setHelpOpen((h) => !h);
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 'f': setFullscreen((f) => !f); e.preventDefault(); break;
        case 'o':
          if (sourceURL) { onOpenOriginal(); e.preventDefault(); }
          break;
      }
      if (e.key === 'ArrowLeft') { navigateChain(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { navigateChain(1); e.preventDefault(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fullscreen, annotateMode, distillOpen, helpOpen, chainScopeOpen, sourceURL, onOpenOriginal, navigateChain]);

  // Annotation pin click on overlay.
  const onAnnotateClick = useCallback((evt: React.MouseEvent<HTMLDivElement>) => {
    if (!annotateMode) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * 100;
    const y = ((evt.clientY - rect.top) / rect.height) * 100;
    const id = `pin-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    setAnnotations((prev) => [...prev, { x, y, note: '', id, createdAt: Date.now() }]);
  }, [annotateMode]);

  const updateAnnotation = useCallback((id: string, note: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, note } : a)));
  }, []);
  const deleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const kb = payload?.byteLen ? Math.max(1, Math.round(payload.byteLen / 1024)) : 0;

  // Render: error / loading / main.
  if (fetchError && embedMode) {
    return (
      <div className="loom-snapshot-embed-shell error">
        <Style />
        <Body tone="secondary" className="embed-error" as="div">
          Snapshot unavailable · {fetchError}
        </Body>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="loom-snapshot-shell error-shell">
        <Style />
        <div className="topbar minimal">
          <a className="back" href={backHref}>‹ Captures</a>
        </div>
        <Surface tone="card" radius="sm" padded="lg" className="error-panel">
          <Stack gap="sm">
            <Display level="2" as="h1">Couldn&apos;t load snapshot</Display>
            <Body tone="secondary">
              <span className="error-filename">{filename || '—'}</span>
              {' · '}
              <span className="error-msg">{fetchError}</span>
            </Body>
            <Body tone="secondary" className="error-back">
              <a href={backHref}>← Back to Captures</a>
            </Body>
          </Stack>
        </Surface>
      </div>
    );
  }

  if (embedMode && !payload) {
    return (
      <div className="loom-snapshot-embed-shell loading">
        <Style />
        <SnapshotSkeleton />
      </div>
    );
  }

  if (embedMode && payload) {
    return (
      <div className={`loom-snapshot-embed-shell${targetEmbedMode ? ' target-mode' : ''}`}>
        <Style />
        <iframe
          ref={iframeRef}
          className="snapshot"
          title={payload.filename || filename}
          srcDoc={snapshotSrcDoc}
          sandbox={snapshotSandbox}
          onLoad={onIframeLoad}
        />
      </div>
    );
  }

  return (
    <div className={`loom-snapshot-shell${fullscreen ? ' fullscreen' : ''}`}>
      <Style />

      {/* Toolbar — hidden in fullscreen */}
      {!fullscreen && (
        <div className="topbar">
          <div className="topbar-left">
            <a className="back" href={backHref} title="Back to captures (Esc)">‹ Captures</a>
            {chain.length > 1 && currentChainIndex >= 0 && (
              <span className="chain-nav" title={`${currentChainIndex + 1} of ${chain.length} · scope: ${chainScope}`}>
                <button className="chain-btn" onClick={() => navigateChain(-1)} title="Previous capture (←)">‹ prev</button>
                <span className="chain-count">{currentChainIndex + 1} of {chain.length}</span>
                <button className="chain-btn" onClick={() => navigateChain(1)} title="Next capture (→)">next ›</button>
                <ChainScopeMenu
                  scope={chainScope}
                  open={chainScopeOpen}
                  setOpen={setChainScopeOpen}
                  onChange={(s) => { setChainScope(s); setChainScopeOpen(false); }}
                  domainAvailable={!!domain}
                  tagAvailable={currentEntryTags.length > 0}
                />
              </span>
            )}
          </div>

          <div className="topbar-center">
            <div className="title-line" title={payload?.filename || filename}>
              {titleParam || payload?.filename || filename || 'Snapshot'}
            </div>
            <div className="eyebrow-line">
              <span>snapshot</span>
              {domain && <><span className="dot">·</span><span>{domain}</span></>}
              {timestamp && <><span className="dot">·</span><span className="ts">{timestamp}</span></>}
              {kb > 0 && <><span className="dot">·</span><span className="kb">{kb.toLocaleString()} KB</span></>}
            </div>
          </div>

          <div className="topbar-right">
            <button
              className="action"
              onClick={onOpenOriginal}
              disabled={!sourceURL}
              title={sourceURL ? `Open original: ${sourceURL} (o)` : 'No source URL available'}
            >
              <span className="action-glyph">↗</span>
              <span className="action-label">Original</span>
            </button>
            <button
              className="action"
              onClick={onOpenInReader}
              title="Open in Loom reader view"
            >
              <span className="action-glyph">⌥</span>
              <span className="action-label">Reader</span>
            </button>
            <button
              className={`action${annotateMode ? ' active' : ''}`}
              onClick={onToggleAnnotate}
              title="Annotate snapshot (drop pins)"
            >
              <span className="action-glyph">✎</span>
              <span className="action-label">Annotate{annotations.length ? ` · ${annotations.length}` : ''}</span>
            </button>
            {annotations.length > 0 && (
              <button
                className="action"
                onClick={onExportAnnotations}
                title="Download annotations as JSON"
              >
                <span className="action-glyph">⇣</span>
                <span className="action-label">Export</span>
              </button>
            )}
            <button
              className="action"
              onClick={onCopyURL}
              disabled={!sourceURL}
              title={sourceURL ? 'Copy source URL' : 'No source URL'}
            >
              <span className="action-glyph">{copyFlash ? '✓' : '⎘'}</span>
              <span className="action-label">{copyFlash ? 'Copied!' : 'Copy URL'}</span>
            </button>
            <button
              className={`action${distillOpen ? ' active' : ''}`}
              onClick={onToggleDistill}
              title="Distill with AI (coming soon)"
            >
              <span className="action-glyph">✦</span>
              <span className="action-label">Distill</span>
            </button>
            <button
              className="action"
              onClick={onPrint}
              title="Print snapshot to PDF"
            >
              <span className="action-glyph">⎙</span>
              <span className="action-label">Print</span>
            </button>
            <button
              className="action"
              onClick={onToggleFullscreen}
              title="Fullscreen (f)"
            >
              <span className="action-glyph">⛶</span>
              <span className="action-label">Fullscreen</span>
            </button>
            <button
              className={`action${helpOpen ? ' active' : ''}`}
              onClick={onToggleHelp}
              title="Keyboard shortcuts (?)"
              aria-label="Keyboard shortcuts"
            >
              <span className="action-glyph">?</span>
            </button>
          </div>
        </div>
      )}

      {/* Fullscreen exit hint */}
      {fullscreen && (
        <button className="fullscreen-exit" onClick={onToggleFullscreen} title="Exit fullscreen (Esc / f)">
          ⤢ Exit fullscreen
        </button>
      )}

      {/* Body */}
      <div className="body">
        {/* Snapshot pane */}
        <div className="pane snapshot-pane">
          {!payload ? (
            <SnapshotSkeleton />
          ) : (
            <div className={`snapshot-frame-wrap ${fullscreen ? 'constrained' : 'auto-height'}`}>
              {jsPreserved && !jsBannerDismissed && (
                <div className="js-warning-banner" role="status">
                  <span className="js-warning-icon" aria-hidden>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2" />
                      <line x1="8" y1="4.5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                      <circle cx="8" cy="11.5" r="0.8" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="js-warning-text">
                    <span className="js-warning-title">JS preserved</span>
                    <span className="js-warning-detail"> · this snapshot may execute scripts in a sandboxed iframe</span>
                  </span>
                  <button
                    type="button"
                    className="js-warning-dismiss"
                    onClick={onDismissJsBanner}
                    aria-label="Dismiss"
                    title="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              )}
              <iframe
                ref={iframeRef}
                className="snapshot"
                title={payload.filename || filename}
                srcDoc={snapshotSrcDoc}
                sandbox={snapshotSandbox}
                onLoad={onIframeLoad}
                style={!fullscreen && snapshotHeight ? { height: `${snapshotHeight}px` } : undefined}
              />
              {annotateMode && (
                <div
                  className="annotate-overlay"
                  onClick={onAnnotateClick}
                  title="Click to drop a pin · Esc to exit"
                >
                  {annotations.map((a, i) => (
                    <Pin
                      key={a.id}
                      index={i + 1}
                      x={a.x}
                      y={a.y}
                      note={a.note}
                      onChange={(note) => updateAnnotation(a.id, note)}
                      onDelete={() => deleteAnnotation(a.id)}
                    />
                  ))}
                </div>
              )}
              {!annotateMode && annotations.length > 0 && (
                <div className="annotate-overlay readonly">
                  {annotations.map((a, i) => (
                    <Pin
                      key={a.id}
                      index={i + 1}
                      x={a.x}
                      y={a.y}
                      note={a.note}
                      readOnly
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Keyboard help overlay */}
        {helpOpen && (
          <KeyboardHelpOverlay onDismiss={() => setHelpOpen(false)} />
        )}

        {/* Distill sidebar */}
        {distillOpen && (
          <aside className="distill-panel">
            <div className="distill-header">
              <Display level="3" as="div" italic className="distill-title">Distill</Display>
              <button className="distill-close" onClick={onToggleDistill}>×</button>
            </div>
            <div className="distill-body">
              <Stack gap="md">
                <Eyebrow level="section">AI summarization</Eyebrow>
                <Display level="2" as="div" italic>Coming soon.</Display>
                <Body tone="secondary">
                  In the next iteration, this panel will summarize the snapshot&apos;s
                  content into Loom&apos;s own structured prose — extracting claims,
                  evidence, and links that you can pull into your wiki.
                </Body>
              </Stack>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Annotation pin
// ─────────────────────────────────────────────────────────────────────────────

function Pin({
  index,
  x,
  y,
  note,
  onChange,
  onDelete,
  readOnly = false,
}: {
  index: number;
  x: number;
  y: number;
  note: string;
  onChange?: (note: string) => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(!note && !readOnly);
  return (
    <div
      className="pin-wrap"
      style={{ left: `${x}%`, top: `${y}%` }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="pin"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        title={note || 'No note yet'}
      >
        {index}
      </button>
      {open && (
        <div className="pin-popover" onClick={(e) => e.stopPropagation()}>
          {readOnly ? (
            <div className="pin-note-readonly">{note || <em>No note</em>}</div>
          ) : (
            <textarea
              className="pin-textarea"
              autoFocus
              value={note}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder="Add a note…"
            />
          )}
          {!readOnly && (
            <div className="pin-actions">
              <button className="pin-action delete" onClick={onDelete}>Delete</button>
              <button className="pin-action" onClick={() => setOpen(false)}>Done</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Chain scope menu — dropdown to switch between domain / date / tag scopes
// ─────────────────────────────────────────────────────────────────────────────

function ChainScopeMenu({
  scope,
  open,
  setOpen,
  onChange,
  domainAvailable,
  tagAvailable,
}: {
  scope: 'domain' | 'date' | 'tag';
  open: boolean;
  setOpen: (v: boolean) => void;
  onChange: (s: 'domain' | 'date' | 'tag') => void;
  domainAvailable: boolean;
  tagAvailable: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, setOpen]);
  const labels: Record<typeof scope, string> = {
    domain: 'by domain',
    date: 'by date',
    tag: 'by tag',
  };
  return (
    <div className="chain-scope-menu" ref={ref}>
      <button
        className="chain-btn chain-scope-trigger"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change navigation scope"
      >
        {labels[scope]} ▾
      </button>
      {open && (
        <div className="chain-scope-pop" role="menu">
          <button
            className={`chain-scope-item${scope === 'domain' ? ' active' : ''}`}
            onClick={() => onChange('domain')}
            disabled={!domainAvailable}
            role="menuitem"
            title={domainAvailable ? 'Navigate same-domain captures' : 'No domain available'}
          >
            <span>By domain</span>
            <span className="chain-scope-hint">same site</span>
          </button>
          <button
            className={`chain-scope-item${scope === 'date' ? ' active' : ''}`}
            onClick={() => onChange('date')}
            role="menuitem"
            title="Navigate all snapshots by date"
          >
            <span>By date</span>
            <span className="chain-scope-hint">all snapshots</span>
          </button>
          <button
            className={`chain-scope-item${scope === 'tag' ? ' active' : ''}`}
            onClick={() => onChange('tag')}
            disabled={!tagAvailable}
            role="menuitem"
            title={tagAvailable ? 'Navigate captures sharing a tag' : 'This capture has no tags'}
          >
            <span>By tag</span>
            <span className="chain-scope-hint">{tagAvailable ? 'shared tags' : 'no tags'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard help overlay
// ─────────────────────────────────────────────────────────────────────────────

function KeyboardHelpOverlay({ onDismiss }: { onDismiss: () => void }) {
  const rows: { keys: string[]; label: string; hidden?: boolean }[] = [
    { keys: ['?'], label: 'Show / hide this help' },
    { keys: ['Esc'], label: 'Close overlay · Exit fullscreen · Back to captures' },
    { keys: ['F'], label: 'Toggle fullscreen' },
    { keys: ['O'], label: 'Open original URL in new window' },
    { keys: ['←', '→'], label: 'Previous / next capture in current chain' },
  ];
  return (
    <div className="kbd-help-backdrop" onClick={onDismiss} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="kbd-help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="kbd-help-header">
          <Eyebrow level="section" className="kbd-help-eyebrow">Help</Eyebrow>
          <Display level="3" as="div" italic className="kbd-help-title">Keyboard shortcuts</Display>
          <button className="kbd-help-close" onClick={onDismiss} aria-label="Dismiss (Esc)">×</button>
        </div>
        <div className="kbd-help-list">
          {rows.filter((r) => !r.hidden).map((r, i) => (
            <div key={i} className="kbd-help-row">
              <span className="kbd-help-keys">
                {r.keys.map((k, j) => (
                  <span key={j} className="kbd-key">{k}</span>
                ))}
              </span>
              <span className="kbd-help-label">{r.label}</span>
            </div>
          ))}
        </div>
        <div className="kbd-help-footer">
          <span>Press</span>
          <span className="kbd-key">Esc</span>
          <span>or click outside to dismiss</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading skeleton
// ─────────────────────────────────────────────────────────────────────────────

function SnapshotSkeleton() {
  return (
    <div className="snapshot-skeleton">
      <div className="skeleton-shimmer" />
      <Body tone="muted" className="skeleton-text" as="div">Loading snapshot…</Body>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles — single styled-jsx block, paper-tone, hairlines, Vellum tokens
// ─────────────────────────────────────────────────────────────────────────────

function Style() {
  return (
    <style jsx global>{`
      .loom-snapshot-shell {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        background: var(--paper-deep);
        font-family: var(--font-serif);
        color: var(--ink-1);
      }

      /* ── TOPBAR ──────────────────────────────────────────── */
      .topbar {
        position: sticky;
        top: 0;
        z-index: 30;
        display: grid;
        grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr) minmax(220px, auto);
        align-items: center;
        gap: var(--space-md);
        padding: var(--space-sm) var(--space-md);
        border-bottom: 0.5px solid var(--hair);
        /* Solid bg — no backdrop-filter on sticky elements (constitutional rule 1). */
        background: var(--paper-up);
      }
      .topbar.minimal {
        grid-template-columns: 1fr;
      }

      .topbar-left {
        display: flex;
        align-items: center;
        gap: var(--space-md);
      }
      .back {
        color: var(--thread);
        text-decoration: none;
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        white-space: nowrap;
      }
      .back:hover {
        text-decoration: underline;
        text-underline-offset: 0.16em;
      }

      .chain-nav {
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
        padding-left: var(--space-sm);
        border-left: 0.5px solid var(--hair);
        font-family: var(--font-serif);
        font-size: var(--font-caption);
      }
      .chain-btn {
        background: transparent;
        border: 0;
        padding: var(--space-xs) var(--space-xs);
        color: var(--ink-2);
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        cursor: pointer;
        border-radius: var(--radius-sm);
        transition: color var(--motion-fast), background var(--motion-fast);
      }
      .chain-btn:hover {
        color: var(--thread);
        background: color-mix(in srgb, var(--thread) 8%, transparent);
      }
      .chain-count {
        color: var(--ink-3);
        font-style: italic;
        font-feature-settings: "onum" 1, "tnum" 1;
        font-size: var(--font-eyebrow);
      }

      .topbar-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: var(--space-xs);
        min-width: 0;
      }
      .title-line {
        font-family: var(--font-serif);
        font-weight: 500;
        font-size: var(--font-body);
        color: var(--ink-1);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
        line-height: 1.2;
      }
      .eyebrow-line {
        font-family: var(--font-serif);
        font-size: var(--font-eyebrow);
        letter-spacing: 0.06em;
        color: var(--ink-3);
        font-style: italic;
        font-feature-settings: "onum" 1, "pnum" 1;
        display: inline-flex;
        gap: var(--space-xs);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }
      .eyebrow-line .dot {
        opacity: 0.6;
      }
      .eyebrow-line .ts,
      .eyebrow-line .kb {
        font-feature-settings: "onum" 1, "tnum" 1;
      }

      .topbar-right {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        justify-content: flex-end;
        flex-wrap: nowrap;
      }
      .action {
        background: transparent;
        border: 0;
        padding: var(--space-xs) var(--space-sm);
        cursor: pointer;
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        color: var(--ink-2);
        border-radius: var(--radius-sm);
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
        transition: color var(--motion-fast), background var(--motion-fast);
        white-space: nowrap;
      }
      .action:hover:not(:disabled) {
        color: var(--thread);
        background: color-mix(in srgb, var(--thread) 8%, transparent);
      }
      .action.active {
        color: var(--thread);
        background: color-mix(in srgb, var(--thread) 10%, transparent);
      }
      .action:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .action-glyph {
        font-size: var(--font-body);
        opacity: 0.85;
      }
      .action-label {
        font-feature-settings: "onum" 1, "pnum" 1;
      }
      /* Hide labels under 1180px so the toolbar stays one row. */
      @media (max-width: 1180px) {
        .action-label {
          display: none;
        }
      }
      @media (max-width: 720px) {
        .topbar {
          grid-template-columns: 1fr auto;
        }
        .topbar-center {
          display: none;
        }
      }

      /* ── BODY ─────────────────────────────────────────────── */
      .body {
        flex: 1;
        display: flex;
        position: relative;
        padding: var(--space-xs) var(--space-xs) var(--space-sm);
        gap: 0;
        min-height: 0;
      }
      .body:not(.sbs) {
        display: block;
        flex: 0 0 auto;
        min-height: auto;
        overflow: visible;
      }
      .loom-snapshot-shell.fullscreen .body {
        display: flex;
        flex: 1;
        min-height: 0;
      }
      .body.sbs {
        gap: 0;
      }
      .pane {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
      }
      .snapshot-pane {
        flex: 1 1 auto;
      }
      .body.sbs .snapshot-pane {
        flex: 0 0 auto;
      }
      .snapshot-frame-wrap {
        position: relative;
        width: 100%;
        min-height: 0;
      }
      .loom-snapshot-embed-shell {
        width: 100%;
        height: 100vh;
        min-height: 22rem;
        margin: 0;
        padding: 0;
        background: var(--paper);
        overflow: hidden;
      }
      .loom-snapshot-embed-shell iframe.snapshot {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 22rem;
        border: 0;
        background: white;
      }
      .loom-snapshot-embed-shell.target-mode {
        height: 100%;
        min-height: 18rem;
        background: #000;
      }
      .loom-snapshot-embed-shell.target-mode iframe.snapshot {
        min-height: 18rem;
        background: #000;
      }
      .loom-snapshot-embed-shell.error,
      .loom-snapshot-embed-shell.loading {
        display: grid;
        place-items: center;
      }
      .loom-snapshot-embed-shell .embed-error {
        padding: var(--space-md);
      }
      .snapshot-frame-wrap.auto-height {
        display: block;
        flex: 0 0 auto;
        overflow: visible;
      }
      .snapshot-frame-wrap.constrained {
        flex: 1;
        display: flex;
        min-height: 0;
        overflow: hidden;
      }
      .snapshot-frame-wrap.auto-height iframe.snapshot {
        display: block;
        width: 100%;
        min-height: calc(100vh - 5rem);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        background: white;
      }
      .snapshot-frame-wrap.constrained iframe.snapshot {
        flex: 1;
        width: 100%;
        height: 100%;
        min-height: calc(100vh - 5rem);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        background: white;
      }
      .loom-snapshot-shell.fullscreen iframe.snapshot {
        min-height: 100vh;
        border-radius: 0;
        border: 0;
      }
      .loom-snapshot-shell.fullscreen .body {
        padding: 0;
      }

      /* ── FULLSCREEN EXIT BUTTON ──────────────────────────── */
      .fullscreen-exit {
        position: fixed;
        top: var(--space-sm);
        right: var(--space-sm);
        z-index: 40;
        /* Solid bg — no backdrop-filter on fixed elements (constitutional rule 1). */
        background: var(--paper-up);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        padding: var(--space-xs) var(--space-sm);
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        color: var(--ink-2);
        cursor: pointer;
        opacity: 0.4;
        transition: opacity var(--motion-normal);
      }
      .fullscreen-exit:hover {
        opacity: 1;
        color: var(--thread);
      }

      /* ── SPLIT DIVIDER ───────────────────────────────────── */
      .split-divider {
        flex: 0 0 0.5rem;
        cursor: col-resize;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
      }
      .split-divider:hover .grip,
      .split-divider:active .grip {
        background: var(--thread-muted);
      }
      .split-divider .grip {
        width: 1.5px;
        height: 60%;
        background: var(--hair);
        border-radius: 1px;
        transition: background var(--motion-fast);
      }

      /* ── READER PANE ─────────────────────────────────────── */
      .reader-pane {
        flex: 0 0 auto;
        background: var(--paper);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        overflow: hidden;
        display: flex;
      }
      .reader-pane-inner {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-lg) var(--space-lg) var(--space-xl);
        font-family: var(--font-serif);
        color: var(--ink-1);
      }
      .reader-pane-inner.loading,
      .reader-pane-inner.error {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
      }
      .reader-eyebrow {
        font-family: var(--font-serif);
        font-size: var(--font-eyebrow);
        font-weight: 500;
        letter-spacing: 0.16em;
        text-transform: lowercase;
        font-variant: small-caps;
        color: var(--thread);
        margin: 0 0 var(--space-sm);
      }
      .reader-title {
        font-family: var(--font-display);
        font-weight: 500;
        font-size: var(--font-display-2);
        line-height: 1.22;
        margin: 0 0 var(--space-sm);
      }
      .reader-meta {
        font-size: var(--font-caption);
        color: var(--ink-3);
        font-style: italic;
        margin-bottom: var(--space-md);
      }
      .reader-body {
        font-size: var(--font-body);
        line-height: 1.62;
        font-feature-settings: "onum" 1, "pnum" 1;
      }
      .reader-body p { margin: var(--space-sm) 0; }
      .reader-body h1, .reader-body h2, .reader-body h3 {
        font-family: var(--font-serif);
        font-weight: 500;
        line-height: 1.3;
      }
      .reader-body h2 {
        font-size: var(--font-display-3);
        font-style: italic;
        margin-top: var(--space-lg);
        margin-bottom: var(--space-sm);
        padding-bottom: var(--space-xs);
        border-bottom: 0.5px solid var(--hair);
      }
      .reader-body h3 {
        font-size: var(--font-body);
        font-style: italic;
        margin-top: var(--space-md);
      }
      .reader-body a {
        color: var(--thread);
        text-decoration: underline;
        text-decoration-thickness: 0.5px;
        text-underline-offset: 0.18em;
      }
      .reader-body code {
        font-family: var(--font-mono);
        font-size: var(--font-mono);
        background: var(--paper-card);
        padding: 0.08em 0.32em;
        border-radius: var(--radius-sm);
      }
      .reader-body pre {
        font-family: var(--font-mono);
        background: var(--paper-card);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        padding: var(--space-md);
        overflow-x: auto;
        font-size: var(--font-mono);
      }
      .reader-body pre code { background: transparent; padding: 0; }
      .reader-body img, .reader-body video {
        max-width: 100%;
        height: auto;
        display: block;
        margin: var(--space-md) auto;
        border-radius: var(--radius-sm);
        border: 0.5px solid var(--hair);
      }
      .reader-body .loom-embed-card.video {
        display: block;
        max-width: min(100%, 48rem);
        margin: var(--space-md) auto;
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        overflow: hidden;
        background: color-mix(in srgb, var(--paper-card) 75%, transparent);
      }
      .reader-body .loom-provider-embed-frame {
        position: relative;
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #0c0a09;
      }
      .reader-body iframe.loom-provider-embed {
        width: 100%;
        height: 100%;
        aspect-ratio: auto;
        margin: 0;
        border: 0;
        border-radius: 0;
        background: #0c0a09;
      }
      .reader-body .loom-embed-card-link {
        display: block;
        color: inherit;
        text-decoration: none;
      }
      .reader-body .loom-embed-thumb-frame {
        position: relative;
        display: block;
        aspect-ratio: 16 / 9;
        background: #0c0a09;
      }
      .reader-body .loom-embed-thumb {
        width: 100%;
        height: 100%;
        object-fit: cover;
        margin: 0;
        border: 0;
        border-radius: 0;
      }
      .reader-body .loom-embed-thumb.placeholder {
        display: grid;
        place-items: center;
        color: var(--thread);
        font-family: var(--font-serif);
        font-size: var(--font-display-3);
      }
      .reader-body .loom-embed-play {
        position: absolute;
        right: 0.65rem;
        bottom: 0.65rem;
        display: grid;
        place-items: center;
        width: 2rem;
        height: 2rem;
        border-radius: 999px;
        background: color-mix(in srgb, #000 45%, transparent);
        color: white;
      }
      .reader-body .loom-embed-copy {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.25rem;
        padding: var(--space-sm);
      }
      .reader-body .loom-embed-provider {
        font-size: var(--font-eyebrow);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--ink-3);
      }
      .reader-body .loom-embed-title {
        color: var(--ink-1);
      }
      .reader-body .loom-embed-action {
        color: var(--thread);
        font-style: italic;
        font-size: var(--font-caption);
        width: fit-content;
      }
      @media (max-width: 760px) {
        .reader-body .loom-embed-card-link {
          grid-template-columns: 1fr;
        }
      }
      .reader-body blockquote {
        border-left: 1px solid var(--thread);
        padding-left: var(--space-md);
        font-style: italic;
        color: var(--ink-2);
        margin: var(--space-md) 0;
      }
      .reader-body ul, .reader-body ol {
        padding-left: var(--space-lg);
        margin: var(--space-sm) 0;
      }
      .reader-loading,
      .reader-error {
        font-style: italic;
        color: var(--ink-3);
        font-size: var(--font-caption);
      }

      /* ── ANNOTATE OVERLAY ────────────────────────────────── */
      .annotate-overlay {
        position: absolute;
        inset: 0;
        z-index: 5;
        cursor: crosshair;
        background: color-mix(in srgb, var(--thread) 4%, transparent);
        pointer-events: auto;
      }
      .annotate-overlay.readonly {
        background: transparent;
        cursor: default;
        pointer-events: none;
      }
      .annotate-overlay.readonly .pin-wrap {
        pointer-events: auto;
      }
      .pin-wrap {
        position: absolute;
        transform: translate(-50%, -50%);
        z-index: 6;
      }
      .pin {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: var(--thread);
        color: var(--paper-deep);
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        font-weight: 600;
        font-feature-settings: "onum" 1, "tnum" 1;
        border: 1.5px solid var(--paper-up);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--shadow-sm);
        /* Hover affects color only — no transform/scale (constitutional rule 3). */
        transition: background var(--motion-fast), color var(--motion-fast), border-color var(--motion-fast);
      }
      .pin:hover {
        background: color-mix(in srgb, var(--thread) 80%, white);
        color: var(--paper-deep);
        border-color: var(--thread);
      }
      .pin-popover {
        position: absolute;
        top: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: var(--paper-card);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        padding: var(--space-sm);
        min-width: 220px;
        box-shadow: var(--shadow-md);
        z-index: 7;
      }
      .pin-textarea {
        width: 100%;
        min-height: 70px;
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        padding: var(--space-xs);
        background: var(--paper);
        color: var(--ink-1);
        resize: vertical;
      }
      .pin-actions {
        display: flex;
        justify-content: space-between;
        margin-top: var(--space-xs);
      }
      .pin-action {
        background: transparent;
        border: 0;
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        color: var(--ink-2);
        cursor: pointer;
        padding: var(--space-xs) var(--space-xs);
        border-radius: var(--radius-sm);
      }
      .pin-action:hover { color: var(--thread); }
      /* Delete action uses the canonical destructive token (added 2026-04-27). */
      .pin-action.delete:hover { color: var(--alert); }
      .pin-note-readonly {
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        color: var(--ink-1);
      }

      /* ── DISTILL PANEL ───────────────────────────────────── */
      .distill-panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(380px, 92vw);
        z-index: 50;
        /* Solid bg — no backdrop-filter on fixed elements (constitutional rule 1). */
        background: var(--paper-card);
        border-left: 0.5px solid var(--hair);
        display: flex;
        flex-direction: column;
        animation: distill-slide-in var(--motion-normal);
      }
      @keyframes distill-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .distill-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-sm) var(--space-md);
        border-bottom: 0.5px solid var(--hair);
      }
      .distill-title {
        /* Display primitive provides typography; class kept for layout hooks. */
      }
      .distill-close {
        background: transparent;
        border: 0;
        cursor: pointer;
        font-size: var(--font-display-3);
        color: var(--ink-3);
        line-height: 1;
        padding: var(--space-xs) var(--space-xs);
        border-radius: var(--radius-sm);
      }
      .distill-close:hover { color: var(--thread); }
      .distill-body {
        padding: var(--space-md) var(--space-md);
        flex: 1;
        overflow-y: auto;
        font-family: var(--font-serif);
      }

      /* ── SKELETON ────────────────────────────────────────── */
      .snapshot-skeleton {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--space-md);
        background: var(--paper);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        min-height: calc(100vh - 5rem);
        position: relative;
        overflow: hidden;
      }
      .skeleton-shimmer {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--paper-up) 60%, transparent) 50%,
          transparent 100%
        );
        animation: shimmer 1.6s infinite;
      }
      @keyframes shimmer {
        from { transform: translateX(-100%); }
        to { transform: translateX(100%); }
      }
      .skeleton-text {
        position: relative;
        z-index: 1;
        font-style: italic;
      }

      /* ── JS PRESERVED WARNING ────────────────────────────── */
      .js-warning-banner {
        position: absolute;
        top: var(--space-xs);
        left: var(--space-xs);
        right: var(--space-xs);
        z-index: 4;
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
        padding: var(--space-xs) var(--space-sm);
        background: color-mix(in srgb, var(--thread) 18%, var(--paper-up));
        border: 0.5px solid var(--thread-muted);
        border-radius: var(--radius-sm);
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        color: var(--ink-1);
        box-shadow: var(--shadow-sm);
        animation: js-warning-fade-in var(--motion-normal);
      }
      @keyframes js-warning-fade-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .js-warning-icon {
        color: var(--thread);
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
      }
      .js-warning-text {
        flex: 1;
        line-height: 1.35;
      }
      .js-warning-title {
        font-weight: 500;
        font-style: italic;
        color: var(--thread);
      }
      .js-warning-detail {
        color: var(--ink-2);
      }
      .js-warning-dismiss {
        background: transparent;
        border: 0;
        color: var(--ink-3);
        cursor: pointer;
        font-size: var(--font-body);
        line-height: 1;
        padding: var(--space-xs) var(--space-xs);
        border-radius: var(--radius-sm);
        transition: color var(--motion-fast), background var(--motion-fast);
        flex-shrink: 0;
      }
      .js-warning-dismiss:hover {
        color: var(--thread);
        background: color-mix(in srgb, var(--thread) 8%, transparent);
      }

      /* ── CHAIN SCOPE MENU ────────────────────────────────── */
      .chain-scope-menu {
        position: relative;
        margin-left: var(--space-xs);
      }
      .chain-scope-trigger {
        font-style: italic;
        color: var(--ink-3);
        font-size: var(--font-eyebrow);
      }
      .chain-scope-pop {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        z-index: 40;
        min-width: 11rem;
        /* Solid bg — no backdrop-filter on scroll-aware overlay popovers
           (the parent toolbar is sticky; constitutional rule 1). */
        background: var(--paper-card);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-sm);
        padding: var(--space-xs);
        box-shadow: var(--shadow-md);
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .chain-scope-item {
        display: flex;
        justify-content: space-between;
        gap: var(--space-sm);
        align-items: baseline;
        padding: var(--space-xs) var(--space-sm);
        background: transparent;
        border: 0;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        color: var(--ink-1);
        text-align: left;
        transition: background var(--motion-fast), color var(--motion-fast);
      }
      .chain-scope-item:hover:not(:disabled) {
        background: color-mix(in srgb, var(--thread) 10%, transparent);
        color: var(--thread);
      }
      .chain-scope-item.active {
        color: var(--thread);
        background: color-mix(in srgb, var(--thread) 6%, transparent);
      }
      .chain-scope-item:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .chain-scope-hint {
        font-size: var(--font-eyebrow);
        font-style: italic;
        color: var(--ink-3);
      }

      /* ── KEYBOARD HELP OVERLAY ───────────────────────────── */
      .kbd-help-backdrop {
        position: fixed;
        inset: 0;
        z-index: 60;
        /* Solid scrim — no backdrop-filter on fixed elements (constitutional rule 1). */
        background: color-mix(in srgb, var(--paper-deep) 70%, transparent);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: kbd-fade-in var(--motion-fast);
      }
      @keyframes kbd-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .kbd-help-panel {
        background: var(--paper-card);
        border: 0.5px solid var(--hair);
        border-radius: var(--radius-md);
        padding: var(--space-md) var(--space-lg) var(--space-md);
        max-width: 440px;
        width: calc(100vw - 2rem);
        box-shadow: var(--shadow-md);
        animation: kbd-pop var(--motion-normal);
      }
      @keyframes kbd-pop {
        from { transform: scale(0.96); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }
      .kbd-help-header {
        display: flex;
        align-items: baseline;
        gap: var(--space-sm);
        padding-bottom: var(--space-sm);
        border-bottom: 0.5px solid var(--hair);
        margin-bottom: var(--space-sm);
      }
      .kbd-help-eyebrow {
        /* Eyebrow primitive provides typography. */
      }
      .kbd-help-title {
        flex: 1;
      }
      .kbd-help-close {
        background: transparent;
        border: 0;
        cursor: pointer;
        font-size: var(--font-display-3);
        color: var(--ink-3);
        line-height: 1;
        padding: var(--space-xs) var(--space-xs);
        border-radius: var(--radius-sm);
        transition: color var(--motion-fast), background var(--motion-fast);
      }
      .kbd-help-close:hover {
        color: var(--thread);
        background: color-mix(in srgb, var(--thread) 10%, transparent);
      }
      .kbd-help-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-xs);
      }
      .kbd-help-row {
        display: grid;
        grid-template-columns: 6.5rem 1fr;
        gap: var(--space-sm);
        align-items: baseline;
      }
      .kbd-help-keys {
        display: inline-flex;
        gap: var(--space-xs);
        flex-wrap: wrap;
      }
      .kbd-key {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.6rem;
        padding: 0.06rem var(--space-xs);
        font-family: var(--font-mono);
        font-size: var(--font-mono);
        background: var(--paper-up);
        border: 0.5px solid var(--hair);
        border-bottom-width: 1.5px;
        border-radius: var(--radius-sm);
        color: var(--ink-1);
      }
      .kbd-help-label {
        font-family: var(--font-serif);
        font-size: var(--font-caption);
        color: var(--ink-2);
        line-height: 1.35;
      }
      .kbd-help-footer {
        margin-top: var(--space-md);
        padding-top: var(--space-sm);
        border-top: 0.5px solid var(--hair);
        display: inline-flex;
        align-items: baseline;
        gap: var(--space-xs);
        font-family: var(--font-serif);
        font-size: var(--font-eyebrow);
        color: var(--ink-3);
        font-style: italic;
      }

      /* ── ERROR STATE ─────────────────────────────────────── */
      .error-shell {
        min-height: 100vh;
      }
      .error-panel {
        max-width: 36em;
        margin: var(--space-2xl) auto;
      }
      .error-filename {
        font-feature-settings: "onum" 1, "tnum" 1;
        color: var(--ink-1);
      }
      .error-msg {
        font-style: italic;
        color: var(--ink-3);
      }
      .error-back {
        margin-top: var(--space-md);
      }
      .error-back a {
        color: var(--thread);
        text-decoration: none;
      }
      .error-back a:hover {
        text-decoration: underline;
      }
    `}</style>
  );
}

export default function SnapshotPage() {
  return (
    <Suspense fallback={<div style={{ padding: 'var(--space-xl)', color: 'var(--ink-3)' }}>Loading…</div>}>
      <SnapshotInner />
    </Suspense>
  );
}
