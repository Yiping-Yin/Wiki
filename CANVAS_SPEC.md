# Canvas Specification

> ⚠️ **SUPERSEDED 2026-04-11 later that evening** by `CAPTURE_SPEC.md`.
> Canvas Stage 0 was built per this spec, then judged a wrong direction
> after user feedback ("增加了很多操作负担") and external research. The
> free-form 2D workspace model is abandoned in favor of content-first
> capture + deepened ReviewThoughtMap. See `memory/project_canvas_pivot.md`
> for the full rationale. Do not implement from this file.

**Status**: Pre-implementation design spec for Stage 0
**Written**: 2026-04-11 evening
**Owner**: single-user project (self)
**Scope**: Canvas surface triggered by `⌘/`, replacing the current `ReviewSheet` content. Inline `LiveArtifact` at doc bottom is unchanged.

---

## 0. Context

Loom has a missing cognitive layer. Today it has:

- **Source document** (long-term memory / input)
- **Anchored thoughts** (committed understanding, rendered inline at doc bottom via `LiveArtifact`)
- **Kesi** (`/kesi`, the archival output of crystallized panels)

What's missing: a **working memory / thinking canvas** — a place where raw, in-progress, spatial thinking can happen *about* the current document without committing immediately to an anchored form.

The Canvas is that layer. It is the most malleable form of thinking externalization — where draft ideas, quotes, screenshots, mathematical derivations, code snippets, and meta-thoughts can be freely positioned, edited, and recombined before (or alongside) committing to structured output.

---

## 1. North Star

**Canvas is the high-malleability endpoint of thinking externalization.**

Every externalization tool sits on a spectrum:
- Paper draft (low — changes are destructive)
- Typed document (medium — linear edit)
- Outliner (medium-high — structural edit)
- **Canvas (high — position, content, type, connection all manipulable at near-zero friction)**

Canvas's distinctness is not that it "feels like the brain" (a non-operational framing). It is that it **maximizes malleability** — so that manipulating externalized thoughts feels nearly as frictionless as manipulating thoughts inside your head.

### The design filter

Every proposed canvas feature must pass:

> **Does this raise malleability, or lower it?**

- Raises → consider adopting. Examples: free drag, drop, edit, undo, resize, connections, dynamic content types.
- Lowers → reject, even if "useful". Examples: snap-to-grid, fixed item types, confirmation dialogs, forced linearity, read-only modes, mandatory metadata fields.

---

## 2. Architectural principle: kesi rows with broken wefts

This spec's development model follows kesi (缂丝) craft.

**Row-by-row weaving**: each Stage of development (Stage 0, 1, 2...) is a horizontal row. Each row advances every dimension (data model, rendering, interaction, animation, persistence, polish) by a small amount. Rows are thin slices across the full feature. No stage "completes" one dimension while ignoring others.

**Broken wefts enable local repair**: each dimension is structurally independent — data model can be revised without touching rendering; animation can be tweaked without touching persistence. This is already true of Loom's architecture (append-only trace events, isolated React components, CSS class scoping). Canvas development explicitly relies on this property: any Stage 0 decision that turns out wrong can be repaired in Stage 1+ without unraveling the rest.

**Consequence for this spec**: Stage 0 decisions are deliberate but not precious. Hold the whole vision, weave one row, repair locally when needed.

---

## 3. Form decision: β + γ-loose

### β · z-stack overlay

Canvas lives as a layer above the document:

- Triggered by `⌘/` (same key that currently triggers review mode)
- When active: document receeds via existing `body.loom-study-mode` CSS treatment (opacity 0.15, scale 0.97, translateY 6, blur 1)
- Canvas layer fades in above the receded document
- When inactive: canvas layer is **completely hidden** — zero ambient chrome. This is a hard constraint from Loom's §1 focus promise.

### γ-loose · source-anchored by default, draggable override

- Canvas items have y coordinates that **default to their source document y position** (if applicable)
- User can drag items freely in 2D to any position — y anchoring is NOT enforced at drag time
- Original `sourceY` is preserved in item metadata regardless of current visual position
- Vertical scroll in canvas mode is **synced with document scroll** (they share y coordinate space)

### Why this form

Alternatives considered and rejected:

