# Loom Stage Review · 2026-04-15

Status: current stage recap  
Updated: 2026-04-15

This document records where Loom stands after the `source-first UI cleanup -> panel system -> weave system` phase.

It answers four questions:

- What has actually become real
- What is still partial or transitional
- Where the current stop point is
- What the next phase should be

## 1. Stage Judgment

Loom is no longer only a quiet reading UI.

It has crossed into a real object-based system:

- `source` is treated as a stable primary object
- `anchor` is a durable object rather than a transcript remnant
- `panel` is now a first-class judgment object
- `weave` is now a first-class relation object

This is the first point where the project can be described as a:

**source-grounded system for accountable understanding**

That does **not** mean the system is finished.

It means the project has moved from:

- product metaphor
- design discipline
- trace projections

to:

- programmatic identity
- lifecycle
- revision
- relation judgment

## 2. What Is Now Real

### 2.1 Source and Passage

The source layer is no longer treated as a passive blob.

The project now has a real passage-locator direction:

- `blockId`
- `blockText`
- character offsets
- semantic range start / end

Relevant files:

- [lib/passage-locator.ts](/Users/yinyiping/Desktop/wiki/lib/passage-locator.ts:1)
- [lib/trace/types.ts](/Users/yinyiping/Desktop/wiki/lib/trace/types.ts:1)
- [lib/note/store.ts](/Users/yinyiping/Desktop/wiki/lib/note/store.ts:1)

This is still not a fully robust multi-strategy locator engine, but it is no longer a single fragile range.

### 2.2 Panel as a First-Class Object

Panels now exist as first-class stored objects rather than only trace-level crystallize shadows.

Relevant files:

- [lib/panel/types.ts](/Users/yinyiping/Desktop/wiki/lib/panel/types.ts:1)
- [lib/panel/store.ts](/Users/yinyiping/Desktop/wiki/lib/panel/store.ts:1)
- [lib/panel/derive.ts](/Users/yinyiping/Desktop/wiki/lib/panel/derive.ts:1)
- [components/PanelSync.tsx](/Users/yinyiping/Desktop/wiki/components/PanelSync.tsx:1)

Current panel object now includes:

- stable `id`
- `docId`
- `anchorIds`
- `latestAnchorId`
- `summary`
- `centralClaim`
- `keyDistinctions`
- `openTensions`
- `status`
- `revisions`
- `learning`

This is the first time Loom can say it has a real judgment object.

### 2.3 Panel Lifecycle

Panel lifecycle is no longer only implied by UI.

Current lifecycle support:

- `provisional`
- `contested`
- `settled`
- `superseded`

And, critically:

- `uncrystallize` is no longer modeled as deleting history
- it is modeled as `panel-reopen`

Relevant files:

- [lib/trace/panel-lifecycle.ts](/Users/yinyiping/Desktop/wiki/lib/trace/panel-lifecycle.ts:1)
- [lib/trace/store.ts](/Users/yinyiping/Desktop/wiki/lib/trace/store.ts:1)
- [components/LiveArtifact.tsx](/Users/yinyiping/Desktop/wiki/components/LiveArtifact.tsx:1)
- [components/ReviewThoughtMap.tsx](/Users/yinyiping/Desktop/wiki/components/ReviewThoughtMap.tsx:1)
- [components/KesiView.tsx](/Users/yinyiping/Desktop/wiki/components/KesiView.tsx:1)

This is an important procedural shift:

- crystallization is now auditable
- reopening is now auditable
- panel state is no longer a hidden UI guess

### 2.4 Panel Revision

Panels now preserve revision history at the object layer.

This means a panel is no longer only "the latest contract".

It now remembers prior crystallized judgments.

Relevant files:

- [lib/panel/contract.ts](/Users/yinyiping/Desktop/wiki/lib/panel/contract.ts:1)
- [lib/panel/types.ts](/Users/yinyiping/Desktop/wiki/lib/panel/types.ts:1)

The UI only exposes this lightly today via `revised` in `/kesi`, but the data layer is in place.

### 2.5 Weave as a First-Class Object

Weaves now exist as first-class stored relations.

Relevant files:

- [lib/weave/types.ts](/Users/yinyiping/Desktop/wiki/lib/weave/types.ts:1)
- [lib/weave/store.ts](/Users/yinyiping/Desktop/wiki/lib/weave/store.ts:1)
- [lib/weave/derive.ts](/Users/yinyiping/Desktop/wiki/lib/weave/derive.ts:1)
- [components/WeaveSync.tsx](/Users/yinyiping/Desktop/wiki/components/WeaveSync.tsx:1)

