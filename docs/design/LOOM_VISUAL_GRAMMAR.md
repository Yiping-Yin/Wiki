# Loom · Visual Grammar v1

Status: active design guidance  
Updated: 2026-04-14

This file defines the visual and structural grammar Loom should use going forward.

It is not a moodboard.
It is not a style preference list.
It is a set of constraints that keeps pages from drifting back into dashboards,
control panels, onboarding shells, or generic AI product chrome.

Use this with:

- `docs/design/CURRENT_DESIGN_CANON.md`
- `docs/design/DESIGN_MEMORY.md`
- `docs/design/DESIGN_REVIEW_CHECKLIST.md`

## 1. Core Rule

Loom should not look like "a polished app shell around content."

Loom should feel like:

- source when the user is reading
- a weaving surface when the user is shaping understanding
- a fabric surface when the user is revisiting what has already been woven

The object in the foreground is never "the interface".
It is always one of:

- a source
- a panel
- a relation between panels

## 2. Surface Layers

Every page must belong to one of four layers.

### A. Source Pages

Examples:

- `/wiki/...`
- `/knowledge/[category]/[slug]`
- `/uploads/[name]`

Purpose:

- read source
- enter review
- locate existing anchors

Rules:

- source is visually primary
- context is a strip, not a block
- no page hero
- no dashboard stats
- no multi-action header

### B. Lens Pages

Examples:

- `/`
- `/today`
- `/knowledge`
- `/browse`
- `/notes`
- `/highlights`
- `/quizzes`
- `/uploads`

Purpose:

- answer one question: where should I return next?

Rules:

- one quiet guide strip at most
- one search input at most
- one list shape at a time
- no summary cards competing with the list
- no repeated status chips
- no route-specific mini control panel

### C. Weaving Pages

Examples:

- `review`
- `rehearsal`
- `examiner`
- `refresh`

Purpose:

- shape one panel
- verify one panel
- settle one panel

Rules:

- current panel is the foreground object
- support one primary action at a time
- no generic AI chrome
- all secondary exits must remain subordinate to the current panel

### D. Fabric Pages

Examples:

- `/patterns`
- `/graph`

Purpose:

- revisit woven panels
- see relations
- continue the next relevant panel

Rules:

- panel is primary, not page chrome
- relations are shown as named objects, not first as counts
- counts are only allowed when they are the task
- avoid dashboard framing

## 3. Primary Grammar Units

These are the only reusable page-level units Loom should rely on.

### Quiet Guide Strip

Used on lens pages and source-page context strips.

Structure:

- eyebrow
- current object title
- one minimal meta fragment
- one primary action
- one secondary action at most

Rules:

- single row
- no second-line summary by default
- no more than two actions
- no counts unless absolutely necessary

### Quiet List

Used for:

- recent items
- notes
- highlights
- source lists
- collection lists

Structure:

- title
- one minimal trailing meta
- optional one-line preview only if the page would be illegible without it

Rules:

- no chips
- no badges
- no repeated state labels
- no row-level mini dashboards

### Panel Card

Used in:

- `/patterns`
- settled or active panel surfaces

Structure:

- panel title
- small identity line
- relation preview
- one primary action

Rules:

- relation objects first
- counts second, usually removed
- no redundant `stitches / threads / touched` triplets

### Relation Preview

Used in:

- `review`
- `patterns`
- `graph`
- settled panel states

Structure:

- `Referenced by`
- `Points to`

Rules:

- named panels beat numbers
- direction matters
- keep previews shallow and clickable

## 4. Typography

Typography should separate object, context, and system.

### Object Typography

Used for:

- source titles
- panel titles
- collection titles
- section titles

Rules:

- use the display face
- medium to strong weight
- negative tracking is acceptable
- never decorate with labels or icons unless the object itself requires it

### Context Typography

Used for:

- strips
- timestamps
- light breadcrumbs
- panel identity lines

Rules:

- muted
- small
- one line whenever possible
- should support scanning, not demand attention

### System Typography

Used for:

- search placeholders
- fallback notices
- rare controls

Rules:

- must remain visually subordinate to object and context text
- do not use system typography to "explain the app"

## 5. Spacing and Density

Loom should feel open, but not ornamental.

Rules:

- vertical rhythm should come from content separation, not decorative sections
- avoid stacking: strip + heading bar + summary card + list
- if a page already has a strip, question every additional top-of-page block
- if a page has a list, do not add a second preview layer unless it materially helps selection

Heuristic:

- if a lens page needs more than one strip and one list, it is probably over-designed

## 6. Color and Accent

Accent exists to show intent, not personality.

Use accent for:

- current object
- primary action
- active relation focus

Do not use accent for:

- page decoration
- informational counts
- idle labels
- general category coding unless it helps navigation directly

## 7. Counts and Metadata

Counts are almost always overused.

Allowed:

- when the number itself is the task
- when comparison depends on it
- when the object is meaningless without scale

Usually remove:

- docs count
- weeks count
- touched count
- threads count
- stitches count
- result totals in page chrome

Preferred replacement:

- object names
- current state
- recency

## 8. Motion

Motion should express:

- appearance by intent
- settling after action
- attention moving to the current object

Motion should not express:

- system effort
- generic liveliness
- persistent AI presence

Allowed:

- subtle fade
- settle pulse after crystallize
- small hover emphasis when focus shifts

Forbidden:

- celebratory motion
- loading theater
- bounce / slide choreography that calls attention to the mechanism

## 9. AI Visual Rules

Loom should not expose AI as a standing visual product layer.

Rules:

- no permanent `Ask` button on source pages
- source pages are selection-first
- global access is command-first
- non-document shell access may exist, but must be quiet and secondary
- AI output surfaces must always feel subordinate to the current panel or passage

In visual terms:

- do not let AI chrome outrank the source
- do not let AI controls outrank the panel
- do not let AI status language appear where content should speak for itself

## 10. Explicitly Forbidden

Do not reintroduce these:

- page hero + strip + list combinations on lens pages
- dashboard stat rows
- chips that restate the same system state already implied elsewhere
- repeated `count / status / recency` triplets
- control bars at the top of source pages
- route headers that simply restate the route name
- right-rail action clusters on lens pages
- decorative section headers above every list

## 11. Review Questions

Before shipping a page or component, ask:

1. Is the foreground object clear?
2. Is the page doing more than one job?
3. Could the top section become a single strip?
4. Is any count here actually necessary?
5. Is this helping the user return to a source or panel, or just explaining the system?
6. If I removed one whole block, would the page become clearer?

If the answer to 6 is yes, remove it.

## 12. Current Direction

The main design direction now is not "make pages prettier."

It is:

- reduce pages to the correct grammar
- let panel become the primary object
- let source stay sacred
- let fabric and relation layers carry the higher-order structure

Loom should continue moving from:

- app shell + content

toward:

- source / panel / relation as the only things that feel real
