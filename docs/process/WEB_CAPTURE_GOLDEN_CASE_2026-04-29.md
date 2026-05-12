# Web Capture Golden Case: flipdisc.io

Date: 2026-04-29

This page is the current regression fixture for Loom Web Capture because it combines the failure modes that matter for the product:

Postmortem: `docs/process/WEB_CAPTURE_POSTMORTEM_2026-04-30.md` records the architectural lesson from the multi-day `flipdisc.io` debugging loop. It is now part of this fixture's acceptance criteria: screenshot-like visual similarity is not enough; rich capture must preserve structure, media semantics, interactivity/fallbacks, and diagnostics.

- long-form article prose
- YouTube and Vimeo embeds
- animated/static media fallbacks
- inline SVG diagrams
- code blocks and shell snippets
- image galleries
- many outbound links
- source-page layout styles that should not control Loom's reader layout

## Failure Modes Found

1. Raw source SVGs were copied with layout attributes like `x`, `y`, root `height`, and inline positioning styles. In Loom's reader these could become giant black shapes that covered the page.
   - Fix belongs in two places: the extension must save future SVGs with reader-safe layout and inline presentation; the renderer must defensively downgrade old class-dependent SVGs whose source CSS was not saved.
   - `data-loom-inline-svg="true"` is not proof of safety. Future SVG capture must inline presentation attributes or carry embedded class CSS; otherwise the extension should fall back to a static image and the renderer should distrust the saved SVG.
2. The installed app was manually re-signed without entitlements. That removed the sandbox container identity, so Loom read the wrong `UserDefaults` domain and showed `Folders · 0` / empty captures even though the sandbox data still existed.
3. Minimal mode did not use the legacy theme resolver. `auto` followed the system appearance through hard-coded dark design-system tokens, so the app stayed night-colored during daytime.
4. Capture validation was too local. A capture could look partly correct while missing images, screenshots, embeds, or later-page content.
5. Provider videos were intentionally rendered as thumbnail cards to avoid WKWebView provider errors. Product expectation is closer to Notion: render an embedded player first, keep the source link as the fallback, and accept that a provider may still refuse playback in some environments.
6. Browser extension state can be mistaken for extraction failure. On the failing Atlas tab, `#__loom_capture_floating_btn__` was absent and Loom console logs were empty: the extension was not injected, so no future SVG/media fix could run.
7. The detail-page `Re-capture` button reused `Open original`, which made it look as if Loom had a re-capture pipeline when it only opened the source URL.
8. Several important visuals are not single images. `Aluminum Frame` is a compact grid of twelve SVGs, and the dither comparison mixes canvases with SVG controls. Walking child media separately loses the page CSS and breaks the visual meaning.
9. The previous semantic extractor walked a detached `cloneNode(true)`. That is fine for prose, but it loses canvas pixels and computed layout styles. Media-rich pages must walk the live DOM and queue async screenshots for composite visual blocks.
10. Large static visual captures cannot live as inline data URLs in the markdown body. The `Data Connection` canvas on `flipdisc.io` exceeded the inline cap and degraded to `canvas screenshot too large — view at source URL`, so screenshots must be saved as Loom media sidecars and referenced via `loom://media/<tmpId>`.
11. Large media-rich captures can outgrow URL fallback. On Atlas, the enriched `flipdisc.io` payload reached ~2 MB; async clipboard writes can fail after multi-second screenshot extraction, so the extension must declare `clipboardWrite` and fall back to DOM copy instead of truncating through `loom://capture?payload=...`.
12. The reader and the visual snapshot are different products. The reader is Loom's default capture surface for searchable, editable prose. The snapshot is auxiliary source evidence for source layout, composite SVG/canvas assemblies, and rich visual completeness.
13. Snapshot scroll must belong to the Loom page in normal mode. A full-page capture embedded as a fixed-height iframe forces users to scroll inside the iframe, which is fragile in WKWebView and can appear as "cannot scroll down" after SwiftUI updates. Normal snapshot mode should auto-height the iframe and let the parent route scroll; fullscreen may keep constrained iframe scrolling.
14. The extension must not call `captureVisibleTab` once to probe Promise support and then again with a callback. In Chromium-style MV3 contexts the first callback-less call can still consume a screenshot frame while returning `undefined`, delaying capture and risking rate limits.
15. `loom://capture` can arrive more than once during a single user flow. Temporary cross-Space window behavior must be restored by a tokenized/burst-safe path so repeated clicks do not leave Loom permanently joined to every Space.
16. The reader cannot depend on the source snapshot for document structure. `flipdisc.io` uses strong section dividers, large section headings, uppercase module labels, and CSS-driven visual modules such as `Pixel Font Comparison`; those must survive in the Loom reader body.

## Product Rules

