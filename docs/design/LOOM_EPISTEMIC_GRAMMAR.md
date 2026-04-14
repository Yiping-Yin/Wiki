# Loom · Epistemic Grammar v1

Status: active design / product doctrine  
Updated: 2026-04-14

This file defines the **epistemic grammar** of Loom:

- what kinds of thinking objects exist
- what each object is allowed to claim
- how an object advances, freezes, gets challenged, or gets withdrawn
- what AI is allowed to do to each object

If `CURRENT_DESIGN_CANON.md` explains Loom's product identity,
and `LOOM_VISUAL_GRAMMAR.md` explains its visual discipline,
this file explains **how understanding itself must be structured**.

Loom is not only a tool for saving thoughts.  
It must become a system for **accountable understanding**.

## 1. Core Judgment

The problem is not just:

- speed vs permanence

The deeper problem is:

- can a piece of understanding be traced back to its source,
- distinguished from paraphrase, inference, or judgment,
- revised when challenged,
- and retained without turning into inert notes?

Loom should therefore optimize for:

- source-grounded thinking
- explicit object identity
- revisable judgment
- durable but not frozen understanding

## 2. The Eight Objects

Loom should operate on eight primary objects.

### 1. Source

The source document itself.

Properties:

- immutable from Loom's point of view
- renderable
- locatable
- citeable

Examples:

- wiki page
- knowledge doc
- uploaded file

### 2. Passage

A locatable fragment inside a source.

Properties:

- must survive light document change
- must be recoverable through more than one anchor strategy

Minimum locator stack:

- structural path
- text offset range
- text fingerprint

### 3. Thread

A transient conversational or drafting exchange around a passage or panel.

Properties:

- provisional
- discardable
- not part of the long-term knowledge layer by default

Threads are useful only insofar as they help produce anchors or panel revisions.

### 4. Anchor

A committed unit of thought tied to a source or panel location.

Properties:

- durable
- locatable
- revisable
- mergeable / splittable

Anchor is the first true knowledge object in Loom.

### 5. Thought Map

A topology of anchors, gaps, tensions, and open knots within a source.

Properties:

- not a scrapbook
- not a decorative graph
- must represent what is understood and what is not yet resolved

### 6. Panel

A document-level or issue-level unit of structured understanding.

Properties:

- must be more than a summary
- must be reusable
- must remain revisable
- must preserve source lineage

Panel is the primary long-term value object in Loom.

### 7. Weave

A confirmed relation between panels.

Properties:

- can be suggested by AI
- should be reviewable by the user
- should preserve direction and relation type

Weave is not adjacency. It is a claim of relationship.

### 8. Kesi

The user's durable fabric of panels and weaves.

Properties:

- not an archive
- not a dashboard
- not a scrapbook
- should function as a habitat for returning thought

## 3. Object Hierarchy

The object hierarchy should be read as:

`source -> passage -> thread -> anchor -> thought map -> panel -> weave -> kesi`

Critical rule:

- `thread` is not equivalent to `anchor`
- `anchor` is not equivalent to `panel`
- `panel` is not equivalent to `kesi`

Each upward move requires a stronger justification and a narrower claim.

## 4. Anchor Grammar

Not all stored thoughts are of the same kind.

Loom should distinguish, at minimum, these categories:

- `quote`
  Directly from source. No interpretation.

- `paraphrase`
  Rewording the source without extending beyond it.

- `interpretation`
  An explanation of what the source is doing or implying.

- `inference`
  A step beyond what is explicitly stated.

- `objection`
  A reason the current reading may be wrong or incomplete.

- `question`
  A gap in understanding, uncertainty, or unresolved knot.

- `judgment`
  A more stable claim the user is willing to stand behind for now.

These categories do not all need to be visible in the UI immediately.
But they must exist in the epistemic model, otherwise Loom cannot distinguish:

- faithful reading
- useful interpretation
- overreach

## 5. Panel Contract

A panel must never be "just the summary of a document."

At minimum, every panel should be able to express:

- `central claim`
  What is the strongest current understanding?

- `key distinctions`
  What separations or concepts matter most?

- `evidence basis`
  Which anchors / passages support this?

- `open tensions`
  What still does not sit right?

- `revision status`
  Is this still draft, contested, settled, or superseded?

If Loom cannot represent these, crystallize collapses into summarization.

## 6. Judgment Lifecycle

Crystallize must not mean "finished forever."

The minimum lifecycle should be:

- `draft`
  Early structure exists, not yet ready to stand as a panel.

- `provisional`
  Good enough to hold, but still clearly revisable.

- `contested`
  New evidence or conflict has put the panel under pressure.

- `settled`
  Stable enough to live in `/kesi` without immediate revision.

- `superseded`
  Retained for history, but no longer the current standing interpretation.

This matters because a system with only:

- not crystallized
- crystallized

is too coarse. It encourages premature certainty.

## 7. What Crystallize Must Mean

Crystallize is not:

- save summary
- finish reading
- lock note

Crystallize means:

- this line of understanding now stands as a panel-level holding
- it has enough structure to be revisited later
- it is worthy of entering kesi

Therefore crystallize should always imply:

- panel formation
- source linkage
- revision status
- future revisability

## 8. AI Constraints

AI is not allowed to silently upgrade an object's epistemic status.

Examples:

- A quote cannot become a judgment without a visible transition.
- A paraphrase cannot become a panel without explicit panel formation.
- A contested panel cannot become settled by silent overwrite.

AI may:

- extract
- compress
- propose
- compare
- surface tension
- suggest weave candidates

AI may not:

- silently author judgments
- erase uncertainty
- collapse distinction between source and inference
- finalize a panel without a visible user-facing act

## 9. The Role of Thought Map

Thought Map should not merely show where anchors exist.

It must eventually show:

- supported areas
- sparse or missing areas
- unresolved questions
- objections
- tensions between interpretations

This is what would make it a topology of understanding,
instead of a coverage display.

## 10. Issue-First vs Source-First

Loom remains source-first by default.

That is still correct for the current product phase.

But the epistemic model must not assume that all valuable understanding
is document-bound forever.

The long-term system should allow a second mode:

- `issue-first`

Where:

- multiple sources are assembled under one problem or claim
- anchors from different sources can feed one panel

This does **not** need to ship now.
It should remain a later phase, after panel grammar is stable.

## 11. What To Build Next

The next product / engineering priority should be:

1. strengthen passage locator durability
2. give anchors a stronger internal type grammar
3. define a real panel object and revision contract
4. make crystallize produce panel state, not only a trace-level flag
5. let `/kesi` operate on panels as first-class objects

Not priority right now:

- collaboration
- ecosystem / integrations
- sharing flows
- expansive graph views
- more visual modes of the thought map

## 12. Review Questions

Before shipping any feature that touches AI, anchors, panels, or kesi, ask:

1. What object is this acting on?
2. Is that object source, anchor, thread, panel, or weave?
3. Is AI changing the object's epistemic status?
4. If yes, is that transition explicit and reviewable?
5. Can the result be challenged or revised later?
6. Are we saving understanding, or just saving prose?

If the answer to 6 is "just prose", the feature is not done.

## 13. The Target State

Loom should not stop at being a beautiful thinking tool.

Its stronger destination is:

**a source-grounded system for accountable understanding**

That means:

- every claim knows its evidence
- every panel knows its status
- every settled understanding can be reopened
- every relation can be questioned
- nothing becomes authoritative just because it was generated smoothly