- **Side-by-side slide (C)** — introduces new layout grammar when Loom already uses z-stack via review mode; unnecessary divergence
- **Always-visible ambient canvas (α)** — violates focus promise; permanent overlay adds visual noise
- **Pure continuous 2D space (Figma-style)** — conflicts with doc-centric DNA; 2x+ implementation cost; overkill for per-document thinking
- **Strict anchoring (γ-strict)** — lowers malleability; fails composition across sections; is a subset of γ-loose

β + γ-loose combines: natural continuity with existing Loom (z-stack), source-grounded default (γ), complete freedom when needed (loose override).

---

## 4. Shutter pattern (entrance/exit animation)

Canvas inherits Loom's existing mode-transition grammar. See `/Users/yinyiping/.claude/projects/-Users-yinyiping/memory/feedback_shutter_pattern.md` for the full pattern description.

### Doc recede (existing, unchanged)

`app/globals.css:252-264`:

```css
body.loom-study-mode main .loom-source-prose {
  opacity: 0.15;
  transform: scale(0.97) translateY(6px);
  filter: blur(1px);
  transition:
    opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}
```

**Do not modify.** Canvas reuses this exactly.

### Canvas pop-out (new, complementary)

```css
.loom-canvas-layer {
  position: fixed;
  inset: 0;
  z-index: 80;
  opacity: 0;
  transform: scale(1.04);
  filter: blur(4px);
  pointer-events: none;
  transition:
    opacity 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1),
    filter 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

body.loom-study-mode .loom-canvas-layer {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
  pointer-events: auto;
}
```

- Duration: 400ms (matches doc recede for synchronized motion)
- Opacity + transform use spring-ease (`cubic-bezier(0.34, 1.56, 0.64, 1)`) — slight overshoot for "pop-out" confidence
- Blur uses standard `cubic-bezier(0.22, 1, 0.36, 1)` to match doc recede's focus language
- Start state: scale **1.04** (larger, defocused) → scale 1 (focused, precise). This is the "camera focus acquisition" metaphor. Starting smaller would imply growth; starting larger implies focus.

### Exit

Pure reverse. Canvas returns to scale 1.04 + blur 4 + opacity 0; doc unreceеdes. Same 400ms, same curves. **Symmetry is mandatory.**

---

## 5. Leica-grade interaction quality

See `/Users/yinyiping/.claude/projects/-Users-yinyiping/memory/feedback_leica_reassurance.md`.

Every interaction must answer its own anxiety **during the action**, not with post-hoc labels. Stage 0 requires the following micro-animations:

| Action | Micro-animation |
|---|---|
| Grab item (mousedown) | Item `transform: scale(1.02)` + shadow `0 8px 24px rgba(0,0,0,0.14)` (from `0 2px 8px rgba(0,0,0,0.08)`) + 100ms ease. Cursor: grabbing. |
| Drag item | `transform: translate3d(...)` follows cursor with zero delay. Original position shows a "ghost" at opacity 0.2, same size, same shape — the "if you undo, it returns here" promise. |
| Drop item (mouseup) | Ghost disappears. Item settles: `transform: scale(1)` + shadow returns to default, 80ms `cubic-bezier(0.34, 1.56, 0.64, 1)` (spring with slight overshoot). |
| Create item (double-click empty) | A radial pulse at the click point (0.2s, ~40px radius, opacity 0.3 → 0). New item appears: scale(0.9) + opacity 0 → scale(1) + opacity 1, 0.2s spring. Cursor auto-enters edit mode (focus textarea). |
| Delete item — first click (arm) | × button turns to accent-red background + inner text "delete?" + a 3-second countdown ring around the button (SVG stroke-dashoffset animation). If second click within 3s: execute. Else: auto-cancel, button returns to normal. |
| Delete item — second click (confirm) | Item: `transform: scale(0.9)` + opacity 0 + 150ms ease-out. Then removed from DOM. |
| Edit item — enter edit mode | Item grows slightly (scale 1.01 + shadow +1px), content area becomes a focused `<textarea>`. No visible "mode indicator" — the scale change IS the indicator. |
| Edit item — exit edit mode (Esc or blur) | Item returns to scale 1 with a gentle +5% overshoot bounce (80ms). The bounce is the "saved" signal. No toast. |
| Undo (⌘Z) | Items reverse-animate to their previous state. Not teleport. Same motion curves as forward actions. |
| Redo (⌘⇧Z) | Symmetric to undo. |
| Enter canvas (⌘/) | Shutter pattern (section 4). |
| Exit canvas (⌘/ again or Esc) | Shutter pattern in reverse. |

