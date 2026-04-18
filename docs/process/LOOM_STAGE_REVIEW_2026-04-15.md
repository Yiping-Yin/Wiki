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
- [components/PatternsView.tsx](/Users/yinyiping/Desktop/Wiki/components/PatternsView.tsx:1)

This is an important procedural shift:

- crystallization is now auditable
- reopening is now auditable
- panel state is no longer a hidden UI guess

### 2.4 Panel Revision

Panels now preserve revision history at the object layer.

This means a panel is no longer only "the latest contract".

It now remembers prior crystallized judgments.

Relevant files:

- [lib/panel/revisions.ts](/Users/yinyiping/Desktop/Wiki/lib/panel/revisions.ts:1)
- [components/PatternsView.tsx](/Users/yinyiping/Desktop/Wiki/components/PatternsView.tsx:1)
- [components/ReviewThoughtMap.tsx](/Users/yinyiping/Desktop/Wiki/components/ReviewThoughtMap.tsx:1)
- [app/graph/page.tsx](/Users/yinyiping/Desktop/Wiki/app/graph/page.tsx:1)

Revision is now visible as product behavior, not just stored data:

- `/patterns` shows revision timelines
- `ReviewThoughtMap` shows structured panel deltas
- `/graph` surfaces panel revision in relation context
- revision deltas can now trigger follow-up actions such as rework / verify / re-read

### 2.5 Weave as a First-Class Object

Weaves now exist as first-class stored relations.

Relevant files:

- [lib/weave/types.ts](/Users/yinyiping/Desktop/Wiki/lib/weave/types.ts:1)
- [lib/weave/contract.ts](/Users/yinyiping/Desktop/Wiki/lib/weave/contract.ts:1)
- [lib/weave/store.ts](/Users/yinyiping/Desktop/Wiki/lib/weave/store.ts:1)
- [lib/weave/derive.ts](/Users/yinyiping/Desktop/Wiki/lib/weave/derive.ts:1)
- [components/WeaveSync.tsx](/Users/yinyiping/Desktop/Wiki/components/WeaveSync.tsx:1)

Current weave semantics:

- `kind: references`
- `status: suggested | confirmed | rejected`
- `claim`
- `whyItHolds`
- `openTensions`
- `contractSource`
- `revisions`
- evidence list with anchor/snippet/time

This is now beyond "relation objects" and into relation judgment:

- graph can show the relation contract itself
- relation revision is visible
- relation contract is minimally editable
- relation change can trigger strengthen / question / re-read / verify actions

### 2.6 Graph and Patterns Use the New Object Layer

`/graph` and `/patterns` are no longer primarily trace-derived relation projections.

They now consume:

- `panel`
- `weave`

as their main semantic layer.

Relevant files:

- [app/graph/page.tsx](/Users/yinyiping/Desktop/Wiki/app/graph/page.tsx:1)
- [components/PatternsView.tsx](/Users/yinyiping/Desktop/Wiki/components/PatternsView.tsx:1)
- [components/ReviewThoughtMap.tsx](/Users/yinyiping/Desktop/Wiki/components/ReviewThoughtMap.tsx:1)

Important consequences:

- graph can confirm / reject weaves
- graph relation evidence can reopen the exact anchor
- patterns relation evidence can reopen the exact anchor
- confirmed weaves are visually distinguished from suggested ones
- review can show panel revision diff in the source-bound thinking surface
- graph can now act on panel and weave changes rather than only display them

### 2.7 Unified Learning Scheduler Is Real

Home and `/today` now schedule both `panel` and `weave` targets rather than
only resuming reading traces.

Relevant files:

- [lib/learning-targets.ts](/Users/yinyiping/Desktop/Wiki/lib/learning-targets.ts:1)
- [app/HomeClient.tsx](/Users/yinyiping/Desktop/Wiki/app/HomeClient.tsx:1)
- [app/today/TodayClient.tsx](/Users/yinyiping/Desktop/Wiki/app/today/TodayClient.tsx:1)

Important consequences:

- the product can now recommend either a panel or a relation as the next unit of work
- scheduler explanations are now based on explicit priority reasons
- Home and `/today` are no longer doc-resume pages only; they are quiet learning schedulers
- the queue can now become a real work session rather than only a ranked list

### 2.8 Work Session and Change Resolution Are Real

The scheduler is no longer only "pick the next object".

It now has a real work-session layer:

- `Start work session`
- `current target`
- `next up`
- `Done and continue`
- quiet session recap

It also now has real change-resolution semantics:

- targets carry stable `change token`s
- re-entry can land on the specific change surface
- `Done` resolves the current change, not the object forever
- panel revision diff and focused relation diff can show `Resolved for this change`
- `/today` can recap which changes were resolved and how

Relevant files:

