# Loom Desktop Entry Shell · Product Design

Status: approved current shell direction  
Updated: 2026-04-17

## 1. Decision

Loom will introduce a unified **desktop entry shell** for all top-level entry routes.

The first iteration covers:

- `/`
- `/today`
- `/knowledge`
- `/browse`
- `/patterns`
- the global desktop `Sidebar`

This is a shell-level redesign, not a brand reset and not a reading-surface rewrite.

The chosen direction is:

- preserve the current quiet, restrained, non-gamified product character
- allow layout restructuring of desktop entry pages
- unify shell primitives across top-level routes
- prioritize desktop behavior and hierarchy first
- avoid large visual-language drift

## 2. Product Goal

Loom's top-level routes should feel like **different rooms inside one system**, not like separate pages that happened to be designed at different times.

The user should be able to move between `/`, `/today`, `/knowledge`, `/browse`, and `/patterns` and retain a stable sense of:

- where they are
- what kind of page they are on
- what the primary action or reading mode is on that page
- how to move to a neighboring room without re-learning the interface

The shell should provide this continuity.

## 3. Current Problem

The current desktop experience has four competing visual grammars:

- `HomeClient` uses a workbench card language
- `/knowledge` uses quiet collection cards with a soft hero
- `/browse` uses a stripped text-index language
- `Sidebar` behaves like a dense mixed tree containing top-level navigation, contextual navigation, and utility links

This creates three product problems:

1. **Room-switching feels discontinuous**
   - the user changes routes and the product appears to change its layout logic, not just its content

2. **Hierarchy is too soft**
   - the shell is quiet, but also too diffuse
   - titles, grouping, navigation state, and action affordances often collapse into the same contrast band

3. **Density is inconsistent**
   - some entry pages feel too airy and under-committed
   - others feel too collapsed into text rows
   - the result is not calm consistency, but visual drift

## 4. Chosen Shell Model

Loom's desktop top-level routes will be organized into one shell system with three page archetypes:

1. **Desk**
   - for `/`
   - for `/today`
   - purpose: foreground object, current return, active thread, work queue

2. **Atlas**
   - for `/knowledge`
   - purpose: grouped collection entry and collection navigation

3. **Index**
   - for `/browse`
   - and initially for the shell framing around `/patterns`
   - purpose: fast scanning, filtering, and low-friction lookup

These are not separate design systems. They are variants of the same shell.

## 5. Shared Page Skeleton

Every top-level entry page should use the same high-level structure:

1. `eyebrow`
2. `title`
3. `stance`
4. `utility row`
5. `primary surface`
6. `secondary surfaces`

This skeleton establishes continuity across routes while allowing each route to vary in density and emphasis.

### 5.1 Eyebrow

The eyebrow names the room or mode succinctly:

- `Observation deck`
- `Today`
- `Atlas`
- `Browse`
- `Patterns`

The eyebrow is not decorative. It is the first structural cue in each room.

### 5.2 Title

The title states the page's current purpose. It should be short and foreground the page's role, not a product slogan.

### 5.3 Stance

The stance is a one-sentence framing line that explains how to use the room.

It should:

- explain the room's logic
- remain short
- avoid ornamental metaphor stacking
- not duplicate the title

### 5.4 Utility Row

The utility row contains route-specific tools and metadata such as:

- search
- counts
- filters
- light actions
- state summaries

This row should be visually consistent across rooms even when its contents differ.

### 5.5 Primary and Secondary Surfaces

Each entry page should make one surface clearly primary.

The shell should not present multiple hero-scale surfaces with equal visual weight. Calmness in Loom should come from controlled emphasis, not from making everything equally soft.

## 6. Sidebar Redesign

The desktop `Sidebar` becomes the product's stable frame, not a mixed-density content dump.

It will be reorganized into four fixed layers.

### 6.1 Identity Rail

The top of the sidebar establishes product identity and shell ownership.

It contains:

- the Loom identity mark
- one restrained shell-level control if needed

It does not also behave like a tool cluster.