**Rule**: if any of these feels "cheap" during Stage 0 implementation, stop and polish it before moving on. The craft of each micro-animation is Stage 0's quality bar, not a Stage 1 polish pass.

---

## 6. Data model

### Item type

```typescript
// components/canvas-model.ts (new file)

export type CanvasItemKind = 'note' | 'anchor-link';

export interface CanvasItem {
  /** Stable id, format: `ci_<timestamp>_<random>` */
  id: string;
  /** Which doc this item belongs to. Canvas is per-doc. */
  docId: string;
  /** Current x coordinate (pixels from canvas left edge) */
  x: number;
  /** Current y coordinate (pixels from canvas top, matches doc y) */
  y: number;
  /** Optional explicit width. If undefined, card auto-sizes to content. */
  width?: number;
  /** Markdown content, rendered via NoteRenderer */
  content: string;
  /** When the item was first created (version 1) */
  createdAt: number;
  /** Most recent update (any edit or move) */
  updatedAt: number;
  /** Item kind. 'note' = user-created free text. 'anchor-link' = linked to a source-doc thought-anchor. */
  kind: CanvasItemKind;
  /** If kind === 'anchor-link', this is the anchor's id in the source doc */
  sourceAnchorId?: string;
  /** The original y position where this item was created, for "return to source" action */
  sourceY?: number;
}
```

### Trace event schema

Canvas items are stored as events inside the existing `Trace` structure for the same doc. This reuses all existing IndexedDB infrastructure (`useTracesForDoc`, `appendEvent`, `removeEvents`, change propagation) with zero new store.

Add to `lib/trace/types.ts` → `TraceEvent` union:

```typescript
| {
    kind: 'canvas-item';
    /** Action: create, update, or delete */
    action: 'create' | 'update' | 'delete';
    /** The full item state (for create/update) or just id (for delete) */
    item: CanvasItem | { id: string };
    at: number;
  }
```

### Read path

`useCanvasItems(docId)` hook:

1. Get trace for doc (via `useTracesForDoc`)
2. Walk events, accumulating state per item id:
   - `create` → add item to map
   - `update` → replace item in map
   - `delete` → remove item from map
3. Return final map → array of items
4. Items are rendered in order of `createdAt` (older items render first, so newer items are on top in z-order when overlapping)

### Write path

Every user action that mutates canvas state appends a new event:

- Create: append `{kind: 'canvas-item', action: 'create', item: <full item>, at: Date.now()}`
- Move/resize/edit content: append `{kind: 'canvas-item', action: 'update', item: <full item>, at: Date.now()}`
- Delete: append `{kind: 'canvas-item', action: 'delete', item: {id}, at: Date.now()}`

**This is append-only**. To undo, we DO NOT mutate past events — we append a reverse event (e.g., undo a delete = append a create with the old item). This preserves Loom's event-log purity and supports unlimited undo history naturally.

### Migration on first canvas open

When user first presses `⌘/` on a doc that has existing `thought-anchor` events but no `canvas-item` events:

1. Scan thought-anchor events (via existing `buildThoughtAnchorViewsFromTraces`)
2. For each anchor container (each unique anchorId with latest event), generate a synthetic `canvas-item` event:
   - `kind: 'anchor-link'`
   - `sourceAnchorId: <anchor's id>`
   - `content: <anchor's latest version summary + content>`
   - `y: <source y>`
   - `sourceY: <source y>`
   - `x: <right edge of doc stage + 48px>` (out of the way but near source)
3. These synthetic events are written to the trace, making them indistinguishable from "real" canvas items going forward

This means the first canvas open for a doc with anchors is **never empty** — it's auto-populated with the user's prior thinking.

---

## 7. Component map

### New files

