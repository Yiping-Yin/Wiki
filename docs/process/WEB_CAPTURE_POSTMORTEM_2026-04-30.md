# Web Capture Postmortem: flipdisc.io

Date: 2026-04-30

This postmortem records why the `flipdisc.io` capture work consumed too much
time, and the rules that must prevent the same loop from happening again.

## Summary

The failure was not one broken selector, one missing image handler, or one bad
reader CSS rule. The deeper failure was architectural: Loom treated a
media-rich, interactive web page as if it could be reduced to Markdown plus
static screenshots. That made partial success look convincing while core
requirements stayed broken:

- videos and animated media became still images
- provider embeds were present but not reliably playable
- CSS/canvas/SVG assemblies were sometimes split into meaningless fragments
- source section hierarchy and uppercase module labels were not first-class
  reader data
- snapshot evidence was confused with a healthy reader
- stale saved captures were repeatedly mistaken for current pipeline output

The result was high iteration cost with low confidence. Future capture work
must move from screenshot-oriented patching to structured capture with hard
diagnostics.

## What Went Wrong

1. **Static screenshot success was accepted too often.**
   A page could look visually closer while still losing interactivity,
   animation, media controls, or section structure. Screenshots are evidence,
   not proof.

2. **The reader had no explicit content contract.**
   Without a typed capture shape, Markdown rendering became the implicit
   interface. That interface cannot express the difference between a real
   video, an animated GIF, a provider embed, a canvas recording, a static image,
   and a visual source snapshot.

3. **Snapshot and reader responsibilities blurred.**
   The source snapshot can prove that the original page was preserved, but it
   cannot prove that Loom's reader extracted the source well. Reader
   completeness must be verified independently.

4. **Media was treated as a visual fallback before it was classified.**
   Videos, GIFs, provider iframes, canvas animations, and static diagrams have
   different preservation rules. Treating them all as "visual blocks" caused
   false completeness.

5. **Live DOM and computed layout were underused.**
   Detached clones are acceptable for prose-only capture. They are insufficient
   for canvas pixels, CSS-driven modules, media state, and multi-node visual
   assemblies.

6. **Diagnostics were not hard gates.**
   Capture logs reported media counts and payload sizes, but the save/read
   path did not fail when counts, section spine, media sidecars, or end-of-page
   content were missing.

7. **Provider playback was not separated from extraction.**
   YouTube `Error 153` in a `loom://` WKWebView origin is a playback-origin
   problem. It should not be confused with missing extraction, but it also
   cannot be considered Notion-like embed parity.

8. **Repeated patching continued after the architecture signal was clear.**
   Once three separate fixes revealed new classes of failure, work should have
   stopped for an architecture reset instead of continuing local patches.

## New Non-Negotiable Rules

1. **Typed Capture Contract First.**
   No capture is complete without a structured capture contract.
   Rich web capture must produce a typed block model before renderer work:
   `section`, `heading`, `eyebrow`, `paragraph`, `list`, `code`, `table`,
   `image`, `gif`, `video`, `providerEmbed`, `visualAssembly`,
   and `sourceSnapshot`.

2. **Never Downgrade Dynamic Media.**
   Never downgrade dynamic media to screenshot unless it is explicitly a
   fallback.
   If source media is playable or animated, preserve it as media. A still
   poster can accompany it, but cannot replace it.

3. **Reader and snapshot are separate products.**
   Reader is the default searchable, playable, editable Loom surface.
   Snapshot is source evidence and debugging support. Side-by-side comparison
   is not the default product mode.

4. **Golden-case validation must compare input census to saved output.**
   For `flipdisc.io`, the extension must record counts for headings, sections,
   images, GIFs, videos, provider embeds, canvases, SVG assemblies, code
   blocks, and links. The saved reader must account for them.

5. **Stale captures are not evidence.**
   Build/test/app-smoke proves code health. Product completeness requires a
   fresh browser re-capture with current extension version and diagnostics.

6. **AI extraction is secondary.**
   AI may summarize, label, or generate alt text after deterministic capture.
   It must not be the authority for page structure or media inventory.

7. **Provider embed parity requires origin strategy.**
   If the reader uses `loom://`, provider playback failures must be expected.
   Notion-like playback requires a trusted HTTPS or loopback renderer origin,
   or a native/proxied media strategy.

8. **After Three Failed Patch Cycles, Stop and Reframe.**
   Three independent symptom fixes that expose new failure classes mean the
   architecture is wrong. The next step must be a plan, not another patch.

9. **Source Authority Is Immutable.**
   Web capture writes only into Loom-managed capture storage and sidecars.
   It must not write derived metadata, media, or cache files into user source
   folders such as `Knowledge System`.

