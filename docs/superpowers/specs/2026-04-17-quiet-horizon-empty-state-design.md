# Quiet Horizon Empty-State Design

Status: approved design direction  
Updated: 2026-04-17

## 1. Decision

Loom will adopt one shared empty-state scene language across:

- `/today`
- `/knowledge` (user-facing Atlas)
- `/patterns`

The chosen direction is:

- `Quiet Horizon`
- `Upper soft light`
- shared spatial grammar
- page-specific mood only through subtle detail shifts

This change is not a one-off gradient tweak. It is a layout-and-background contract for all top-level "quiet" states in the product.

## 2. Problem

The current top-level quiet states feel visually inconsistent and structurally loose.

Observed issues:

- Background light sits directly behind the card and competes with it.
- The card width does not read as the same column as the page heading and supporting copy.
- Different pages feel like unrelated staging setups rather than one product language.
- Empty states currently feel "pasted onto" a backdrop instead of occupying a coherent space.
- On desktop, some cards stretch too wide relative to their content density.
- On mobile, the left gutter and card body do not feel intentionally composed.

The result is not calm. It feels under-designed in some places and over-staged in others.

## 3. Product Goal

The quiet pages of Loom should feel like one environment:

- dark, spacious, grounded
- calm enough that the card becomes the foreground object
- structured enough that the page still has an architectural center
- distinctive to Loom without becoming decorative or theatrical

The user should feel:

- the page has a stable horizon
- the card is held in space, not floating on a random glow
- Today, Atlas, and Patterns belong to the same family

## 4. Scope

This design applies to the "quiet scene" surfaces for:

- Today empty / low-density working state
- Atlas intro / low-density archive state
- Patterns empty state

This design also tightens width behavior for the major quiet cards that anchor those pages, especially:

- the top `Keep this thread warm` card on `/today`
- the `Collections stay quiet until a thread warms them` intro on `/knowledge`
- the `No settled patterns yet` empty state on `/patterns`
- the `Today's weave` reflection block on `/today`

## 5. Non-Goals

This change does not:

- redesign document reading pages like `/wiki/*`
- redesign populated Atlas collection grids beyond the shared scene shell
- change card copy or CTA semantics
- change sidebar information architecture
- change the visual language of Review / Rehearsal / Examiner overlays

## 6. Alternatives Considered

### 6.1 Folded Stage

Description:

- broad editorial planes
- less cosmic, more architectural

Why not chosen:

- stronger shape language than needed
- risks turning the page into a graphic composition instead of a quiet workspace
- less compatible with the current dark Loom reading surfaces

### 6.2 Thread Field

Description:

- visible woven-grid substrate
- strongest "Loom-specific" identity

Why not chosen:

- too thematic for persistent top-level quiet pages
- the texture risks becoming the thing the user notices first
- harder to keep subtle across desktop and mobile

### 6.3 Quiet Horizon

Description:

- deep dark field
- lifted soft light near the top edge
- cards anchored to a stable central working column

Why chosen:

- solves the current "glow directly behind the card" problem
- keeps the card as the first object of attention
- scales cleanly across Today, Atlas, and Patterns
- preserves the current product's dark, reflective tone without melodrama

## 7. Chosen Visual Language

### 7.1 Shared Space

Every quiet page should read as:

- a dark floor / field
- a soft atmospheric band or bloom above the working column
- a centered content column with strong horizontal discipline

The page should not read as:

- a full-screen spotlight
- a floating modal on a stage
- a decorative hero image

### 7.2 Light Placement

The main light source moves upward.

Instead of:

- a centered radial glow behind the card

Use:

- a broad, upper-origin soft light
- feathered horizontally
- fading before it reaches the card body

This creates:

- air above the content
- depth without spotlighting
- a sense that the page is lit from a distant source rather than glowing from its center

### 7.3 Contrast Strategy

The background should be darker than it is now in the lower two-thirds of the screen.

The card should feel:

- slightly elevated
- still quiet
- visibly denser than the field behind it

The hierarchy becomes:

1. card
2. title / eyebrow
3. supporting copy
4. background atmosphere

## 8. Layout Contract

### 8.1 One Working Column

Quiet pages need a single shared column contract.

Add one reusable width token for quiet top-level scenes:

- `--quiet-scene-width`

Target behavior:

- desktop: narrower than the current working stage width
- wide enough for one substantial card and one secondary block
- clearly aligned with the page heading above it

Recommended contract:

- page shell may still span the wider stage
- quiet content inside that shell must collapse to a centered inner column

### 8.2 Today

On `/today`, these elements should share the same column:

