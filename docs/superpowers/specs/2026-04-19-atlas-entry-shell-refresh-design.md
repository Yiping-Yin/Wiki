# Atlas Entry Shell Refresh · Product Design

Status: approved design direction  
Updated: 2026-04-19

## 1. Decision

Loom will refresh the `/knowledge` entry surface on top of the **current Atlas/source-library model**, instead of trying to revive the older `feat/loom-desktop-entry-shell` branch wholesale.

The chosen direction is:

- keep the current Atlas behavior and information architecture
- keep `LLM Wiki` separate
- keep inline group management on the page
- preserve raw-source immutability messaging
- tighten the page shell and card language so Atlas feels more intentional and less diffuse
- avoid importing the old branch's outdated data assumptions

This is a **shell refresh**, not a model rewrite.

## 2. Problem

The old entry-shell branch is no longer a safe source of truth.

It was built against an earlier Atlas model where `/knowledge` was closer to:

- a grouped collection grid
- without the current source-library metadata controls
- without inline add / rename / delete / move interactions
- without the now-separate `LLM Wiki`

Trying to merge that branch directly would create the wrong failure mode:

- visually cleaner shell ideas
- but on top of stale assumptions about what the page is actually for

So the correct question is not:

- "How do we rescue the old entry-shell branch?"

It is:

- "How do we apply the still-good shell ideas to the current Atlas behavior?"

## 3. Product Goal

Atlas should feel like a **disciplined source-library room**:

- clear title and stance
- one consistent page rhythm
- grouped collections that remain easy to scan
- editing controls that are present but not visually louder than the library itself

The page should feel more deliberate without becoming dashboard-like or adding ornamental chrome.

## 4. Non-Goals

This refresh does **not**:

- change source-library grouping semantics
- change inline group CRUD behavior
- merge `LLM Wiki` back into Atlas
- remove or redesign source immutability guarantees
- change capture workflow behavior
- introduce a new global entry-shell system for all routes

This is deliberately narrower than the older desktop-entry-shell concept.

## 5. Current Reality To Preserve

The current Atlas page already has the right product structure:

- grouped raw-source collections
- inline controls for add / rename / delete / move
- counts for collections and docs
- source immutability notice
- a separated `LLM Wiki` navigation path

These are not provisional hacks anymore.  
They are the behavior the shell must serve.

## 6. Chosen Design Direction

Atlas will keep its current page-level architecture but refresh its shell in three ways:

### 6.1 Stronger Header Band

The page header should become more compact and more legible.

It will keep:

- `Atlas` eyebrow
- title
- collection/doc counts
- stance

But the visual rhythm should be tightened so the header feels like a clean room definition, not a soft hero block.

### 6.2 Collection Groups As Structured Sections

Each source-library group should read as a clear section:

- group label
- collection count
- supporting microcopy
- group-level actions

The section itself should feel lighter than today's large glass slab, but more structured than a plain list.

### 6.3 Collection Cards As Crisp Entry Tiles

Each collection tile should emphasize:

- preview swatch
- collection label
- doc count
- enter affordance

The shell should make entry feel intentional while keeping the collection preview as the real visual anchor.

## 7. Component Strategy

Do **not** port the old `entry-shell` folder directly.

Instead:

- selectively borrow layout ideas from that branch
- re-express them using the current `StageShell`, `QuietScene`, `QuietSceneIntro`, `WorkSurface`, and related primitives where possible
- only introduce new shared primitives if a gap clearly remains after trying to compose from the current system

This keeps the implementation aligned with `main`, not with the old branch's architecture.

## 8. Information Hierarchy

The refreshed Atlas page should read in this order:

1. room identity
2. room purpose
3. library-level guardrail
4. grouped source sections
5. collection entry

The visual weight should follow that same order.

What must stay visually subordinate:

- add group
- rename group
- delete group
- move-to-group controls

These are important capabilities, but they are support actions, not the main object of the page.

## 9. Interaction Rules

### 9.1 Group Controls

Keep the current inline editing approach.

Do not revert to:

- browser `prompt`
- modal-first CRUD
- detached management pages

The current inline approach is already the right interaction model for Loom.app.

### 9.2 Collection Entry

Collection cards should remain direct links into the collection.

Do not add:

- multi-step drill-ins
- extra settings menus on each tile
- secondary navigation chrome inside the card itself

### 9.3 LLM Wiki

`LLM Wiki` remains a separate navigation identity.

This refresh should not blur that distinction visually or structurally.

## 10. Visual Direction

The recommended look is:

- restrained
- compact
- high-legibility
- source-first

Specific guidance:

- reduce large empty glass surfaces
- keep section blocks visually bounded but not heavy
- let preview swatches do the atmospheric work
- keep copy short and dry
- prefer alignment and rhythm over decorative glow

This should feel closer to a careful reading desk than a gallery or dashboard.

## 11. Implementation Boundary

The first implementation pass should touch only:

- `/knowledge` page shell
- Atlas page section layout
- collection card presentation

Avoid scope creep into:

- sidebar redesign
- `/today`
- `/`
- `/browse`
- `/patterns`

If the result works, later routes can adopt compatible shell ideas separately.

## 12. Success Criteria

This refresh is successful when:

1. Atlas still supports the current source-library behaviors unchanged
2. `LLM Wiki` still reads as a separate system
3. the page feels tighter and more intentional than the current version
4. the collection preview remains the primary visual anchor
5. editing controls are easier to find but less visually noisy than the grouped collections themselves
6. the implementation lands cleanly on current `main` without reviving old branch architecture

## 13. Recommended Next Step

Write a small implementation plan against current `main`, scoped only to:

- `app/knowledge/page.tsx`
- `app/knowledge/KnowledgeHomeClient.tsx`
- `app/knowledge/KnowledgeHomeStatic.tsx`
- any truly necessary shared shell helpers

That plan should explicitly reuse the current Atlas/source-library behavior rather than reintroducing the old branch's grid assumptions.