- **`components/CanvasLayer.tsx`** — the overlay layer. Manages enter/exit animation state, wraps CanvasCards, owns canvas-level event listeners (double-click to create, click-away to deselect, keyboard shortcuts).
- **`components/CanvasCard.tsx`** — a single draggable/editable item. Uses `NoteRenderer` for non-editing state; `<textarea>` for editing state. Handles its own drag, delete, edit interactions.
- **`components/canvas-model.ts`** — TypeScript types and the `useCanvasItems(docId)` hook.
- **`lib/trace/canvas.ts`** — helper functions: `appendCanvasCreate`, `appendCanvasUpdate`, `appendCanvasDelete`, `migrateAnchorsToCanvas`.

### Modified files

- **`components/CoworkSplit.tsx`** — render `<CanvasLayer />` instead of `<ReviewSheet />`. Keep the `⌘/` listener and `body.loom-study-mode` class toggle.
- **`lib/trace/types.ts`** — add `canvas-item` to `TraceEvent` union.
- **`app/globals.css`** — add `.loom-canvas-layer` rules (see section 4). Add canvas-active adjustments for sidebars (`body.loom-study-mode .toc` and `.doc-outline` get further opacity reduction or stay at current recede).

### Deleted files

- **`components/ReviewSheet.tsx`** — the ⌘/ overlay slot is taken by canvas. Its data (anchor containers) remains visible in `LiveArtifact` inline and in canvas as auto-populated items.

---

## 8. Keyboard shortcuts

Stage 0 requires complete keyboard operability.

| Shortcut | Action |
|---|---|
| `⌘/` | Toggle canvas layer (enter or exit) |
| `Esc` | Exit canvas OR exit editing an item (if currently editing) |
| `Double-click empty space` | Create new note item at click point |
| `⌘N` | Create new note item at current viewport center |
| `Single-click item` | Select item (future: show select indicator; Stage 0: same as no-op, but cursor changes) |
| `Double-click item OR Enter (when selected)` | Enter edit mode |
| `Esc (when editing)` | Exit edit mode, save content |
| `⌘Enter (when editing)` | Also exit edit mode, save content |
| `Tab` | Cycle focus between items (creation order) |
| `Drag` | Move item |
| `Click × OR Backspace (when selected)` | Arm delete (first press) |
| `Click × again OR Backspace again (within 3s)` | Confirm delete |
| `⌘Z` | Undo last action |
| `⌘⇧Z` / `⌘Y` | Redo |

---

## 9. Visual specs

### Canvas layer

- **z-index**: 80
- **Background**: transparent (so receded doc shows through)
- **Dot grid** (optional, ~2 lines of CSS): `background-image: radial-gradient(circle, rgba(var(--fg-rgb), 0.03) 1px, transparent 1px); background-size: 24px 24px;`

### Canvas item (default card)

- **Container**: `<section>` or `<div>` with `position: absolute`, `left: {x}px`, `top: {y}px`
- **Min width**: 240px
- **Max width**: 480px
- **Auto-height** (content-sized)
- **Padding**: 14px 18px
- **Border-radius**: 12px
- **Background**: `var(--bg-elevated)`
- **Border**: `0.5px solid rgba(var(--fg-rgb), 0.08)`
- **Shadow (default)**: `0 2px 8px rgba(0, 0, 0, 0.08)`
- **Shadow (dragging)**: `0 8px 24px rgba(0, 0, 0, 0.14)` + `transform: scale(1.02)`
- **Shadow (hover)**: `0 4px 12px rgba(0, 0, 0, 0.10)` (subtle lift)
- **Font**: `var(--display)` (inherits Apple SF Pro from Loom)
- **Line-height**: 1.55
- **Content**: rendered via `NoteRenderer` (inherits full markdown + KaTeX + Prism support)

### Canvas item (editing state)

- **Content area**: `<textarea>` with same padding/font as default
- **Border**: `0.5px solid var(--accent)` (subtle active state)
- **Background**: `var(--bg-elevated)` (same)
- **Textarea auto-sizes** to content (min 40px, max 400px)

### Delete button (visible on hover or when selected)

- **Position**: absolute, top-right of card, 6px inset
- **Default**: `×` glyph, color `var(--muted)`, opacity 0.42, size 14px
- **Hover (unarmed)**: color `var(--tint-red)`, opacity 1
- **Armed (first click)**: background `var(--tint-red)`, color white, text `"delete?"` (small), with 3s countdown ring in SVG around the button. Auto-cancel if 3s pass without second click.

### Dark mode

All colors use CSS variables (`var(--bg-elevated)`, `var(--fg-rgb)`, etc.) — automatic dark mode support. No special casing required.

