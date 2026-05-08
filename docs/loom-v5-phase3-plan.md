# Phase 3 — ServiceWorker Offline Rendering

**Goal:** Eliminate the WKWebView "React hydration silently fails when iframe nested 3 levels deep" bug.

**Root cause (re-confirmed 2026-05-05):**

Loom's current snapshot pipeline nests iframes 3 levels:
1. Loom main WKWebView
2. `<iframe src="loom://bundle/loom-render/snapshot/?...">` (Loom React app)
3. `<iframe srcDoc={snapshotHtml}>` (the snapshot itself)

In Chromium + WebKit at `file://` origin, React 18 hydration attaches `__reactFiber*` / `__reactProps*` to rendered DOM nodes correctly. In Loom WKWebView at level-3 nesting, those properties are absent — so even though widgets paint visually, click/hover/input handlers are dead.

**Phase 3 fix:** Serve the snapshot HTML from a **dedicated origin** registered with WKWebView's URL scheme handler, so the snapshot iframe is at level **1** (sibling of Loom UI, not nested inside it).

---

## Architecture target

```
WKWebView main page (loom://bundle/...)
  ├─ iframe src="loom-snapshot://<sha>/index.html"   ← single iframe, 1 level deep
  │     ├─ snapshot HTML served from SW origin
  │     ├─ all module imports / images / fonts also served from same origin
  │     └─ React hydration attaches fiber correctly (proven path)
  └─ Loom chrome (toolbar, sidebar) renders alongside
```

## Implementation steps

### 3.1 Register `loom-snapshot://` URL scheme handler (Swift)

`LoomURLSchemeHandler.swift`:
- Add new scheme `loom-snapshot://`
- URL shape: `loom-snapshot://<capture-uuid>/<asset-path>`
- `<capture-uuid>` resolves to a specific snapshot directory
- `<asset-path>` resolves to a file inside that capture's folder (snapshot html, media, etc.)

Pseudo:
```swift
case "loom-snapshot":
    let captureId = url.host ?? ""
    let assetPath = url.path  // /index.html, /media-xyz.jpg, /_modules/X.js
    let captureDir = lookupCaptureDirectory(captureId: captureId)
    let assetURL = captureDir.appendingPathComponent(assetPath)
    serveFile(at: assetURL, urlSchemeTask)
```

### 3.2 Snapshot generation rewrite (extension content.js)

Currently the extension produces ONE big HTML file with all modules / images inlined as data: URLs. Phase 3 splits this:
- `index.html` — the snapshot DOM, with relative paths to siblings
- `_modules/<hash>.js` — each JS module as a separate file
- `_assets/<hash>.<ext>` — images / fonts / etc.

The extension still inlines into ONE blob for transport over native messaging, but the Swift watcher unpacks into the per-capture folder.

### 3.3 Capture-snapshot.json bridge update

Currently returns `{ html: "<full snapshot>" }`. Phase 3 returns:
```json
{
  "captureId": "uuid",
  "indexUrl": "loom-snapshot://<uuid>/index.html",
  "schemeReady": true
}
```

### 3.4 capture/page.tsx update

Remove the `srcDoc` plumbing. Single iframe with `src={indexUrl}`. Sandbox stays `allow-same-origin allow-scripts ...` since the loom-snapshot scheme is treated as a unique origin per capture.

### 3.5 Migration

Existing captures (one big snapshot HTML file) keep working via a fallback path that reads the file directly and still uses srcDoc. Only NEW captures use the unpacked path. Eventually run a one-shot migration to unpack old captures.

---

## Risks & open questions

1. **WKURLSchemeHandler quirk:** Some scheme tasks need `urlSchemeTask.didReceiveResponse` BEFORE `didReceiveData`. Off-thread serving needs careful ordering.
2. **CORS in iframe at custom scheme:** Must register scheme with `WKWebView.handlesURLScheme(_:)` plus configure as a same-origin scheme via `WKWebViewConfiguration.setURLSchemeHandler(_:forURLScheme:)`.
3. **Module imports inside HTML:** `<script type="module" src="...">` needs the scheme to support range requests — usually okay but worth testing with large bundles.
4. **Cache invalidation:** When a capture is re-captured, the cache for that captureId must clear.

---

## 2026-05-05 update — 3.3b investigation outcome

**Result**: WKWebView blocks cross-scheme subresource access **silently**. Even with:
- `setURLSchemeHandler` properly called for both `loom` and `loomsnap`
- CORS response headers (`Access-Control-Allow-Origin: *`)
- Both `fetch('loomsnap://...')` and `<iframe src="loomsnap://...">`

…the WKURLSchemeHandler.`webView(_:start:)` method is **never invoked**. Requests die before reaching the handler.

Tried scheme names `loom-snapshot` and `loomsnap` — same result.

This is a known WKWebView limitation: subresources from a different URL scheme are treated as cross-origin and rejected by an internal policy that's not surfaced via the public CORS / scheme-handler API. The workaround is a **private API** `_setURLSchemeHandler:forURLScheme:secure:` which marks the scheme as same-origin trustworthy, but private APIs trip App Store review.

**Pivot for next session — Phase 3.4**: stay on the `loom://` scheme but use a NEW HOST instead of a new scheme:

```
loom://content-frame/<token>/<asset-path>
```

The handler already routes by host (`content`, `bundle`, `derived`, etc.). Adding `content-frame` as another host = same-scheme = no cross-scheme block. The `<token>` is still the SHA-256 hex, and the asset-path is unchanged.

Trade-off: the iframe is still on the SAME scheme as the parent page, which means strict same-origin policy applies. We lose the "isolated origin" benefit. But: the React fiber attachment problem we were trying to solve is about NESTED iframes (3 deep), not about cross-origin policy. Single iframe at any URL — same-scheme or different-scheme — should fix the nested-fiber bug.

Verify in 3.4 by doing the simplest possible single-iframe test: `<iframe src="loom://content/.../Loom-snapshot-*.html">` (same as the existing snapshotHref) and confirming React 18 fiber attaches.

## Estimated effort

- 3.1 Swift handler: 1-2 days
- 3.2 Extension unpacking: 2-3 days
- 3.3 Bridge: 0.5 day
- 3.4 React update: 1 day
- 3.5 Migration: 1 day
- Testing across 6 widget types: 1-2 days

**Total: ~1-2 weeks** (matches roadmap).

---

## Out-of-session scope marker

Do NOT attempt 3.x in a single session. The handler-side change touches the running Loom binary's URL scheme handling, and a misregistration can prevent ALL Loom assets from loading (including the main UI). Bring this in piecewise across at least 3 sessions:

1. Session A: 3.1 + a no-op handler that just logs requests. Verify Loom still works.
2. Session B: 3.2 + 3.3. Capture engine emits new layout. Old captures still work via fallback.
3. Session C: 3.4 + 3.5 + widget verification.