- `TodayHeader`
- focused `QuietGuideCard`
- `SessionStatusStrip`
- `TargetResumeList`
- `Today's weave`

Current issue:

- the header feels like one width and the card another
- the card stretches too far relative to its amount of text

Required result:

- one quiet working column
- visible left/right breathing room on desktop
- CTA cluster stays within that same column, not on an ultra-wide card edge

### 8.3 Atlas

On `/knowledge`, the intro card should share the same quiet column logic.

Below that intro, the page may expand into a broader archive grid, but the intro itself should still obey the quiet-scene width.

Required result:

- intro reads as the entry sentence of the page
- not as a full-width banner

### 8.4 Patterns

On `/patterns`, the empty state should use the same quiet-scene shell as Today and Atlas.

Required result:

- no isolated card on a giant theatrical glow
- same horizon, same column, slightly deeper mood than Today

## 9. Page-Specific Differentiation

All three pages share the same structure. Differentiation is intentionally light.

### 9.1 Today

- clearest and most functional
- softest atmosphere
- highest text contrast
- smallest ambient texture

### 9.2 Atlas

- slightly more archival
- faintest grain / collection-room feel
- same horizon, slightly cooler tint handling

### 9.3 Patterns

- deepest scene
- most settled, most silent
- lower visual energy than Today

These differences must remain subordinate to the shared structure.

## 10. Component Architecture

Introduce one reusable scene wrapper for quiet pages, conceptually:

- `QuietScene`

Responsibilities:

- establishes the atmospheric background layers
- centers the quiet content column
- provides page-specific scene variants
- keeps width logic separate from card internals

Recommended API shape:

- `variant: 'today' | 'atlas' | 'patterns'`
- `children`

And one inner wrapper, conceptually:

- `QuietSceneColumn`

Responsibilities:

- constrains width
- aligns title, card, and secondary blocks
- removes repeated `width: min(...)` magic numbers from page files

## 11. CSS / Token Plan

### 11.1 New Tokens

Add a small set of scene tokens, for example:

- `--quiet-scene-width`
- `--quiet-horizon-top`
- `--quiet-horizon-bottom`
- `--quiet-horizon-glow`

### 11.2 New Background Layers

Replace the current "one bright blob behind the card" feel with layered gradients:

- upper soft atmospheric bloom
- wide low-contrast horizon band
- deep floor fade in the lower page

Important:

- no hard centered ellipse
- no white-hot radial center
- no glow touching the card edges directly

### 11.3 Existing Global Layers

`loom-grain` and `loom-vignette` remain global, but the quiet pages should not depend on them for identity.

They should become:

- subtle support layers

not:

- the main look of the page

## 12. Implementation Boundaries

Implementation should be done by:

1. creating the reusable quiet scene wrappers
2. introducing the shared width token
3. migrating `/today`, `/knowledge`, and `/patterns` to use them
4. removing page-specific width hacks where they are now duplicated

Do not:

- bake page-specific background logic into `QuietGuideCard`
- solve this with one-off inline styles in each page
- make `WorkSurface` own quiet-page scene geometry

`QuietGuideCard` is a card primitive, not a page layout system.

## 13. Responsive Behavior

### Desktop

- the quiet column must remain visually central within the content area
- cards should never feel banner-wide
- the atmosphere can be wider than the column, but only subtly

### Tablet

- keep the same horizon idea
- reduce the horizontal spread of the top glow
- maintain one obvious column

### Mobile

- remove any feeling of left-edge clipping against the sidebar gutter
- card width should be near full width minus stable page padding
- top atmosphere should remain visible, but much shallower vertically

## 14. Success Criteria

The redesign is successful if:

- Today, Atlas, and Patterns empty / quiet states feel like one family
- the card is the primary object, not the background
- the title, card, and follow-on content align to one readable column
- desktop screenshots no longer show oversized banner-like cards
- mobile screenshots no longer feel left-clipped or compositionally accidental

## 15. Validation Plan

Validate with screenshots for:

- `/today` with one focused thread
- `/today` empty state
- `/knowledge` intro state
- `/patterns` empty state
- mobile widths for all three

Check specifically:

- card width vs. heading width
- amount of empty space left and right of the card
- whether the upper light stays above the card instead of behind it
- whether any page feels visually louder than the others

## 16. Recommended First Implementation Slice

Implement in this order:

1. shared quiet-scene wrapper + tokens
2. `/today` top section and weave block
3. `/knowledge` intro section
4. `/patterns` empty state
5. responsive tuning

This keeps the change coherent and makes visual QA faster.
