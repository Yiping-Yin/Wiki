# Capture Spec · supersedes CANVAS_SPEC.md

Status: working spec for the canvas pivot landed 2026-04-11. CANVAS_SPEC.md
is now historical — do not implement from it.

## The principle

Externalizing a thought while reading must happen in **under 2 steps** and
**never produce a blank textarea**. Luhmann's separation of capture (during
reading) from elaboration (after reading) is the organizing pattern.
Canvas violated this by binding creation + placement + writing into one
action. This spec unbinds them.

## The three surfaces (all already partially exist)

1. **Capture** — an action taken on a text selection that produces a
   thought-anchor with `quote` pre-filled and `content`/`summary` empty.
   NO dialog. NO AI. NO modal. The selection disappears, a dot appears in
   the margin, user continues reading.

2. **Gutter dots** — `AnchorDot` + `AnchorLayer`, already built. Each
   thought-anchor renders as an accent dot at its source y. Hover shows
   `AnchorCard` preview. These need no changes except making sure empty-
   content anchors render sensibly (show the quote instead of the content).

3. **ReviewThoughtMap** — the right-side strip. Currently a narrow section
   TOC. Gains a **wide state** (toggled by ⌘/) where each thought-anchor
   appears as a writable card with the quote, latest version content, and
   a textarea to append a new version. Narrow state is unchanged.

## Data flow

**Zero new event types. Zero new data model.**

- Capture = `append(traceId, { kind: 'thought-anchor', quote, content: '',
  summary: '', ... })`
- Elaborate in wide-map = `append(traceId, { kind: 'thought-anchor',
  quote, content: <new>, summary: <new>, ... })` to the same anchor position
  → joins the existing version chain via `buildThoughtAnchorViews`' position
  fingerprinting.

Everything else — AnchorDot, ThoughtMapNode, version chains, crystallize —
already handles the rest.

## Interaction spec

### Capture

- **⌘⇧A** (global): if there is a selection in `main .loom-source-prose`,
  compute the anchor the same way `SelectionWarp.compute` does, append a
  thought-anchor with `quote = selection.text`, `content = ''`,
  `summary = ''`. Dismiss the selection. No UI change beyond the new
  AnchorDot appearing in the margin.
- **⌘-click on SelectionWarp thread**: same as ⌘⇧A. The ✦ warp thread
  stays as the ask-AI entrypoint; the ⌘ modifier branches to capture.
- **Tooltip update**: "Click → ask AI · ⌘-click → capture · ⌥-click → highlight".

Anchor computation logic is already in SelectionWarp — extract the relevant
part into a shared helper `lib/capture/from-selection.ts` used by both
SelectionWarp and the global shortcut listener.

### Gutter dots (AnchorDot) — render empty-content anchors

`AnchorCard` currently shows `summary` + `content`. For capture-only
anchors both are empty. Behavior:
- Preview card shows the `quote` prominently + a "not yet thought" placeholder
  where the content normally is.
- Clicking the dot in narrow-map mode pins it as usual.
- Clicking in wide-map mode expands the corresponding entry in ReviewThoughtMap
  (via `loom:review:scroll-to-anchor` or a new event).

### ReviewThoughtMap narrow ↔ wide

- **Narrow** (default, ~240px): current behavior unchanged. Section TOC
  with summary peeks.
- **Wide** (toggled by ⌘/, ~420px): content switches to a per-thought list.
  Each thought renders as a card:
  - Section label + quote (top)
  - Latest version content via NoteRenderer
  - Version count badge (if > 1)
  - Textarea below for appending a new version (placeholder: "延伸这个想法…")
  - Save on ⌘↩ or blur with dirty state
- Transition: 400ms width animation + cross-fade between the two content
  modes. The shutter cubic-bezier is reused for consistency.
- `⌘/` is no longer "enter canvas mode". It is "toggle map narrow/wide".
  `loom-study-mode` body class semantics collapse to "wide map active" so
  existing AnchorDot dim/hide behavior can still react if needed.

## Files

### Delete

- `components/CanvasLayer.tsx`
- `components/CanvasCard.tsx`
- `components/canvas-model.ts`
- `lib/trace/canvas.ts`
- `CANVAS_SPEC.md` (mark superseded, keep file for history)
- `canvas-item` kind in `lib/trace/types.ts`
- Canvas CSS block in `app/globals.css` (`.loom-canvas-layer`, `.loom-canvas-card*`)

### Modify

- `components/CoworkSplit.tsx` — remove `<CanvasLayer>`, keep `<ReviewThoughtMap>`,
  ⌘/ toggles map wide state via an event or prop
- `components/ReviewThoughtMap.tsx` — add `wide` state, per-thought list,
  writable cards. Gain a new internal `WideThoughtCard` component
- `components/SelectionWarp.tsx` — ⌘-click branch to capture, tooltip update
- `components/AnchorCard.tsx` (maybe) — empty-content rendering path
- `app/globals.css` — strip canvas rules, add wide-map rules

### Add

- `lib/capture/from-selection.ts` — shared selection→anchor helper
- Global shortcut listener for ⌘⇧A (in a small component mounted alongside
  SelectionWarp, or inline in SelectionWarp itself)

## Non-goals for this pivot

- Arrows/links between anchors (defer)
- Image/rich content (defer)
- Free notes not attached to any passage (defer — all captures tie to a selection)
- Drag reorder (defer — version chain + y-from-source already gives an order)

## Done when

1. Canvas files deleted, type-check clean
2. ⌘⇧A on a selection creates a thought-anchor, visible as a dot in the margin
   within one frame, no dialog
3. ⌘/ toggles ReviewThoughtMap between narrow and wide
4. Wide map shows per-thought cards, can append a new version via textarea
5. Appending a version updates the AnchorDot preview and the narrow map
   count instantly (reactive via existing trace subscription)
6. `npm run build` passes
7. macOS app installs and basic flow works end-to-end