Current weave semantics:

- `kind: references`
- `status: suggested | confirmed | rejected`
- evidence list with anchor/snippet/time

This is the first point where Loom can say it has relation objects, not only parsed backlinks.

### 2.6 Graph and Kesi Use the New Object Layer

`/graph` and `/kesi` are no longer primarily trace-derived relation projections.

They now consume:

- `panel`
- `weave`

as their main semantic layer.

Relevant files:

- [app/graph/page.tsx](/Users/yinyiping/Desktop/wiki/app/graph/page.tsx:1)
- [components/KesiView.tsx](/Users/yinyiping/Desktop/wiki/components/KesiView.tsx:1)

Important consequences:

- graph can confirm / reject weaves
- graph relation evidence can reopen the exact anchor
- kesi relation evidence can reopen the exact anchor
- confirmed weaves are visually distinguished from suggested ones

### 2.7 Atlas Layer Has Begun to Follow the Object Layer

`KesiSwatch` now derives from `panel` and `weave`, not only raw trace events.

Relevant file:

- [components/KesiSwatch.tsx](/Users/yinyiping/Desktop/wiki/components/KesiSwatch.tsx:1)

This means the atlas texture is starting to reflect actual judged structure, not only historical interaction traces.

## 3. What Is Still Transitional

Several important areas are still partially trace-first or still in a hybrid state.

### 3.1 Chat / Source-Surface Semantics

`ChatFocus` and some related source-bound surfaces still carry direct trace-event logic:

- direct crystallize checks
- direct anchor locking checks

Relevant file:

- [components/ChatFocus.tsx](/Users/yinyiping/Desktop/wiki/components/ChatFocus.tsx:1)

This is not wrong yet, but it means the system is not fully speaking one object language.

### 3.2 Thought Containers vs Panel-Level Judgment

`VersionedAnchorCard` and `thought-anchor-model` still operate on anchor-scoped crystallize semantics:

- anchor-level lock / unlock
- container-local crystallization

Relevant files:

- [components/VersionedAnchorCard.tsx](/Users/yinyiping/Desktop/wiki/components/VersionedAnchorCard.tsx:1)
- [components/thought-anchor-model.ts](/Users/yinyiping/Desktop/wiki/components/thought-anchor-model.ts:1)

This is an unresolved boundary:

- panel-level judgment is now real
- anchor-container locking is still a separate local regime

That split may be acceptable, but it should eventually be made explicit rather than left implicit.

### 3.3 Kesi / Graph Still Carry Some Compatibility Logic

Even though `/kesi` and `/graph` are now panel/weave-first, there are still compatibility traces in the codebase:

- helper residues
- older sorting assumptions
- light fallback residue in related helpers

The core behavior is now correct, but the system still remembers its trace-derived ancestry.

## 4. Where the Stop Point Is

This phase should stop here.

The project has completed a meaningful transition:

- from "quiet UI around trace events"
- to "quiet UI around accountable objects"

Continuing to push new objects or new lifecycle states immediately would likely blur phase boundaries.

This is now a good stopping point because:

- the object layer is real
- the relation layer is real
- the evidence path is real
- the UI has already been substantially de-noised

## 5. What The Next Phase Should Be

The next phase should **not** be "add more surfaces".

It should be one of the following, chosen explicitly:

### Option A · Unify Remaining Trace-Only Semantics

Goal:

- remove the remaining places where old trace-first logic still directly drives product semantics

Priority targets:

- `ChatFocus`
- selected source surfaces
- anchor-level locking boundary

This option makes the system speak one programmatic language.

### Option B · Unify AI Surfaces Around a Stage-Aware Model

Goal:

- make `ChatFocus`, `FreeInput`, `Rehearsal`, `Examiner`, and `Ingestion` feel like one learning engine instead of adjacent tools

This option is likely the highest-leverage next product phase.

### Option C · Make Panel Revision Properly Visible

Goal:

- make revision not only stored, but meaningful in the product

For example:

- show revision-aware panel state in `/kesi`
- show revision differences in `review`

This option should come after Option A or B, not before.

## 6. Recommendation

Recommended next phase:

**Option B · unify AI surfaces around a stage-aware learning model**

Why:

- the object layer is now strong enough to support it
- the biggest remaining incoherence is not visual, but behavioral
- Loom still risks feeling like multiple AI tools sharing a visual language instead of one system with multiple learning stages

## 7. Current One-Sentence Summary

Loom is no longer just a source-first reading interface.

It is now a panel/weave-based understanding system with accountable judgment objects, accountable relation objects, and evidence paths back into the source.