- Never re-sign an installed Loom.app with bare `codesign --force --deep --sign -`. Use `npm run app:user` or the Xcode build/install path so entitlements are preserved.
- User source folders remain read-only. Capture fallback scanning may inspect only Loom-managed data under `LoomFileStore.rootURL`.
- External HTML/SVG is source material, not layout authority. Preserve semantic media content, but strip source-page root layout constraints before rendering inside Loom.
- Historical captures are untrusted too. Renderer code must repair or downgrade old saved media artifacts instead of assuming the extension that produced them had today's safeguards.
- Embed markers are semantic media. Render YouTube/Vimeo/Bilibili markers as provider iframes with a visible source link, not as image-only cards.
- `auto` theme means Loom local day/night rhythm. Day is paper; night is night. It is not a proxy for the current macOS system appearance; do not flip to night before 21:00.
- Rich captures require the extension folder that actually contains `manifest.json`: `macos-app/Loom/LoomWebExtension/Resources`. Loading the parent `LoomWebExtension` folder is a known setup error.
- `Re-capture` must be explicit about the boundary: saved Loom pages cannot re-extract live DOM/media. It should guide the user back to the original browser tab with the extension loaded.
- A web capture is not complete until the real installed app shows the saved detail page with roots, embeds, images, code, links, and end-of-page content intact.
- For media-rich documents, capture from live DOM. Detached clones are allowed only for prose-only extraction.
- Treat compact multi-SVG/canvas sections as a single visual assembly. Preserve them with a static screenshot in the reader, then keep individual semantic media handling for ordinary images, embeds, and standalone canvases.
- Save generated screenshots as media attachments, not markdown-inline base64. The body should keep search/copy text, while heavy visuals are sibling files rewritten to `loom://content/...` on save.
- Multi-megabyte captures must use the short `loom://capture?via=clipboard` path. If async clipboard fails, use the DOM copy fallback; never send large media payloads through the URL fallback.
- Do not debug Atlas extension state by guessing from the Extensions UI. Run `npm run app:check-extension`; it verifies the loaded Atlas profile points at the exact `Resources` folder and reports the extension id/path.
- Every rich capture must carry compact `loomExtension` diagnostics and persist them as a hidden Loom-owned `loom-capture-diagnostics` comment in the saved capture. This makes version, transport, and media-sidecar failures auditable later without mutating user source folders.
- Capture rows with a stored `Loom-snapshot-*.html` should open the Loom reader by default. The stored source snapshot remains one click away from the row action and reader/snapshot toolbar.
- Native capture navigation must preserve both detail routes: `/loom-render/capture/` and `/loom-render/snapshot/`. SwiftUI parent updates must not reload the captures landing while a long reader or snapshot is being scrolled.
- macOS WKWebView capture surfaces must configure scrolling through the native `NSScrollView` in the view tree, not the iOS-only `webView.scrollView` API. Release builds are part of the capture contract.
- Reader pages must own document scrolling explicitly. Media-heavy first viewports cannot rely on default WKWebView wheel routing, because video/iframe/canvas controls can consume trackpad gestures before the page scrolls.
- Browser extension screenshot code must branch before calling `captureVisibleTab`: Promise browser APIs use one Promise call; Chromium callback APIs use one callback call.
- External-capture window Space shuttling must be burst-safe. Never snapshot `.canJoinAllSpaces` after a prior capture already inserted it.
- Capture delete/save failures must be visible to the user. Console logs are evidence, not product feedback.
- Source section hierarchy is reader content. Preserve h1/h3/h4 headings, uppercase module labels, and compact CSS/input visual modules as reader blocks; the snapshot is source evidence, not a substitute for a complete reader.

## Golden Checks

Use `https://flipdisc.io/` before claiming the web-capture chain is healthy.

Expected capture detail:

- title: `Flipdisc Display Build and Software Guide`
- roots still visible in the sidebar after app restart
- word count remains in the long-article range
- YouTube player near the top is rendered as an embed with a usable source link
- later technical/code sections render as code, not lost prose
- app screenshot images render, not broken placeholders
- Vimeo player near the end remains present as an embed with a usable source link
- no giant black SVG/layout artifact covers the reader
- `Aluminum Frame`, `Floyd-Steinberg vs Bayer`, and the lower pixel-art/banner canvas are present as coherent visuals
- no `canvas screenshot too large` / `element screenshot too large` placeholder remains in the saved body
- at local daytime, shell and capture reader use the paper theme
- the original browser tab shows the L floating button before re-capture
- after saving, Captures refreshes to the newly saved entry rather than showing stale detail content
- clicking a rich web capture row opens the Loom reader first; the stored source snapshot remains available from the row action
- the reader toolbar says `Snapshot` / source evidence, not `Compare`, because side-by-side comparison is not normal product mode
- the reader preserves the source section spine: `Build`, `Panels`, `Frame`, `Cabling`, `Processing`, `Software`, `Design`, `Next Steps`, `Conclusion`, and `Inspiration`
- uppercase visual labels such as `PIXEL FONT COMPARISON` survive, and CSS/input visual modules are captured as coherent reader images instead of collapsing to stray form text
- the saved snapshot scrolls through the full page in the parent Loom view without requiring iframe-internal scrolling
- the saved `Loom.md` entry contains one hidden `loom-capture-diagnostics` comment with extension version/id, transport, payload size, and media counts
- `xcodebuild -project macos-app/Loom/Loom.xcodeproj -scheme Loom -configuration Release build -quiet` passes before installing the app

