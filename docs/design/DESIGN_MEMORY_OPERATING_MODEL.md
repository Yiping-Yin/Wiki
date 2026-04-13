# Design Memory Operating Model

Status: active process document
Updated: 2026-04-13

This document defines how `DESIGN_MEMORY.md` should be maintained, updated,
and synchronized into the product.

The goal is to preserve two things at the same time:

- the **wholeness** of Design Memory as Loom's mother document
- the **operability** of Design Memory as a system that continuously affects
  canon, specs, implementation, prompts, and review standards

This document does **not** replace `DESIGN_MEMORY.md`.
It explains how to use it.

## 1. Core stance

`DESIGN_MEMORY.md` remains the single mother document for Loom's long-horizon
product memory.

Do **not** split the source of truth into multiple competing design-memory
documents.

Instead:

- keep one canonical `DESIGN_MEMORY.md`
- keep it complete enough to preserve worldview, feedback history, and
  principle derivation
- create smaller operational views only as **projections** of that mother
  document, never as competing sources of truth

The rule is:

`one canonical memory, multiple projections`

not:

`multiple documents pretending to be truth`

## 2. Document stack

The design-document stack has four roles:

1. `docs/design/DESIGN_MEMORY.md`
   The mother document. Holds immutable principles, rationale, process, and
   historical feedback.

2. `docs/design/CURRENT_DESIGN_CANON.md`
   The operative current truth. Answers: what Loom is *right now*, what
   interaction model is active, and what historical directions are rejected.

3. `docs/design/*_SPEC.md`
   Topic-specific implementation specs. Translate current canon into concrete
   interaction and component behavior for a bounded area.

4. `docs/design/DESIGN_ONBOARDING.md`
   Fast entry path for collaborators. Tells a contributor how not to break the
   product before touching UI, interaction, or AI behavior.

If these documents disagree, precedence stays:

1. `CURRENT_DESIGN_CANON.md`
2. topic spec documents
3. `DESIGN_MEMORY.md`
4. implementation
5. historical docs

## 3. Two layers inside Design Memory

Every addition to Design Memory must be classified into one of two layers.

### A. Immutable principles

These answer:

- What Loom fundamentally is
- What must remain true even if implementation changes
- What product identity boundaries cannot be crossed

Examples:

- Loom is a loom
- source is sacred
- thought map is the pattern
- one AI, never split
- recompile, not append
- immersion outranks identity

These should change rarely and only when there is a true product-definition
shift.

### B. Current implementation lock-ins

These answer:

- How the current version realizes the principles
- Which specific interaction model is active
- Which concrete component or geometry decisions are currently locked in

Examples:

- capture-first instead of canvas-first
- `Cmd+/` toggles the current review surface
- current chat/review geometry split
- current anchored-note lifecycle behavior
- current list-view grammar

These may evolve when a better implementation appears, as long as immutable
principles remain intact.

## 4. Feedback taxonomy

Every owner feedback item must be classified before it is written.

Use one of four categories:

1. `principle shift`
   A true change to product identity or a new top-level law.

2. `principle clarification`
   Not new identity, but a sharper articulation of an existing principle.

3. `implementation lock-in`
   A current product decision that should be treated as active until
   superseded.

4. `local implementation correction`
   A fix to current behavior that does not need to become lasting design
   memory unless it reveals a repeated pattern.

If a feedback item is purely local and does not generalize, do not inflate it
into a new principle.

## 5. Update protocol

When new owner feedback arrives, follow this sequence.

1. Capture the feedback verbatim.
   Preserve the owner's Chinese wording when available.

2. Interpret it.
   Decide whether it changes an immutable principle, clarifies one, locks in a
   current implementation, or only fixes a local issue.

3. Write it into `DESIGN_MEMORY.md`.
   Add date, quote, and placement in the correct section.

4. Derive sync tasks.
   Explicitly decide whether the change requires updates to:
   - `CURRENT_DESIGN_CANON.md`
   - one or more spec documents
   - prompts
   - implementation
   - review checklist / release gates

5. Sync in the same delivery whenever possible.
   Design memory should not drift far ahead of product behavior.