10. **Every future fix needs a failing test first.**
    Add the regression test before changing product code. The test must fail
    for the current broken behavior, then pass after the fix.

## Required Architecture Shift

The replacement path is:

1. Extension performs a live-DOM census and emits a typed `CaptureAST`.
2. Extension classifies media before fallback:
   - real image
   - animated GIF
   - native video/audio
   - provider embed
   - canvas/video recording
   - static visual assembly
3. Large media and screenshots are saved as sidecar attachments, not inline
   Markdown data URLs.
4. Native ingest persists body, sidecars, source snapshot, and diagnostics in
   Loom-owned storage.
5. Reader renders `CaptureAST`, not ad hoc Markdown.
6. Snapshot remains available as source evidence.
7. Golden-case tests compare source census, saved diagnostics, and reader
   output.

## 2026-04-30 Implementation Lesson

The concrete product boundary is:

- **Reader** is the semantic surface: searchable prose, headings, lists, links,
  code, tables, provider embeds, and clearly labeled fallbacks.
- **Snapshot** is the fidelity surface: live-page evidence, dynamic canvas,
  CSS/SVG assemblies, and interactive media context.

The browser extension default must therefore capture **Reader + interactive
Snapshot** together. A reader-only capture is not acceptable for rich web pages.
Static canvas/composite/structured-visual fallbacks in Reader must be labeled as
static still frames and link back to Snapshot evidence. They must never be
presented as playable or complete dynamic media.

Regression gates added for this lesson:

- default floating-button capture uses the snapshot-capable reader path
- `preserveJS` snapshots are explicitly marked in captured HTML
- JS-preserved snapshots use a stricter sandbox without same-origin access
- Reader annotates static visual fallbacks with a Snapshot link
- provider video cards prefer embedded iframe payloads over thumbnails

Operational rule: after extension or renderer changes, rebuild/install the app,
reload the browser extension, refresh the source page, and re-capture. Existing
captures remain historical artifacts and must not be used as proof that the new
pipeline works.

## flipdisc.io Golden Contract

Before claiming web capture is healthy, a fresh capture of
`https://flipdisc.io/` must prove:

- section spine is present: `Build`, `Panels`, `Frame`, `Cabling`,
  `Processing`, `Software`, `Design`, `Next Steps`, `Conclusion`,
  `Inspiration`
- uppercase visual labels survive, including `PIXEL FONT COMPARISON` and
  `FLOYD-STEINBERG VS BAYER`
- YouTube and Vimeo are represented as provider embeds with source fallback
- GIF/video/dynamic media are not replaced by static screenshots
- `Controller Board`, `Aluminum Frame`, dither comparison, and pixel-art
  banner are coherent visual assemblies
- code blocks and shell snippets remain code
- final-page content and footer/inspiration links remain reachable
- reader scroll works without iframe-internal scrolling
- diagnostics are persisted with extension version, transport, payload size,
  media counts, and sidecar counts

## Token/Time Control Protocol

For future high-risk capture bugs:

1. Spend the first pass on root-cause evidence, not implementation.
2. Write or update the golden-case contract before patching.
3. Split work by boundary: extension extraction, native persistence,
   renderer, app-surface verification.
4. Use subagents only for bounded, non-overlapping questions.
5. Close subagents as soon as their result is integrated.
6. Do not keep validating with screenshots alone.
7. If the next patch would only make one screenshot look better, stop.

The goal is not to make one `flipdisc.io` screenshot prettier. The goal is to
make Loom's capture pipeline truthful: searchable text, playable media,
preserved structure, explicit fallbacks, and auditable diagnostics.

## 2026-05-01 Regression Lesson

The 2026-05-01 `flipdisc.io` regression had two separate root causes that
looked similar in the UI:

- Native persistence rewrote temporary `loom://media/...` URLs in the Markdown
  body, but left the `CaptureAST` sidecar stale. The reader prefers
  `CaptureAST`, so old transient media URLs rendered as broken image
  placeholders even when the canonical body had already been fixed.
- The reader generated an interactive snapshot iframe, then discarded it and
  rendered only the preview still frame. This made dynamic/canvas sections look
  dignified but false: they were snapshots, not interactive evidence.

Permanent rules from this failure:

1. Body and `CaptureAST` are dual authorities. Any URL rewrite, media sidecar
   migration, or snapshot substitution must update both before save.
2. Reader render must reject `CaptureAST` output that still contains transient
   `loom://media/...` placeholders and fall back to the canonical rewritten
   body.
3. Interactive capture contracts must assert the active path, not just the
   presence of unused source strings. A `void liveFrame` style discard is a
   regression, but so is an unscoped full-page iframe that repeats the source
   page inside the article.