- [lib/work-session.ts](/Users/yinyiping/Desktop/Wiki/lib/work-session.ts:1)
- [app/today/TodayClient.tsx](/Users/yinyiping/Desktop/Wiki/app/today/TodayClient.tsx:1)
- [components/WorkSessionHandoff.tsx](/Users/yinyiping/Desktop/Wiki/components/WorkSessionHandoff.tsx:1)
- [components/ReviewThoughtMap.tsx](/Users/yinyiping/Desktop/Wiki/components/ReviewThoughtMap.tsx:1)
- [app/graph/page.tsx](/Users/yinyiping/Desktop/Wiki/app/graph/page.tsx:1)

### 2.9 Event-Scoped Sync and Cross-Tab Consistency Are Real

The sync layer is no longer "full scan and rewrite on every change".

Relevant files:

- [components/PanelSync.tsx](/Users/yinyiping/Desktop/Wiki/components/PanelSync.tsx:1)
- [components/WeaveSync.tsx](/Users/yinyiping/Desktop/Wiki/components/WeaveSync.tsx:1)
- [lib/trace/events.ts](/Users/yinyiping/Desktop/Wiki/lib/trace/events.ts:1)
- [lib/panel/events.ts](/Users/yinyiping/Desktop/Wiki/lib/panel/events.ts:1)
- [lib/weave/events.ts](/Users/yinyiping/Desktop/Wiki/lib/weave/events.ts:1)
- [lib/shared/event-bus.ts](/Users/yinyiping/Desktop/Wiki/lib/shared/event-bus.ts:1)

Important consequences:

- panel and weave sync are now event-scoped and incremental
- change payloads carry `docIds` / object ids rather than anonymous "something changed"
- tabs can stay consistent without manual refresh
- pending sync work can survive reload / tab handoff

### 2.10 Atlas Layer Has Begun to Follow the Object Layer

`PatternSwatch` now derives from `panel` and `weave`, not only raw trace events.

Relevant file:

- [components/PatternSwatch.tsx](/Users/yinyiping/Desktop/Wiki/components/PatternSwatch.tsx:1)

This means the atlas texture is starting to reflect actual judged structure, not only historical interaction traces.

## 3. What Is Still Transitional

Several important areas are still transitional, but the gap has shifted.

### 3.1 Chat / Source-Surface Semantics

`ChatFocus` and the unified overlay surfaces now mostly share stage-aware
semantics, but there are still smaller long-tail places where older wording or
component assumptions can drift back in.

Relevant file:

- [components/ChatFocus.tsx](/Users/yinyiping/Desktop/Wiki/components/ChatFocus.tsx:1)

The remaining risk is no longer the absence of an object language. It is
surface drift.

### 3.2 Thought Containers vs Panel-Level Judgment

`VersionedAnchorCard` and `thought-anchor-model` still operate on anchor-scoped crystallize semantics:

- anchor-level lock / unlock
- container-local crystallization

Relevant files:

- [components/VersionedAnchorCard.tsx](/Users/yinyiping/Desktop/Wiki/components/VersionedAnchorCard.tsx:1)
- [components/thought-anchor-model.ts](/Users/yinyiping/Desktop/Wiki/components/thought-anchor-model.ts:1)

This boundary is now explicit in the product:

- panel-level judgment is now real
- anchor-container locking is still a separate local regime

That split is acceptable, but it still needs careful wording discipline so
`lock` never collapses back into `crystallize`.

### 3.3 Patterns / Graph Still Carry Some Compatibility Logic

The remaining work is no longer "make the object layer real". It is:

- keep wording aligned across Home / /today / review / /patterns / /graph
- keep scheduler explanations quiet and non-dashboard-like
- continue deleting compatibility residue in long-tail helpers

## 4. Where the Stop Point Is

This build phase can stop here.

The project has completed a meaningful transition:

- from "quiet UI around trace events"
- to "quiet UI around accountable objects and actions"

Continuing to push new objects or new lifecycle states immediately would likely blur phase boundaries.

This is now a good stopping point because:

- the object layer is real
- the relation layer is real
- the evidence path is real
- the UI has already been substantially de-noised
- scheduler and relation actions now exist across the main surfaces
- work-session and change-resolution now form a complete object-level loop

## 5. What The Next Phase Should Be

The next phase should **not** be "add more object abilities or more queue mechanics".

It should be:

### Option A · Stabilization and Documentation Freeze

Goal:

- audit terminology, status labels, and action wording across surfaces
- freeze the current canon so future work does not drift back into trace-era language
- keep Home / /today quiet even as scheduler logic gets richer
- avoid letting resolved-change recap turn into a dashboard or task manager

Priority targets:

- cross-surface naming consistency
- review checklist / onboarding / canon alignment
- removal of residual compatibility helpers where they no longer pay for themselves

## 6. Recommendation

Recommended next phase:

**Option A · stabilization and documentation freeze**

Why:

- the system now has enough real capability that naming drift is the bigger risk
- product and docs need to teach the same object language
- another round of feature growth before a freeze would make the system harder to reason about

## 7. Current One-Sentence Summary

Loom is no longer just a source-first reading interface.

It is now a panel/weave-based understanding system with accountable judgment
objects, accountable relation objects, change-driven work sessions, visible
change resolution, and evidence paths back into the source.
