# Stabilization and Documentation Freeze · 2026-04-15

Status: active stabilization record  
Updated: 2026-04-15

This document records the first stabilization pass after Loom's object-layer
buildout (`panel`, `weave`, revision diff, relation actions, unified learning
scheduler, event-scoped sync).

The goal is not to add more capability.

The goal is to make sure the current system:

- uses one object language
- teaches itself consistently across surfaces
- has docs that match the live product

## 1. Scope

Surfaces audited in this pass:

- `Home`
- `/today`
- `ReviewThoughtMap`
- `/patterns`
- `/graph`
- design canon / onboarding / checklist / stage review docs

## 2. Decisions Frozen in This Pass

### 2.1 Object Language

Use these words consistently:

- `panel`
  Main judgment object
- `weave`
  Relation judgment object
- `lock / unlock`
  Local thought-container control only
- `crystallize / uncrystallize / reopen`
  Panel lifecycle only
- `suggested / confirmed / rejected`
  Weave status only

This means:

- never call a local thought lock "crystallized"
- never use panel lifecycle wording for weave state
- never let Home or `/today` invent alternate names for the same object state

### 2.1.1 Desktop Entry Roles

Use these roles consistently:

- `Sidebar`
  The primary desktop navigation layer
- `Shuttle`
  The fast path inside the product shell, with minimal work state in the shell
- `Home`
  Quiet desktop start surface, not global navigation

This means:

- do not add top-level app navigation back into `Home`
- do not let the Shuttle become a second scheduler or second landing page
- do not let `Sidebar` drift into dashboard or session-recap behavior

### 2.1.2 AI Runtime

Use these runtime rules consistently:

- `codex`
  The default local AI runtime
- `claude`
  The fallback local AI runtime when `codex` is unavailable
- `Preferred AI runtime`
  The Settings control for choosing which local runtime Loom tries first

This means:

- do not describe AI as a cloud account model in product-facing docs
- do not imply there is a second unstable provider path outside the local machine runtimes
- do not remove fallback semantics when documenting the preferred runtime

### 2.2 Scheduler Grammar

Home and `/today` are now quiet learning schedulers, not doc-resume pages only
and not productivity dashboards.

Scheduler cards should:

- recommend the current best `panel` or `weave` target
- explain *why now* in plain language
- keep primary and secondary CTAs identical for the same target kind
- expose queue state in a reversible way once targets can be snoozed or completed

Scheduler cards should not:

- show points, rings, heatmaps, or progress scoring
- use black-box recommendation language
- diverge in wording between Home and `/today`

Scheduler state grammar:

- `Pin` keeps a target above ordinary priority ordering
- `Not now` snoozes it briefly
- `Hide today` suppresses it until tomorrow
- `Done` clears it for the current change only

If the underlying `panel` or `weave` changes, the target may return.

Ranking order:

- active suppression beats `Pin`
- `Pin` beats ordinary priority sorting
- once suppression lifts, the target returns to the queue using its normal priority

Return grammar:

- `Done` -> "Returned after a new change appeared"
- `Not now` -> "Returned after the snooze window ended" or after the target changes
- `Hide today` -> "Returned on a new day" or after the target changes

Change grammar:

- a target may carry a stable `change token`
- re-entry should land on the current change, not just the object shell
- resolution is tracked against that change token, not only by `touchedAt`

Work-session grammar:

- `/today` may start a quiet `Work session`
- a session may hand off across `/today`, `review`, and `/graph`
- session outcomes should record both `resolvedLabel` and `resolutionKind`
- resolved changes should be reopenable from the `Since last session` recap

### 2.3 Visual Terminology

Use one term consistently:

**Liquid Glass** = Loom's Apple-material, glass-first surface language.

This is a naming freeze, not a new style direction.

## 3. Concrete Corrections Made

### 3.1 Home and `/today` now share scheduler wording

The current scheduler surfaces now share:

- the same eyebrow grammar for `panel` vs `weave` targets
- the same secondary CTA grammar
- the same `Why now` explanation path derived from target priority reasons

### 3.2 Design-document precedence is now explicit

The docs now distinguish:

- **reading order / orientation**
- **precedence when documents disagree**

This removes the earlier contradiction where onboarding was treated as both
entrypoint and source-of-truth.

### 3.3 Review standards now cover cross-surface consistency

The active review checklist now explicitly asks:

- whether the same object keeps the same wording across surfaces
- whether scheduler explanations stay quiet and non-dashboard-like
- whether docs and UI teach the same vocabulary

### 3.4 Queue state is now visible and reversible

Home and `/today` no longer hide scheduler state in behavior alone.

They now show:

- `Pinned`
- `Not now`
- `Hidden today`
- `Done recently`

and each state can be reversed without opening a settings surface.

### 3.5 Work session is now a real cross-surface loop

The queue is no longer only a list filter.

It now supports:

- `Start work session`
- `Done and continue`
- `Next up`
- a quiet session recap when the round ends

The same session can continue across `/today`, `review`, and `/graph`.

### 3.6 Resolution is now change-scoped and visible

The system now distinguishes:

- object state
- current change
- whether that change has already been resolved
- how it was resolved

This is visible in:

- panel revision diff
- focused relation diff
- `Since last session` resolved-change recap

## 4. Remaining Stabilization Work

This pass does not claim the whole product is frozen forever.

Remaining stabilization work:

- continue deleting long-tail compatibility helpers
- keep `graph` / `review` / `patterns` status labels aligned as relation editing grows
- watch for scheduler explanation drift if target-state memory is added later
- keep AI runtime copy aligned to the local machine model, with `codex` first and `claude` as fallback

## 5. What Should Not Happen Next

Do not immediately start another growth phase by adding:

- more dashboard framing
- more global status UI
- more alternate names for the same object lifecycle
- more one-off target cards that bypass the shared scheduler helpers

The next changes should either:

- preserve this frozen language, or
- intentionally change the canon first