6. Record the result.
   The final response or commit should note that the memory change has been
   reflected in product-facing artifacts when applicable.

## 6. Product sync rules

Not every memory update requires code changes, but every memory update
requires an explicit sync decision.

Use this matrix:

| Change type | Update memory | Update canon | Update spec | Update product |
|---|---|---|---|---|
| Principle shift | yes | yes | usually | usually |
| Principle clarification | yes | maybe | maybe | maybe |
| Implementation lock-in | yes | usually | yes | yes |
| Local implementation correction | maybe | no | maybe | yes |

Two hard rules:

- Never update product-defining behavior without checking whether
  `DESIGN_MEMORY.md` or `CURRENT_DESIGN_CANON.md` must change.
- Never add a lasting design-memory rule without deciding what product surface
  it must touch.

## 7. PR discipline

Any PR that changes UI, interaction, AI behavior, or visual language should
answer a `Design Memory Impact` section.

Minimum format:

- `Relevant principle(s):`
- `Memory change required: yes/no`
- `Canon/spec change required: yes/no`
- `Product surfaces affected:`
- `Why this does not violate Loom's identity:`

If a PR materially changes interaction but has no Design Memory explanation,
review is incomplete.

Repository implementation:

- `.github/pull_request_template.md` carries the default `Design Memory Impact`
  section for product-facing changes.

## 8. Review discipline

Before merging any meaningful design change, check:

- Does this preserve source primacy?
- Does this reduce or increase visible system presence?
- Does this make capture faster or slower?
- Does this strengthen or weaken the thought map as the product core?
- Does this make Loom feel more like a generic chat or notes product?
- Does this duplicate something the OS, browser, or existing product already
  does?
- If removed, would anything actually be lost?

When uncertain, prefer subtraction and ship the smaller change.

## 9. Cadence

Design Memory should be updated continuously, not in quarterly batches.

Recommended cadence:

- same day for owner feedback that affects product judgment
- same PR for implementation lock-ins that are intentionally shipped
- periodic drift review against the live product every 1-2 weeks during active
  design iteration

The risk is not "forgetting a note." The risk is product-identity drift.

## 10. Drift audits

Run recurring `product vs memory` audits.

The audit asks:

- Which current UI surfaces no longer match the mother document?
- Which memory rules are no longer represented in canon/spec/product?
- Which implementation details have become obsolete and should be removed from
  active lock-ins?
- Which repeated local corrections should be promoted into lasting memory?

This audit is part of maintaining Loom, not optional cleanup.

Use:

- `docs/process/DESIGN_MEMORY_DRIFT_AUDIT_TEMPLATE.md`

## 11. Projection documents

To preserve the completeness of `DESIGN_MEMORY.md` while improving daily
usability, add projection documents only when they serve a clear operational
need.

Current / recommended projections:

- `DESIGN_MEMORY_INDEX.md`
  A navigable map of principles and lock-ins, each linking back to the mother
  document.

- `DESIGN_REVIEW_CHECKLIST.md`
  A short operational checklist used in product and code review.

Supporting process artifacts:

- `.github/pull_request_template.md`
- `docs/process/DESIGN_MEMORY_DRIFT_AUDIT_TEMPLATE.md`

These projection documents must:

- point back to `DESIGN_MEMORY.md`
- never redefine principles independently
- be treated as convenience views, not canonical truth

## 12. Anti-patterns

Avoid these failure modes:

- splitting the mother document into multiple competing truth documents
- writing only local implementation notes and losing the worldview
- writing only philosophy and never syncing product behavior
- changing the product while leaving memory stale
- changing memory while leaving canon/spec stale
- treating historical corrections as immutable principle changes
- treating temporary implementation decisions as eternal law

## 13. The governing rule

Design Memory exists to prevent Loom from forgetting what it is.

If a process makes the memory easier to search but weaker as a whole, the
process is wrong.

If a process preserves the wholeness of the memory but makes it impossible to
apply in daily work, the process is also wrong.

The correct operating model preserves:

- one complete mother document
- clear principle vs implementation layering
- immediate feedback capture
- explicit product synchronization
- recurring drift review