### Reduced motion

Respect `@media (prefers-reduced-motion: reduce)`:

- Disable overshoot springs, use linear 200ms transitions instead
- Disable dot grid (it's animation-adjacent via blur during transitions)
- Disable radial pulse on create
- Shutter animation times drop to 150ms linear

---

## 10. Interaction flows

### Flow 1: Enter canvas

1. User reads doc, anchors are visible as `◆` dots in margin
2. User presses `⌘/`
3. `CoworkSplit` catches the key, calls `setCanvasActive(true)`
4. `body.loom-study-mode` class is added
5. CSS kicks in:
   - Doc recedes (400ms shutter)
   - `.loom-canvas-layer` fades in (400ms spring)
6. `CanvasLayer` mounts (or unhides), loads items via `useCanvasItems(docId)`
7. If first-time open for this doc and anchors exist: migration runs, synthetic canvas-item events created
8. Items render at their `(x, y)` positions

Total time from key press to canvas interactive: **400ms**, optimistic UI (canvas accepts input immediately even during the animation).

### Flow 2: Create a new note

1. User double-clicks empty canvas area
2. Radial pulse plays at click point (0.2s)
3. New `CanvasCard` appears at click point with scale 0.9 → 1, opacity 0 → 1 over 0.2s
4. Textarea is focused immediately
5. User types markdown content
6. On blur or Esc:
   - Card exits edit mode with subtle scale bounce (80ms)
   - `appendCanvasCreate` writes event to trace
7. Card is now persistent

### Flow 3: Drag an item

1. User mousedowns on card
2. Card enters "grabbed" state: scale 1.02, shadow +2 (100ms ease)
3. A ghost div appears at the original (x, y), opacity 0.2, same shape
4. As user moves the mouse, card's `transform: translate3d(dx, dy, 0)` follows cursor with zero delay (no transition during drag)
5. On mouseup:
   - Card's new `(x, y)` is computed
   - `appendCanvasUpdate` writes event
   - Ghost disappears
   - Card settles: `transform: scale(1)`, shadow returns to default, 80ms spring
6. Item is now at new position

### Flow 4: Edit an item

1. User double-clicks an existing card
2. Card's content area transforms from `NoteRenderer` output to a `<textarea>` with the same markdown source
3. Textarea is focused
4. User edits markdown
5. On Esc, blur, or `⌘Enter`:
   - Textarea is replaced by `NoteRenderer` again with new content
   - Card does a subtle scale bounce (1.01 overshoot, 80ms)
   - `appendCanvasUpdate` writes event

### Flow 5: Delete an item

1. User hovers over card → × button becomes visible
2. User clicks × → button arms: red bg, "delete?" text, 3s countdown ring begins
3. Two paths:
   - **Path A (confirm)**: user clicks × again within 3s → card collapses (scale 0.9 + opacity 0, 150ms) → `appendCanvasDelete` writes event → card removed
   - **Path B (cancel)**: 3s pass without second click → button returns to default state, no action

Alternative: press Backspace when card is selected (same arm-then-confirm two-step).

### Flow 6: Undo

1. User presses `⌘Z`
2. Canvas finds the most recent canvas-item event in the trace
3. Computes reverse action:
   - Create → delete
   - Update → update with previous state (requires keeping history in memory or walking trace)
   - Delete → create with old item
4. Appends the reverse event
5. Items animate to their new state (same curves as forward action, giving reverse motion)

Undo stack depth: unlimited in principle (since trace is append-only, every past state is recoverable). Stage 0 implementation may limit to latest 50 for performance.

### Flow 7: Exit canvas

1. User presses `⌘/` or Esc
2. `body.loom-study-mode` class is removed
3. Canvas layer fades out (400ms, reverse of entry)
4. Doc un-receeds (400ms, reverse of its entry)
5. After 400ms, `CanvasLayer` unmounts (or stays hidden with `display: none`)
6. User returns to reading mode; their scroll position is unchanged

---

## 11. Acceptance criteria

Stage 0 is "done" when all of the following are true:

### Functional
- [ ] Pressing `⌘/` enters canvas mode; pressing again exits; pressing `Esc` exits
- [ ] Double-clicking empty canvas creates a new note at click point with textarea focused
- [ ] Typing markdown in a note renders via `NoteRenderer` on blur/Esc
- [ ] Dragging a note moves it smoothly; new position persists across canvas re-entry
- [ ] Delete button on a note arms with countdown, then executes on second click
- [ ] Backspace on selected note works the same as × button
- [ ] `⌘Z` undoes the most recent create/update/delete
- [ ] `⌘⇧Z` redoes
- [ ] Existing anchor containers auto-populate as canvas-linked items on first canvas open for a doc
- [ ] Canvas items persist across page reloads (via IndexedDB trace events)
- [ ] `NoteRenderer` handles LaTeX, code blocks, markdown links, images within canvas items

### Visual
- [ ] Shutter animation (doc recede + canvas pop-out) matches specs in section 4
- [ ] Items have Craft-style rounded cards with subtle shadow (section 9)
- [ ] Dark mode works without special casing
- [ ] `prefers-reduced-motion` disables overshoot springs
- [ ] When canvas is inactive, there is no ambient overlay whatsoever

### Leica-grade
- [ ] Drag has lift-on-grab, follows cursor with zero delay, spring-settles on drop
- [ ] Create has radial pulse + bloom animation
- [ ] Delete arm shows countdown ring
- [ ] Edit enter/exit has subtle scale bounces
- [ ] No toasts, no confirmation modals, no "Are you sure?" dialogs
- [ ] No visible error messages for normal operations

### Integration
- [ ] `ReviewSheet.tsx` is deleted
- [ ] `CoworkSplit.tsx` renders `CanvasLayer` instead
- [ ] Inline `LiveArtifact` at doc bottom is untouched
- [ ] `AnchorDot` is hidden in canvas mode
- [ ] Sidebars (`.toc`, `.doc-outline`) recede in canvas mode (final opacity TBD)
- [ ] Passing `tsc --noEmit` with zero errors
- [ ] `npm run build` succeeds
- [ ] Opening Loom.app, navigating to a wiki page with existing anchors, pressing ⌘/ shows the canvas with auto-populated items

---

## 12. Open questions (deferred to later stages)

These are known gaps in Stage 0 that may or may not need solving in later stages:

1. **Sparse section handling**: if source doc has a 3000-word section with 1 anchor, canvas has a huge empty region. Possible Stage 1+ fix: "elastic density compression" mode.
2. **Cross-section clustering**: items from different source sections can't be visually grouped without breaking anchoring. Possible Stage 1+ fix: "gather mode" temporary unanchor.
3. **Cross-document items**: no source y in current doc for thoughts that reference other docs. Possible Stage 2+ fix: "free zone" or cross-doc canvas references.
4. **Multi-item same-y overlap**: 10 anchors at section 3 all get y=sourceY, so they overlap horizontally. Stage 0 lets them overlap (user drags to resolve). Stage 1+ could add auto-cascade.
5. **Connection lines between items**: deferred to Stage 3. Spatial proximity is the only relationship Stage 0 supports.
6. **Image paste from clipboard**: deferred to Stage 1. Stage 0 supports images only via markdown URL syntax in item content.
7. **Selection of text inside a canvas item to create a new canvas item**: deferred to Stage 2.
8. **Canvas → LiveArtifact synthesis**: the "final form" compilation from canvas state to inline LiveArtifact. Deferred to Stage 4. Stage 0 treats canvas and inline LiveArtifact as parallel views of the same data.
9. **Search within canvas**: deferred to Stage 5+.
10. **Multi-select and group-drag**: deferred. Stage 0 only supports single-item interaction.

Per the kesi principle, these are not blockers. They are known limitations of the current row. Each can be repaired in a later row without unraveling Stage 0.

---

## 13. Staging roadmap

Each stage is a kesi row — thin slice across all dimensions, additive, locally repairable.

### Stage 0 (this spec)
Minimum viable canvas. 6 actions, shutter animation, auto-populated anchors, full keyboard support, Leica-grade micro-interactions on key moments.

### Stage 1
- Clipboard image paste → base64 data URL in markdown
- Snap hints (not forced) when dragging near another item
- Multi-select with shift-click, group-drag
- Canvas item resize handles (bottom-right corner)

### Stage 2
- Drag text from source doc → creates new anchor-linked canvas item (reuses ChatFocus anchor-id logic)
- Canvas items can deep-link to their source: click the item's source indicator to scroll doc to that passage
- Text selection within canvas items to create quotes

### Stage 3
- Manual connection lines between items (drawn by dragging from item edge to another item)
- Line labels (a word or two to annotate the relationship)
- Visual grouping via proximity detection (items within 40px get a shared subtle background)

### Stage 4
- AI synthesis: canvas state → inline LiveArtifact draft
- The user curates canvas, presses a "compile" action, AI reads everything and produces a structured draft for the inline LiveArtifact
- User edits the draft, then commits it (replaces LiveArtifact content)
- This closes the loop: working memory (canvas) → consolidated output (LiveArtifact) → archive (/kesi via crystallize)

### Stage 5+
- Groups / frames / labeled regions
- Cross-doc inspiration suggestions (canvas items from other docs that relate to current doc's content)
- Undo tree (not just linear undo stack)
- Search within canvas items
- Elastic density compression for sparse sections
- Free zone for non-source-anchored items

---

## 14. Out of scope for all stages

These are things canvas will **never** be:

- A collaborative whiteboard (Miro, FigJam) — canvas is single-user
- A structured database (Notion, Airtable) — canvas is spatial, not relational
- A presentation tool — canvas is for thinking, not presenting
- A drawing tool — canvas holds markdown content, not freeform pixels
- A global workspace — canvas is strictly per-doc
- An infinite zoomable canvas (Figma) — canvas has bounded y (matches doc height) and practical x bounds

These exclusions are not limitations — they are the definition of what canvas is. Every feature request must pass "is this compatible with a per-doc, single-user, spatial markdown workbench?"

---

## 15. Implementation notes

### Performance

- With ~50 items, a naive re-render on every drag frame is fine
- With 100-500 items, consider:
  - `transform` only during drag (don't update stored position until drop)
  - Virtualize non-visible items (don't render items whose y is far outside viewport)
  - Memoize NoteRenderer output per item

### Persistence

- Trace store uses IndexedDB (existing)
- Canvas events append to the same trace as anchored thoughts (existing `useTracesForDoc`)
- No schema migration required (`DB_VERSION` stays at 1 since `TraceEvent` is internal to the trace's events array)
- Read path: `useCanvasItems(docId)` walks events, computes current state, memoized by trace change

### Error handling (per UX standard error tiers)

- Trace read failure → silent self-heal (retry, then fall back to empty canvas)
- Canvas render crash → error boundary shows "Canvas temporarily unavailable, press Esc" with one-button recovery (clear canvas state for this session only)
- Item content unreadable → render item with placeholder `[unreadable content]` and a recovery button that dumps raw content to clipboard

### Testing approach

Stage 0 tests should focus on:
1. Enter/exit canvas mode
2. Create/edit/drag/delete via simulated events
3. Undo/redo correctness (state after N undos equals state before N corresponding forward actions)
4. Trace event schema validation (malformed events should not crash)
5. First-open migration (anchors correctly become canvas items)

No integration tests for animation timing. Visual/animation quality is a human review pass.

---

## 16. References to related memory

- `project_canvas_workspace.md` — high-level design direction and the 9 locked decisions
- `feedback_shutter_pattern.md` — animation pattern details
- `feedback_leica_reassurance.md` — interaction quality philosophy
- `feedback_design_references.md` — 10 products whose solutions inform Stage 0
- `feedback_ux_standard.md` — the 3 don'ts + 1 do filter
- `feedback_preserve_and_deepen.md` — the three-condition test for replacements
- `feedback_two_phases.md` — explore fast, execute slow
- `project_thought_model.md` — the anchor container / version chain model (canvas inherits this as one item type)

---

## 17. Stop conditions

Stage 0 is allowed to be imperfect. Stop and ship when:

1. All acceptance criteria in section 11 pass
2. The user (me) uses it on 3 real docs and the experience "feels right" (Leica grade)
3. No P0 bugs (crashes, data loss, unrecoverable states)

Do NOT stop to add Stage 1+ features during Stage 0. The kesi principle: finish this row, then start the next. Each row is a locally-repairable unit. If a Stage 0 decision turns out wrong in practice, Stage 1 will repair it — without unraveling the row that's already woven.

---

*End of spec. Next action: implement Stage 0.*