## 2026-04-29 Live Verification Notes

- Installed app verification must use `/Users/yinyiping/Applications/Loom.app`, not a stale windowless process. A running process with `0` windows is not enough evidence that the installed UI was tested.
- The 18:37 `flipdisc.io` capture in the installed app is substantially more complete than earlier broken captures: the reader shows `3,463 words`, the article reaches the end, app screenshots render, and the Vimeo embed loads as a playable provider frame.
- YouTube extraction is present, but YouTube returns `Error 153` inside the current `loom://` WKWebView origin. Treat this as a provider/origin playback limitation, not as missing capture data. Notion-like YouTube playback requires a trusted web origin or native/proxied player strategy.
- Historical class-dependent SVGs cannot be reconstructed after the original CSS was lost. The reader should downgrade them with an explicit re-capture message. New captures must come from the updated extension so SVG presentation is inlined or captured as a static screenshot.
- Browser Use on the active `https://flipdisc.io/` tab reported `#__loom_capture_floating_btn__ = 0` and no `[Loom]` console logs. That tab is not running the Loom extension, so it cannot exercise current rich-media extraction.
- Follow-up fix: Save now posts a dedicated `.loomCaptureSaved` native notification that `CaptureWebView` bridges into `window.dispatchEvent(new Event('loom:capture-saved'))`. This uses the existing React refetch path without reintroducing full WKWebView reload churn.
- Follow-up fix: capture rows now prefer the Loom reader, snapshot routes auto-height the iframe in normal mode, and the native webview preserves both reader and snapshot detail routes across parent updates.
- Follow-up fix: `captureVisibleTab` no longer double-fires in callback-mode browsers, and `loom://capture` cross-Space activation restores window collection behavior through a burst-safe token.

## 2026-04-30 Installed-App Verification Notes

- `/Users/yinyiping/Applications/Loom.app` was rebuilt, installed, relaunched, and smoke-tested before judging the capture UI. The extension check reported the expected `macos-app/Loom/LoomWebExtension/Resources` path and version `1.4.6`.
- The latest `flipdisc.io` capture row opens the Loom reader by default. The row action and snapshot toolbar still provide a snapshot/source path, so rich captures keep source evidence one click away without making comparison the default reading surface.
- Computer Use inspection of the installed app found that the source snapshot can contain the full page, but the reader still needed a stronger structural contract: h1/h3 section headings, uppercase labels, and CSS/input visual modules must be part of the right-side reader, not only recoverable from snapshot comparison.
- The 09:57 screenshot proves the saved snapshot can scroll to `Conclusion` / `Inspiration` / copyright on the frozen page. It does not prove the reader route is healthy; reader mode needs its own document-scroll contract and media-wheel forwarding.
- Side-by-side comparison is not visible or persisted product UI. The default state remains a single reader route, and normal snapshot mode still auto-heights into the parent Loom scroll flow when opened as auxiliary source evidence.
- YouTube still returns `Error 153` inside the custom `loom://` WKWebView origin. The capture is present and keeps the source link, but provider playback is not fully controlled by Loom. Notion-like YouTube playback needs a trusted HTTPS origin or a native/proxied player strategy.
- Follow-up fix: the extension now stages CSS/input-based visual modules as `structured-visual` screenshots, emits uppercase module labels into the reader, and uses cleaned readable text for screenshot alt text so embedded `<style>` rules do not leak into captions.
- Follow-up fix: the capture reader now applies a route-level scroll class to `html`/`body` and forwards wheel gestures that start on video/iframe/canvas/media cards back to document scroll. The toolbar also labels stored source evidence as `Snapshot` instead of `Compare`.
- Follow-up fix: native WKWebView wheel fallback is now non-destructive. It only handles capture detail routes, ignores Command/Control gestures, delegates into the native scroll view, and returns the event when the view did not actually move.
- Follow-up fix: section hierarchy is extracted before visual screenshot grouping. Semantic heading wrappers are not allowed to become composite screenshots, so `Build`, `Design`, `Conclusion`, and uppercase module labels remain reader structure.
- Follow-up fix: large visually blank canvases are queued for element screenshots instead of being silently dropped. This protects CSS/canvas-heavy modules whose pixels are visible only in the live page.
- Verification note: the existing saved `flipdisc.io` entry can be stale. A passing build/test/app smoke proves the future capture path, but completeness must be judged on a fresh browser re-capture that includes the hidden `loom-capture-diagnostics` marker.

## Regression Commands

```bash
npm run app:check-extension
npx tsx --test tests/capture-media-contract.test.ts tests/captures-landing-refresh-contract.test.ts tests/capture-render-debug-artifacts.test.ts tests/source-authority-contract.test.ts tests/night-chrome-theme.test.ts
npm run app:user
npm run app:smoke
```

After installing, open `~/Applications/Loom.app` and verify with Computer Use or a real screenshot, not just static tests.
