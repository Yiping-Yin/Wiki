# Web Capture Per-Region Anchoring

Status: P0 capture-v1 scope. Real interaction is mandatory for canvas/WebGL
and structured visual regions where interaction is the content.

## Problem

Loom currently has two different capture products:

- Reader article: a structured, readable article with extracted text and media
  sidecars.
- Snapshot: a saved full source page for evidence and interaction.

The regression happened when reader media cards tried to use the full snapshot
as if it were a local media region. On pages such as `https://flipdisc.io/`,
each canvas or structured visual block then embedded the entire page again.
This is multiplicative: `N` visual blocks become `N` full-page iframes.

The deeper product failure is not cosmetic. On `flipdisc.io`, the visual blocks
carry primary meaning:

- `Aluminum Frame`, `Controller Board`, and `Power Connection` use the same
  board base but expose different highlighted states. A still frame loses the
  user's ability to inspect and flip through those states.
- The software `Frame Format` block is a structured visual diagram with boxed
  fields, separators, labels, and uppercase section text. Reducing it to
  `0x80 0x83 0x01 imageData 0x8F` drops the layout grammar that explains the
  protocol.
- Section dividers, large headings, uppercase labels, and board captions are
  part of the article's information architecture. Reader extraction must not
  collapse those into generic prose.

## Current Rule

Until per-region anchors exist, the reader must show:

- the scoped preview/still/media sidecar for the visual block
- a clear action to open the full interactive snapshot

The reader must not inline a bare full-page snapshot iframe.

This fallback is temporary. It is not a final answer for canvas/WebGL,
interactive structured visuals, or flipdisc-style board diagrams.

## Media Taxonomy

There is no single "make it interactive" implementation. Web capture has
different preservation strategies by media class:

| Class | Current failure mode | Correct path | Tier |
| --- | --- | --- | --- |
| CSS keyframe/transition animation | flattened by screenshots | scoped iframe with source runtime | 2 |
| Canvas + JavaScript render loop | flattened or black still | scoped iframe with initialized source module/state | 2 |
| SVG animation (SMIL / CSS-on-SVG) | partially preserved | preserve inline SVG subtree when self-contained; otherwise scoped iframe | 1-2 |
| Native `<video>` | poster or failed media card | save source to Loom content store and render `<video controls>` | 1 |
| GIF / animated WebP / APNG | can be flattened during rehost | preserve original animated asset and mime | 1 |
| Lottie / Bodymovin | flattened | scoped iframe with runtime injection, or recorded fallback | 2-3 |
| WebGL / shader / Three.js | flattened | scoped iframe if context can be recreated, otherwise recorded fallback | 2-3 |
| Scroll-driven / parallax / IntersectionObserver | source scroll state lost | scoped iframe plus virtual scroll bridge | research |
| YouTube / Vimeo / trusted provider iframe | poster or provider error | provider whitelist passthrough with source fallback | 1 |

Tier 1 is the high-coverage, low-risk layer: preserve native media and trusted
provider embeds as themselves. Tier 2 is per-region runtime anchoring. Tier 3 is
recorded fallback for source runtimes that cannot be faithfully rehosted.

Out of scope for this anchoring plan: Tier 1 passthrough media that already has
a native runtime (`<video>`, animated GIF/WebP/APNG, trusted provider iframes).
Those should stay separate so per-region anchoring does not regress simple
playback.

**Tier 3 (recorded fallback) is out of scope for v1 of this plan.** Format,
storage path, and recovery behavior for canvas/WebGL regions that cannot be
re-hosted are deferred to a separate plan filed after Tier 1 + Tier 2
acceptance gates pass. Mentions of Tier 3 below are aspirational, not specs.

## Target Contract

Each captured visual block should carry a stable snapshot target:

```ts
type CaptureSnapshotTarget = {
  id: string;
  kind: 'canvas' | 'svg' | 'video' | 'iframe' | 'structured-visual';
  selector?: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  naturalWidth?: number;
  naturalHeight?: number;
};
```