### 6.2 Primary Navigation

This is the stable top-level route set:

- `/`
- `/today`
- `/knowledge`
- `/patterns`
- `/browse`

This must be the strongest navigation layer in the sidebar.

The current route must be obvious through:

- stronger text weight
- more stable background treatment
- a clearer active marker
- less reliance on faint tint alone

### 6.3 Context Stacks

Context stacks contain route-adjacent secondary navigation:

- Atlas category stacks
- LLM reference stacks
- future route-specific secondary groups

These should not all remain expanded by default.

The shell should default to:

- expand the context stack most relevant to the current route
- keep unrelated stacks collapsed or visually quieter

This prevents the sidebar from behaving like a permanently overlong document outline.

### 6.4 Utility Footer

Low-frequency utility links belong in a distinct footer region.

This includes links such as:

- `About`
- `Help`
- other non-primary shell utilities

They should not visually compete with route navigation.

## 7. Route-Specific Restructuring

### 7.1 `/` — Desk

`/` becomes the main desk entry, not a soft collection of equally important cards.

Its structure becomes:

- compact page header
- one clearly primary foreground surface
- one supporting column or lower band for secondary state

The primary surface should contain:

- the current best return or foreground thread
- why-now context
- no more than two strong actions

Secondary surfaces may contain:

- recent threads
- resolved outcomes
- queue state

These should support the foreground object, not compete with it.

### 7.2 `/today` — Desk / Today Variant

`/today` remains non-gamified and anti-dashboard.

It should share the same shell grammar as `/`, but with a different content emphasis:

- today's reading returns
- today's pinned or deferred work
- lightweight session continuity

The goal is not to make `/today` look different for the sake of novelty. The goal is to make it feel like a more time-scoped room within the same desk system.

### 7.3 `/knowledge` — Atlas

`/knowledge` becomes the main Atlas entry surface.

The new structure is:

- compact `Atlas` header with counts and short stance
- grouped collection sections
- denser, more purposeful collection cards

The current problems to solve are:

- hero summary is too soft relative to the page's actual work
- group headers and cards share too little hierarchy separation
- cards are slightly too tall and too empty for their information load

The new Atlas should feel calm but unmistakably interactive.

### 7.4 `/browse` — Index

`/browse` stays quieter than `/knowledge`, but it should no longer feel visually disconnected from the rest of Loom.

The new structure is:

- shared entry header
- utility row with integrated search
- list sections built from the same shell rhythm as other entry pages

`/browse` remains a text-forward index. It should not be decorated into a card wall.

### 7.5 `/patterns`

`/patterns` enters the shell system in the first pass even if its internal content stays largely intact.

First iteration expectations:

- adopt the shared desktop entry header
- adopt shared section spacing and utility rhythm
- ensure the page reads as a Loom room, not a standalone view

The internal pattern-specific content language can evolve later.

## 8. New Shell Primitives

The first iteration should introduce a dedicated desktop entry-shell layer rather than overloading existing components.

The expected primitive set is:

- `EntryPageShell`
- `EntryHeader`
- `EntrySection`
- `EntryCard`
- `EntryRow`
- `SidebarSection`

### 8.1 Why New Primitives

Current shell semantics are spread across:

- `WorkSurface`
- `QuietGuideCard`
- page-local layout code
- `Sidebar`

These components are useful but currently mix:

- shell semantics
- page semantics
- tone
- density
- interaction state

The new shell layer should isolate top-level entry-page behavior so the system stops drifting through one-off page decisions.

### 8.2 Relationship to Existing Components

The new shell primitives should reuse existing tokens and composition where appropriate, but they should not be forced to preserve every current shape.

`WorkSurface` and `QuietGuideCard` may still exist after this pass, but the shell should no longer depend on page-specific components to establish global consistency.

## 9. Visual Direction

The shell will keep the current Loom character:

- restrained
- quiet
- glass-informed but not glass-obsessed
- non-gamified
- not marketing-led

But the following changes are required:

- stronger title and active-state contrast
- clearer sectional separation
- slightly higher information density on entry pages
- less empty vertical padding where information load is low
- fewer surfaces that feel like polished placeholders

This is a **rebalancing**, not a rebrand.

## 10. Interaction Model

### 10.1 Desktop First

The first iteration optimizes the desktop shell.

This means:

- desktop navigation hierarchy is a first-class concern
- stage widths and page rhythm are tuned for wide windows
- top-level layout decisions are made for desktop first

Mobile should continue to function, but mobile refinement is not the primary success criterion of this pass.

### 10.2 Navigation Readability

A user should be able to answer these questions instantly:

- Which top-level room am I in?
- Which related stack is currently relevant?
- What is the primary object on this page?
- What should I do next here?

If the shell cannot answer those questions quickly, it is still too soft.

## 11. Data and Logic Boundaries

This redesign is shell-only.

It must not rewrite or destabilize:

- navigation data sources
- knowledge-store grouping logic
- history, pins, traces, panels, weaves, or work-session models
- reading overlays and reading-surface chrome
- route-level data contracts unless a tiny presentational adjustment is required

The shell may re-order how existing data is presented, but should not redefine the underlying product logic.

## 12. Non-Goals

This pass does **not** include:

- rewriting reading pages such as `/wiki/*`, `/knowledge/[category]/*`, or upload readers
- redesigning overlay systems like rehearsal, examiner, ingestion, or recursing chrome
- rebranding Loom's visual identity
- introducing a dashboard, score, streak, ring, or gamified progress framing
- turning `/browse` into a visual marketing surface
- making mobile the primary target
- unifying every component in the codebase under the new shell layer in one pass

## 13. Implementation Boundary for the First Pass

The first pass should focus on:

- `app/layout.tsx`
- `components/Sidebar.tsx`
- top-level route surfaces for `/`, `/today`, `/knowledge`, `/browse`, `/patterns`
- shell-adjacent presentational components now carrying top-level structure
- shared shell CSS and layout rhythm

A likely implementation path is:

1. introduce new shell primitives
2. migrate sidebar to the new shell language
3. migrate `/` and `/today`
4. migrate `/knowledge`
5. migrate `/browse`
6. attach `/patterns` to the shared shell grammar

## 14. Risks

### 14.1 Over-abstracting Too Early

If the shell primitive layer becomes too generic, the result will be a bland template system instead of a useful Loom shell.

The primitives should be specific to Loom's top-level entry pages.

### 14.2 Reintroducing Chrome

In trying to unify pages, the redesign could accidentally reintroduce:

- excessive hero treatment
- decorative gradients
- overstated feature framing
- dashboard-like state summaries

This would violate the product direction.

### 14.3 Breaking Page Purpose Through Over-Uniformity

The pages should look related, not identical.

The shell must not flatten:

- `/browse` into a fake card grid
- `/knowledge` into a weak text index
- `/today` into a metrics dashboard

## 15. Validation Criteria

The redesign is successful when:

- the sidebar reads as a stable shell rather than a crowded document tree
- `/`, `/today`, `/knowledge`, `/browse`, and `/patterns` clearly belong to one product system
- each page has one obvious primary surface
- `/knowledge` feels less empty and more legible without becoming loud
- `/browse` feels integrated into Loom without losing its low-chrome index role
- `/` and `/today` feel related but not redundant
- desktop route-switching feels calmer because the shell stays legible

## 16. Testing and Review

The implementation pass should validate:

- desktop layout at common wide and medium desktop widths
- active route behavior in the sidebar
- collapsed and expanded context stacks
- page-level header consistency across all covered top-level routes
- hover and active states for collection cards, rows, and nav items
- no regression in reading-page auto-hide and overlay behavior caused by layout-shell changes

Visual review should happen against live desktop states for:

- `/`
- `/today`
- `/knowledge`
- `/browse`
- `/patterns`

The review standard is not pixel sameness to the current UI. The standard is:

- stronger hierarchy
- better density balance
- preserved Loom character
- clearer room-to-room continuity
