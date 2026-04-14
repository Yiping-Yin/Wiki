# Loom · Panel System Plan v1

Status: active implementation plan  
Updated: 2026-04-14

This file turns Loom's product constitution into a build order.

Use it when asking:

- what should be built next
- what should not be built yet
- how to move from anchors to real panels
- how `/kesi` becomes a habitat instead of a list

If `LOOM_EPISTEMIC_GRAMMAR.md` is the law,
this file is the first version of the procedure.

## 1. Core Judgment

Loom already knows what it wants to be.

What it still lacks is a stable program for getting there.

Today the system already has:

- source objects
- passage-bound interaction
- transient thread surfaces
- durable thought-anchor events
- a derived thought map
- crystallize as a trace-level marker
- kesi as a projection layer

But it still lacks:

- a first-class panel object
- a first-class weave object
- a durable panel revision lifecycle
- a robust passage locator

This means Loom has a constitution, but not yet a full procedure.

Strategic focus:

- Loom wins by making the single-document loop dense and trustworthy
- not by becoming a general visual PKM system
- not by becoming reading-chat middleware
- not by becoming an infinite thought canvas

Therefore the first battle remains:

`source -> passage -> thread -> anchor -> thought map -> panel`

not:

- collaboration
- broad issue-space workspaces
- expansive graph products
- ecosystem surfaces

## 2. Current Reality

The actual codebase is closest to this shape:

| Object | Current implementation | Status |
| --- | --- | --- |
| Source | `knowledge-store`, `DocViewer`, source routes | Real |
| Passage | `blockId + charStart + charEnd` anchors | Fragile |
| Thread | `ChatFocus` / `FreeInput` transient turns | Real but temporary |
| Anchor | `thought-anchor` trace events | Real |
| Thought Map | `ReviewThoughtMap` + `thought-anchor-model` | Real but derived |
| Panel | implied by trace-level crystallize | Missing as object |
| Weave | implied by backlinks and graph relations | Missing as object |
| Kesi | `KesiView` projection of crystallized traces | Real as shell, weak as data model |

So the next phase should not add more surfaces.

It should strengthen the missing objects.

## 3. Build Order

### Phase A · Passage Reliability

Goal:

- a committed anchor should survive ordinary source change

Work:

1. add a real passage locator stack
   - structural path
   - text offset
   - text fingerprint

2. add re-resolution rules
   - exact block hit
   - fuzzy block text match
   - nearest structural fallback

3. separate stable identity from DOM convenience ids
   - `loom-block-N` is a rendering convenience, not ontology

Success criteria:

- anchors reopen after small document edits
- anchor drift becomes observable and recoverable

### Phase B · Anchor Grammar

Goal:

- anchors should not all mean the same thing

Work:

1. introduce internal anchor kinds
   - `quote`
   - `paraphrase`
   - `interpretation`
   - `inference`
   - `objection`
   - `question`
   - `judgment`

2. do **not** expose all kinds in UI immediately
   - first use them in storage and tooling
   - expose only where they materially help review

3. add explicit transitions
   - e.g. quote -> interpretation
   - interpretation -> judgment

Success criteria:

- Loom can distinguish faithful reading from overreach
- AI can no longer silently blur categories

### Phase C · Panel Formation

Goal:

- crystallize should produce a real panel object

Work:

1. define panel schema
   - `id`
   - `sourceDocIds`
   - `centralClaim`
   - `keyDistinctions`
   - `evidenceAnchorIds`
   - `openTensions`
   - `status`
   - `createdAt / updatedAt`

2. define panel lifecycle
   - `draft`
   - `provisional`
   - `contested`
   - `settled`
   - `superseded`

3. change crystallize semantics
   - not only trace-level flag
   - create or update panel state explicitly

4. keep source lineage explicit
   - every panel must know which anchors justify it

Success criteria:

- `/kesi` can render panels without reverse-engineering trace summaries
- panel status becomes a real object property, not a visual guess

### Phase D · Weave Confirmation

Goal:

- relations between panels should become first-class, not only inferred previews

Work:

1. define weave schema
   - source panel
   - target panel
   - relation type
   - confidence / review status
   - createdBy: user or AI suggestion

2. relation types at minimum
   - supports
   - contrasts
   - refines
   - extends
   - questions

3. move graph and relation previews onto weave objects
   - keep inferred suggestions
   - distinguish them from confirmed relations

Success criteria:

- `/graph` becomes accountable relation space
- `/kesi` relations are not just parsed links

### Phase E · Kesi as Habitat

Goal:

- `/kesi` becomes the place where panels live and get reactivated

Work:

1. panels drive `/kesi`
   - not crystallized traces alone

2. weave-aware resurfacing
   - old panels return when new evidence touches them

3. revision pathways
   - settled -> contested
   - contested -> revised
   - revised -> settled again

Success criteria:

- `/kesi` stops feeling like a rendered archive
- users return to panels, not to a list of trace remnants

## 4. What Not To Build Yet

Do not prioritize these before panels are real:

- collaboration
- sharing workflows
- ecosystem / plugins
- broad issue-first multi-source workspaces
- multiple thought map viewing modes
- richer graph visual treatments

These all depend on stable panel identity.

Without that, they only add complexity.

## 5. UI / Engineering Implications

This plan implies several immediate engineering rules.

### 1. Panel state should move out of display-only derivation

Current risk:

- `KesiView`, `Graph`, and settled states infer too much from traces

Desired direction:

- traces remain event history
- panels become the durable judgment objects built from that history

### 2. AI must not be allowed to upgrade status silently

Examples:

- AI may suggest a central claim
- AI may not silently turn that into a settled panel

Every status jump must have a visible user-facing act.

### 3. Review should become the canonical panel formation surface

Not:

- chat transcript
- scattered note saving

But:

- the place where anchors are revised
- tension is made explicit
- panel formation becomes possible

## 6. Near-Term Deliverables

If work must be staged over the next 90 days, do this:

### 0–30 days

- implement stronger passage locator
- define anchor kind grammar
- add internal object typing for anchors

### 30–60 days

- define first-class panel schema
- make crystallize create panel state
- make review consume panel status, not inferred settled flags alone

### 60–90 days

- define first-class weave schema
- migrate `/kesi` and `/graph` toward panel + weave objects
- add revision / contest / supersede transitions

## 7. Review Questions

Before shipping any Loom feature touching anchor, panel, review, crystallize, or kesi, ask:

1. Is this acting on a thread, an anchor, a panel, or a weave?
2. Does the object have a clear epistemic status?
3. Can the result be revised later?
4. Is source lineage still visible?
5. Are we creating a real object, or only another display projection?

If the answer to 5 is "just another projection", stop and fix the object layer first.