`CaptureASTBlock` should get an optional `snapshotTarget` field. The saved
snapshot HTML should include the same target id on or around the source node.

Target ids must be assigned on the live DOM before the snapshot HTML is cloned,
then copied into reader-side media markup and CaptureAST blocks. The target id
must be deterministic for one capture run, not a random temporary media id.

## Tier 1 Acceptance

Before starting scoped iframe work, the capture contract must keep these green:

- direct `<video>` and `<audio>` sources are staged as playable sidecars with
  real file extensions and MIME types
- GIF/WebP/APNG source URLs are treated as animated assets, not flattened
  screenshots
- YouTube/Vimeo/Bilibili provider markers render provider iframes with visible
  source fallbacks
- if playback fails inside Loom, the fallback must say what failed and link to
  the source; it must not silently show a screenshot as if it were playable

These are v1 product behaviors. They should not wait for per-region anchoring.

## Rendering Rule

`capture/page.tsx` may render an inline iframe only when all are true:

- the block has `snapshotTarget.id`
- the snapshot URL includes that target (`?embed=1&target=<id>`)
- `snapshot/page.tsx` can locate and crop/scroll to that target

Otherwise, render the preview-link fallback.

The preview-link fallback is not a failure state. It is the honest behavior for
canvas/CSS/Lottie/WebGL/scroll-driven regions until scoped runtime anchoring or
recorded fallback exists.

## Snapshot Embed Behavior

`snapshot/page.tsx` embed mode should support:

- full snapshot mode: used by the standalone snapshot page
- target mode: used only for reader inline embeds

Target mode should:

1. find `[data-loom-snapshot-target="<id>"]` inside the saved HTML
2. scroll it into view after the iframe document loads
3. hide non-target sibling chains while preserving ancestors/head/cascade
4. inject `html, body { overflow: hidden !important; }` in target mode
5. scope pointer events so only the target receives interaction
6. apply a permissive sandbox sufficient for the most demanding kind
   (canvas/WebGL with scripts):
   `sandbox="allow-same-origin allow-scripts allow-forms allow-popups
   allow-popups-to-escape-sandbox allow-presentation"`. This is the v1
   shipped behavior at `app/loom-render/capture/page.tsx`. **Kind-specific
   tightening (e.g. `no-scripts` for CSS/SVG animations that don't need
   them) is deferred to v1.1** — file as a separate enhancement after the
   flipdisc golden case is green. Native video/provider iframes are
   handled by Tier 1 passthrough and never reach this branch.
7. size the embed shell from persisted geometry where available
8. expose failure as a visible fallback, not a blank frame

The target-mode transformation is required because a page with multiple boards
must not become multiple independently scrollable full-page iframes. Each reader
card should behave like the single captured region it represents.

## Tests

Minimum contracts:

- reader rejects bare `snapshotHref?embed=1` inline iframe
- reader renders preview-link fallback when `snapshotTarget` is absent
- reader renders target iframe only when `snapshotTarget.id` exists
- snapshot embed target mode includes the target parameter and target lookup
- extension emits stable target ids for canvas/SVG/video structured visual
  blocks
- direct video, animated image, and trusted provider iframe passthrough remain
  covered by Tier 1 contracts
- flipdisc golden case: opening a captured article in Loom reader and clicking
  a dot in `Controller Board #1` mutates that board's canvas state only. A click
  in `Controller Board #2` affects only board #2. Source navigation and sibling
  content are not reachable from either inline target.
- software frame-format golden case: `Frame Format` remains a structured visual
  block with its box, separators, and label hierarchy; it must not degrade into
  plain inline text.

## Non-Goals

- Do not make the **captured source page** editable. (This is distinct from
  Camp C M2 in `plans/loom-camp-c-editable-render.md`, which makes the
  *Loom reader's prose rendering* editable via `contenteditable`. Different
  layer; no conflict. The rule here applies only to the snapshotted source
  HTML, not to Loom's reader presentation of that content.)
- Do not mutate user local source files.
- Do not duplicate source-page navigation/prose inside reader media cards.
- Do not treat screenshots as proof of interactivity.