4. Snapshot-backed visual modules must not embed a capture-level snapshot
   inline unless the snapshot URL carries a stable per-resource anchor, rect,
   or selector. Until CaptureAST has that field, the reader shows a scoped
   preview plus an "Open interactive snapshot" action.
5. Save-sheet trimming must be Markdown-aware. Headings, horizontal rules,
   section tables of contents, and markdown link lists are structure, not
   browser chrome.
6. Contract tests are necessary but insufficient. A fix is not done until the
   app is rebuilt, installed, and verified against the golden capture surface.

This lesson supersedes any local workaround that makes a single screenshot look
better by flattening dynamic evidence or by duplicating the full source page
inside every visual block. If a page element is dynamic, Loom must either
preserve a scoped interactive route to it or label the fallback honestly.

## 2026-05-01 Inline Snapshot Correction

The next regression proved that "interactive inline" was not a safe fix yet.
`wrapSnapshotBackedMedia` was pointing every visual block at the same
`snapshotHref?embed=1`, and `loom-render/snapshot` renders the full saved page
for that URL. On `flipdisc.io`, a canvas/card position therefore became a whole
copy of the source page embedded mid-article.

Permanent rule: page-level snapshots are evidence, not inline media. The reader
may link to the full interactive snapshot, but it must not embed it into the
article flow until the capture contract includes per-block snapshot targets.

## 2026-05-01 Peer Review Settlement

The peer review correctly reframed this as a multiplicative architecture
problem, not a styling tradeoff:

- One capture can contain many canvas/SVG/structured visual blocks.
- A capture-level snapshot iframe represents the whole source page.
- Therefore `N` visual blocks rendered as `N` full-page iframes multiplies the
  article body by `N`, duplicating navigation, prose, and unrelated media.

Rejected interim: a collapsed full-page iframe behind `<details>` reduces the
default visual damage, but it still presents the wrong object. When expanded, it
is still the full source page, not the local visual block. That is useful as a
separate full-snapshot affordance, not as inline article media.

Accepted interim: reader visual blocks render the scoped saved preview plus an
explicit "Open interactive snapshot" action. This is honest about what Loom can
prove with the current contract.

Final architecture: per-region anchoring.

1. `content.js` assigns a stable snapshot target id to each captured visual
   region before snapshot serialization.
2. CaptureAST persists that target id with the corresponding media block, along
   with enough geometry to restore a local viewport (`rect`, natural size, or a
   selector fallback).
3. `capture/page.tsx` may only render an inline interactive iframe when the
   media block has a target id.
4. `snapshot/page.tsx?embed=1&target=<id>` must scroll/crop to that target and
   size the iframe to the visual region, not the whole saved page.
5. Tests must fail if a bare `snapshotHref?embed=1` is embedded in article
   flow without a target.

Do not re-enable `figureBody = liveFrame || preview` until the per-region
target contract and snapshot target route are implemented and covered by tests.

## 2026-05-01 Media Taxonomy Lesson

This work also exposed a planning mistake: "dynamic media" is not one class.
It must be split by preservation strategy:

- Native media (`<video>`, `<audio>`) should be saved as playable Loom content
  assets and rendered with native controls.
- Animated image formats (GIF/WebP/APNG) should keep their original animated
  source and MIME type; rehosting must not flatten them into still images.
- Trusted provider iframes (YouTube/Vimeo/Bilibili) should use provider-specific
  iframe passthrough with visible source fallbacks.
- Canvas/WebGL and interactive structured visuals need per-region runtime
  anchoring. A recorded fallback is not acceptable when the user's input changes
  the meaning of the object.
- CSS/Lottie/scroll-driven visuals may use recorded fallback only when the
  animation itself is the value and user interaction is not the value.
- Screenshots are evidence, not interactivity.

The roadmap now lives in `plans/web-capture-per-region-anchoring.md`. Future
work must treat real flipdisc-style interaction as P0 capture-v1 scope.

## 2026-05-01 Visual Structure Lesson

The later `flipdisc.io` checks added a second failure class: structured visual
content can be destroyed even when all visible text is present. The original
software `Frame Format` block is a diagram: boxed fields, separators, uppercase
caption, and row geometry explain the binary protocol. The reader regression
collapsed that into inline text (`0x80 0x83 0x01 imageData 0x8F`), which is
searchable but no longer faithful.

Permanent rule: extractor completeness is not only words and links. For rich
technical articles, Loom must preserve visual grammar:

1. Section dividers and large headings remain section boundaries.
2. Uppercase labels remain captions or labels, not prose noise.
3. Diagram/table/card boundaries remain bounded visual blocks.
4. If the original object is interactive, the preserved block must be
   interactive or be explicitly labeled as a fallback.
