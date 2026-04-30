# Loom — Unified Product Vision

> **Status**: v1.0 filed 2026-04-30 — vision document, not implementation plan.
> **Authors**: Claude Opus 4.7 (1M context) drafting; product owner approves substantive shape.
> **Audience**: any AI assistant or human collaborator working on Loom long-term.
> **Authority level**: vision (sets direction). Does not override `LOOM_RULES.md` (invariants/vetoes). Sub-plans like `phase-c-presentation-layer.md` and `loom-design-system-v1.md` operate within this vision.
> **Read order**: this doc → `LOOM_RULES.md` → relevant sub-plan → memory entries.

---

## 0. Why this document exists

Across the late-April 2026 work — reading-flow rewrite (2026-04-26), Web Capture extension (2026-04-29), CaptureAST architecture pivot (2026-04-30), Design System v1 spec (2026-04-28), Phase C presentation layer (2026-04-27) — Loom has accumulated multiple substantive plans, each filed independently. Each is sound on its own. None articulate **what Loom looks like when they all converge**.

Without a unified vision, the risk is: each sub-plan ships its piece, the surfaces don't add up to a coherent product, and Loom ends up looking like "a notebook with capture + an AI panel + a renderer + some design tokens" — i.e. exactly what `LOOM_RULES.md §1` says Loom is NOT.

This document fixes that gap. It defines Loom in terms of **six user verbs**, articulates the **collapsing principle** that maps all surfaces onto one primitive, and identifies the **two unbuilt surfaces** that still need product design before Loom can claim category-defining position.

---

## 1. What Loom Is — In Six Verbs

The product owner's 2026-04-16 north-star mockup states: *"Loom is a reading-and-thinking environment where source-bound understanding is woven into memory. It is not a notebook, not a chat shell, and not a dashboard. It is where reading becomes judgment, judgment becomes pattern, and pattern returns when it changes."*

Inside that sentence are six time-ordered user moments. Each is a **verb** the product must serve:

| # | Verb | The user moment |
|---|------|-----------------|
| 1 | **Encounter** | Find / import / capture a source (PDF, folder, web page, clipboard fragment) |
| 2 | **Read** | Dwell on the source. Eyes attend; nothing rushes them. |
| 3 | **Respond** | React to the source — note, quote, ask AI for clarification or translation |
| 4 | **Connect** | See how the present response relates to past responses across other sources |
| 5 | **Distill** | Pattern emerges from accumulated responses; it gets named (by user, with AI assist) and saved |
| 6 | **Return** | Weeks later, reopening a source surfaces prior thinking + flags what's changed since |

**These six verbs ARE Loom's product.** Every feature must map cleanly to at least one. A feature that fits no verb does not belong in Loom. A surface that overlaps ≥3 verbs is structurally unhealthy (per `LOOM_RULES §3 V11`).

### Why six (not four, not eight)

- **Encounter** and **Read** are distinct: the act of finding/importing is product onboarding-grade UX (extension, drag-drop, folder picker), the act of reading is paper-canon attention. Different disciplines.
- **Respond** is distinct from **Connect** because Respond is local (this passage, this source) and Connect is cross-source (this thinking and that thinking).
- **Distill** is distinct from **Connect** because Connect is recognition (these are linked) and Distill is naming (this is the pattern).
- **Return** is distinct from **Read** because the user's brain state is different — they have prior context they need to re-load. Return needs its own affordances.
- Could collapse Distill into Connect or Return into Read — but each loses information. Six is the minimum that preserves the user moments.

### The verb-coverage diagnostic (current state, 2026-04-30)

| Verb | Surfaces today | Coverage |
|------|---------------|----------|
| Encounter | Sidebar (Finder mirror) + Web Capture extension + `loom://` URL handler | **Fragmented** — 3 entry points, 3 different rule sets |
| Read | `SourceFileView` (PDF) + reading-flow rewrite (Markdown) + `loom-render/capture` (Web Capture reader) + `loom-render/snapshot` (full-fidelity HTML) | **Fragmented** — 4 render paths |
| Respond | Note popover + Ask AI panel + right-click menus | Partially unified (single capture primitive 2026-04-26) |
| Connect | `loom://anchor` URLs + per-book sections + promote-to-page | **Fragmented**, no master view |
| Distill | Phase C M2-M4 (not built) | **Missing** |
| Return | Tier 1 source-aware AI prompt (invisible) | **No UI surface** — only inside AI prompt |

Five of six verbs are fragmented or missing. Only Respond is partially unified. Unification work has substantial runway.

---

## 2. The Collapsing Principle — Page as Primitive

`LOOM_RULES §2.5` states: *"One primitive over many. When two surfaces overlap functionally, collapse to one with progressive paths inside, even if it costs an extra click."*

Pushed to its conclusion: **the Page (a `ContentRoot` with its `Loom.md`) is Loom's only first-class primitive. All six verbs happen on or around the Page.**

| Verb | Where on the Page it lives |
|------|----------------------------|
| Encounter | Sidebar = the bookshelf where Pages live as objects with material identity. Adding a source = a new Page on the shelf. |
| Read | The Page itself, rendered. Content-shape detection (Phase C) chooses the renderer; the substrate (paper canon) stays constant. |
| Respond | Inline on the Page. Right-click selection → Note this passage → entry lands in the per-book section of the same `Loom.md`. |
| Connect | A quiet eyebrow surfaced ON the Page when the user is reading a passage that echoes past notes from another Page. Not a graph view. Not a notification. **An ambient cue on the page being read right now.** |
| Distill | A `## Distilled / YYYY-MM-DD` section appears IN the Page's `Loom.md` (drafted by AI, edited by user, saved as plain markdown). |
| Return | When a Page is reopened after time, the page top shows a one-line eyebrow: *"Last read 12 days ago · 3 notes · pattern: [one-line]"*. Inline, not modal. |

**No new view types are introduced.** All verbs collapse onto the existing primitive. What's needed is the Page becoming expressive enough to host all six.

This is a working hypothesis, not yet a hard veto. Default: try Page-collapse first. Carve out a separate surface only if a verb genuinely fails to fit. (See `feedback_loom_panel_model.md` — the 1.5D panel strip was a separate Connect surface that was built then deleted; the current eyebrow-on-Page approach is the second attempt.)

---

## 3. The Five Ones — Architecture Targets

Unifying the product means converging on these five "ones":

| Slot | Target | Current state |
|------|--------|---------------|
| **One root view** | `LoomMinimalRootView` is the canonical root | ✓ Already default since 2026-04-26 |
| **One sidebar** | `KnowledgeSidebarView` rebuilt as objecthood shelf (each Page is a book-spine-style object with material identity, not a flat list row) | Current sidebar is flat List + LazyVStack. Visual upgrade pending. |
| **One page renderer** | Single dispatch: detect content shape, render with appropriate Phase C renderer (PDF / Markdown / List / Article / Passage / Conversation), all sharing paper canon substrate | Currently 4 render paths. Phase C M2/M3/M4 unifies them. **CaptureAST (Codex's pivot 2026-04-30) is the data-layer prerequisite.** |
| **One AI summoner** | `LoomAIBar` rebuilt as a summonable paper-card object with gravity shadow; appears on Cmd+E or right-click, dismisses on Esc | Functional today; visual treatment as object (not panel) pending. |
| **One brand surface** | Cosmic substrate for splash / about / empty / session-boundary moments (using the 2026-04-16 mockup as north-star image) | **Not built.** The 4-16 mockup exists as a static image; the cosmic canon hasn't been written. |

When all five "ones" are in place, Loom presents as one coherent product, not a collection of features sharing a window.

---

## 4. The Two Substrates

Loom has TWO canonical visual substrates. Both share the discipline; they differ in palette and emotion.

| Dimension | Brand substrate (Cosmic) | Working substrate (Paper) |
|-----------|-------------------------|---------------------------|
| **Palette** | Deep dark (`#0A0908` family) + starfield + comet mist + ivory hero text + bronze accent | Warm ivory `#FBF6EC` + hairline + bronze accent + ink scale |
| **Verb moments** | Session boundaries (open / close / about / empty / first-run) | All six verbs in working state |
| **Reference triangle** | `彗星/` cosmic photography + comet name research + the 2026-04-16 north-star mockup | Apple Books + The New Yorker longform + frankchimero.com + Hermès "Tactile Sculptures" (added 2026-04-30) |
| **Typography** | Large centered serif hero + tiny serif caption + zero chrome labels | Same family + 60-72ch measure + oldstyle proportional nums + asymmetric inset |
| **Light direction** | Single cosmic source (comet/star) | Single off-axis warm light (page-on-deck) |
| **Emotion** | Cosmic loneliness · permanence · single bright element vs vast dark | Paper intimacy · warmth · near · touchable |
| **Canonical doc** | `cosmic canon` (TO BE WRITTEN — see §7) | `feedback_loom_paper_recipe_canonical.md` v1.0 SEALED 2026-04-25 |

### Why two and not one

A single substrate (e.g. paper everywhere) couldn't carry the *brand* moments — splash and about pages need to declare *what Loom is*, which calls for cosmic-scale gravity. A single cosmic substrate couldn't carry the *working* moments — reading needs warm-paper intimacy, not deep-space distance.

The analog: Hermès as a brand has two substrates too. Their global advertising is cosmic-scale (a single silk scarf floating in vast empty space); their store interiors are paper-scale (leather, wood, warm light). Both are unmistakably Hermès because the discipline (restraint, single saturate, monolithic palette, hand-placed asymmetry) is shared.

Loom inherits this dual-substrate model. The discipline is uniform; the palette splits at session-boundary vs working-state.

---

## 5. 静奢 Disciplines — The Seven Rules, Differentiated

`feedback_loom_unified_material_scene.md` (memory, 2026-04-30) extracts seven disciplines from Hermès / Loro Piana / Marginalia / DawoodUI references:

1. Emptiness as shape
2. Monolithic palette with one saturate
3. Hand-placed asymmetric
4. Object as sculpture (not catalog item)
5. Single off-axis warm light
6. Material is the message (no logos / labels / taglines)
7. Slow gaze invited

**Critical refinement**: these seven do NOT apply uniformly. They differentiate by 顺手 IN vs 体面 OUT (per `feedback_loom_smooth_in_dignified_out.md`):

| Discipline | IN (Encounter / Respond — speed-first) | OUT (Read / Distill / Return — dignified) |
|------------|-----------------------------------------|----------------------------------------------|
| 1. Emptiness as shape | Cautious — must not hide click targets | Full force |
| 2. Monolithic palette | Full force (paper canon palette throughout) | Full force |
| 3. Hand-placed asymmetric | **Skip** — costs identification speed | Full force |
| 4. Object as sculpture | Skip — capture is action, not ceremony | Full force — active source dominates canvas |
| 5. Single off-axis warm light | Full force | Full force |
| 6. Material is the message | Partial — preserve first-run discoverability | Full force |
| 7. Slow gaze invited | Partial — capture moments must feel responsive | Full force |

The trap to avoid: **静奢 ≠ aestheticization that hurts use**. Hermès objects sit on shelves to be admired; Loom is software for thinking. Each discipline must AID the user's work, not block it. Bound by `LOOM_RULES §3` vetoes (especially V8 per-book grouping, V11 no duplicate UI for same outcome).

---

## 6. Surfaces × Verbs — Inventory

| Surface | Verbs served | State | Owner |
|---------|--------------|-------|-------|
| `LoomMinimalRootView` | (frame) | ✓ Default | Claude territory (reading-flow slicing pending commit) |
| `KnowledgeSidebarView` | Encounter | Functional but flat-list visual | Claude (visual upgrade) |
| `SourceFileView` (PDF) | Read + Respond | ✓ Single capture primitive 2026-04-26 | Claude |
| `LoomFolderHomeView` (Markdown page) | Read + Respond | ✓ Heal-on-load + per-book sections + edit / promote / delete | Claude |
| `loom-render/capture/page.tsx` | Read | Phase C M1/Path B partial | Codex (capture territory) |
| `loom-render/captures/page.tsx` | Encounter (capture index) | Magazine landing | Codex |
| `loom-render/snapshot/page.tsx` | Read (full-fidelity) | Snapshot viewer | Codex |
| `LoomAIBar` / Ask AI panel | Respond | ✓ Streaming + bidirectional Note↔AI 2026-04-26 | Claude |
| `LoomWebExtension` | Encounter (web capture) | ✓ v1.4.6 with CaptureAST in flight | Codex |
| `Capture*.swift` host | Encounter (web capture native side) | In CaptureAST pivot | Codex |
| **Phase C M2 (List shape renderer)** | Read (list-shaped sources) | **Not started** | Future |
| **Phase C M3 (Article shape renderer)** | Read (article-shaped sources) | **Not started** | Future |
| **Phase C M4 (Passage / Conversation shapes)** | Read (passage / chat sources) | **Not started** | Future |
| **Connect surface (Echoes eyebrow)** | Connect | **Does not exist** | Future, see §7 |
| **Return surface (Last-read eyebrow)** | Return | **Does not exist** | Future, see §7 |
| **Brand splash / about / empty** | (frame for all verbs) | **Does not exist** | Future, see §7 |
| **Distill section in `Loom.md`** | Distill | Partial — AI Tier 1 source-aware exists; tagged section convention not formalized | Future |

---

## 7. New Product Work Required

Three pieces of Loom's six-verb product genuinely don't exist yet. Each requires its own design + plan:

### 7.1 Connect surface — "Echoes eyebrow"

**The user moment**: while reading a passage, the user sees a quiet inline cue: *"Echoes from [other source]: [specific note you wrote earlier]"*. One click expands the cited note in a margin column (or another paper card overlay). The user dismisses with Esc.

**Design constraints**:
- Not a graph view (Obsidian) — Loom rejects network/graph metaphors per `feedback_loom_dual_friction_purpose.md`
- Not a recommendation list — that's quizzing (V4)
- One quiet eyebrow per page when relevant; zero when not relevant; never a notification
- Detection driven by AI semantic similarity between current passage + prior notes, but the SURFACE is deterministic (one eyebrow, dismissable, no scoring shown)
- User can click an Echo to navigate to source; clicking does NOT mark the connection as "accepted" — Loom doesn't track connection-as-data, only as transient UI cue. (Otherwise it slides toward auto-clustering, which V5 forbids.)

**Status**: **does not exist**. Needs its own plan: `plans/connect-surface-echoes.md` (TBD).

### 7.2 Return surface — "Last-read eyebrow"

**The user moment**: opening a Page after ≥7 days shows a one-line eyebrow at the top: *"Last read 12 days ago · 3 notes · pattern: [one-line summary]"*. Below the eyebrow, new content (since last open) is marked with a faint `*` or `+` indicator.

**Design constraints**:
- Eyebrow is paper-canon-styled (small serif italic, oldstyle nums, tertiary ink color)
- AI-generated summary, but user can edit (V8 / user-retains-edit-power)
- Not a popup, not a badge, not a "new!" indicator — quiet integration
- Detection of "what's new since last read" requires source-mtime tracking + per-page user-last-visit tracking. Both are local, sandbox-stored.
- Dismissable but not automatically removed — stays as page metadata until user edits/clears

**Status**: **does not exist**. Tier 1 source-aware AI prompt has the data (prior notes); needs UI surface. Plan: `plans/return-surface-last-read.md` (TBD).

### 7.3 Cosmic canon

**The need**: Working substrate has a 10K-line canonical doc (`feedback_loom_paper_recipe_canonical.md` SEALED 2026-04-25). Brand substrate has only a north-star image (the 2026-04-16 mockup) and folder-of-references (`Pictures for Design/彗星/`). Need a peer-grade canonical doc that crystallizes:
- Black palette (which `#0?0?0?` family is canonical?)
- Comet/star motif rules (single bright element discipline)
- Hero typography spec (point sizes, line-heights, italic-vs-roman)
- Wordmark placement rules
- Negative space ratios
- When Cosmic appears (session-boundary trigger conditions)
- When Cosmic must NOT appear (working state — never blends in)

**v0.1 seed disciplines** (to be expanded into the canonical doc later):

1. **Single bright element against vast dark** — comet mist, single star, single moon. Never multiple.
2. **Hero text centered, generous line-height** (1.4 minimum), italic-roman mix (italic for emotional, roman for declarative).
3. **No chrome whatsoever** — no nav, no buttons, no badges. Just wordmark + hero + caption.
4. **Wordmark in serif italic, top-left corner** at small size.
5. **Caption below hero, narrow measure** (~50ch), tertiary color, smallcaps optional.
6. **Cosmic substrate fades TO paper substrate when working state begins** — not a hard cut. ~800ms fade is enough for the brain to register the threshold.

**Status**: **not written**. Plan: `plans/cosmic-canon-v1.md` (TBD).

### 7.4 AI behavior contract under unified vision

AI plays a role in verbs 3-6 (Respond / Connect / Distill / Return) but stays within `LOOM_RULES V3` (not always-visible) and V4 (curiosity-led):

- **Respond**: AI is summoned by user (Cmd+E / right-click). Curiosity-led.
- **Connect**: AI generates Echoes detection in background. Surface is one eyebrow per page (UI) — quiet, dismissable, never quiz-shaped.
- **Distill**: AI drafts a `## Distilled` section on user request. User reviews/edits/accepts. (Already in `LOOM_RULES §8 2026-04-26` "Bidirectional Note ↔ AI".)
- **Return**: AI generates the "Last-read · pattern" eyebrow on Page reopen. Editable by user.

The contract: AI may **OFFER** information unrequested ONLY when the offer is (a) quiet (single eyebrow, no popup), (b) dismissable, (c) not interrogative (never quiz-shaped). Information offering ≠ quizzing.

This extends V3/V4 without violating them, but it's a non-trivial extension that should be reviewed when Connect and Return surfaces are designed.

---

## 8. Sequencing — Tier 1 to Tier 6

Six tiers, roughly mapped to multi-week windows. Tiers 1-3 are evolutions of in-flight work; Tiers 4-6 are net-new product work.

| Tier | Work | Status |
|------|------|--------|
| **1** | Codex CaptureAST architecture pivot + reading-flow Swift slicing + DS v1 lib foundation + tranche 1 | **In flight** (2026-04-30) |
| **2** | Phase C M2 (List shape renderer) — first AST-driven renderer; validates the data→render pipeline | Plan exists; not started |
| **3** | Phase C M3 (Article shape) + sidebar objecthood rebuild + AI panel as summonable object | Partially planned; not started |
| **4** | Cosmic canon v1.0 SEALED + brand surfaces (splash / about / empty) implemented | **Net-new** product work; no plan yet |
| **5** | **Connect surface (Echoes eyebrow)** designed + built | **Net-new** product work; no plan yet |
| **6** | **Return surface (Last-read eyebrow)** designed + built | **Net-new** product work; no plan yet |

Sequencing rationale:
- Tier 1 must finish before Tier 2 because Phase C M2 needs CaptureAST as input shape
- Tier 2 must finish before Tier 3 because M3 (Article) extends M2's content-shape pattern
- Tier 4 is independent of Tier 1-3 in principle but should follow them to avoid splitting design attention
- Tier 5 needs Tier 1+2+3 to produce enough cross-source content to detect echoes against
- Tier 6 needs ≥1 month of usage data per source to demonstrate "what's new since last read"

Approximate calendar (rough): Tier 1 finishes within days; Tier 2 ~1-2 weeks; Tier 3 ~1 month; Tier 4 ~3-4 weeks; Tier 5 ~6 weeks (includes 2 weeks of detection-logic R&D); Tier 6 ~3 weeks. Total: ~5-6 months to full unified vision.

---

## 9. Success Criteria

The unified product is correctly designed when these four tests pass:

### 9.1 Six-verbs test
A new user is given a folder of 5 PDFs. They do the full sequence: import → read one → take 3 notes → ask AI to translate one passage → close → return next day → see "last read" eyebrow → notice an "Echoes" cue → click → navigate cross-source → distill a pattern. Each verb finds an entry point in ≤2 clicks. If any verb takes ≥3 clicks or hides behind a chrome label, unification has failed.

### 9.2 One-glance test
Take random screenshots of any Loom surface (sidebar, reading page, splash, captures landing, AI panel, snapshot). Show to a designer who hasn't seen Loom. Within 2 seconds they say: "This is Loom; it's not Notion / Obsidian / Roam." Substrate cohesion confirmed. If they say "looks like a [Notion clone / Obsidian variant]", the visual identity hasn't unified.

### 9.3 Hermès / 30-day test
A daily user uses Loom for 30 days. By day 30, they identify ≥3 craft details they hadn't noticed on day 1 (e.g., "the bronze pin under the page edge", "the way the AI panel slides in from the right with shadow gravity", "the eyebrow's italic small caps"). Per Hermès rule: details rewarded by use, not noticed on day 1. If users ON DAY 1 are pointing out craft details, restraint has failed.

### 9.4 6-month moat test
Six months in, users say: "I can't go back to [previous tool] because I'd lose the Echoes / Return moments — those are how I think now." Connect + Return surfaces have proven to be the competitive moat, not decoration. If users could trivially substitute Loom with Obsidian + workflow tweaks, the unique-product claim fails.

All four tests must pass for the unified product to be considered shipped. They are not separate metrics — they're conjunctive.

---

## 10. Relationship to Other Documents

This doc sits at the **vision** layer. Below it:

| Document | Layer | What it covers |
|----------|-------|----------------|
| `LOOM_RULES.md` | Invariants / law | What Loom MUST and MUST NOT do (12 vetoes, North Star principles, decision log) |
| `LOOM_USER_PROFILE.md` | Audience | Who the user is, how to fit their grain |
| `plans/loom-unified-product-vision.md` (this doc) | Vision | What unified Loom looks like |
| `plans/phase-c-presentation-layer.md` | Sub-plan | Render-layer milestones (M1-M4) under this vision |
| `plans/loom-design-system-v1.md` | Sub-plan | Token system + migration tranches |
| `plans/design-system-migration-inventory.md` | Sub-plan | Concrete migration shopping list |
| `plans/ingest-extractor-refactor.md` | Sub-plan (shipped) | Capture extractor lanes |
| `plans/ingest-to-learning-loop-bridge.md` | Sub-plan (shipped) | Schema → reading-page bridge |
| `plans/connect-surface-echoes.md` (TBD) | Sub-plan | Tier 5 — Echoes eyebrow design + impl |
| `plans/return-surface-last-read.md` (TBD) | Sub-plan | Tier 6 — Last-read eyebrow design + impl |
| `plans/cosmic-canon-v1.md` (TBD) | Sub-plan | Tier 4 — brand substrate canonical doc |

Memory entries that ground this vision:
- `feedback_loom_paper_recipe_canonical.md` — paper canon SEALED v1.0
- `feedback_loom_unified_material_scene.md` — substrate authenticity / 实物质感 / 静奢 disciplines
- `feedback_loom_smooth_in_dignified_out.md` — 顺手 in / 体面 out
- `feedback_loom_dual_friction_purpose.md` — Loom's purpose at a higher level
- `feedback_learn_not_organize.md` — north-star principle (notes are byproducts)
- `feedback_chan_design.md` — with behavior, not animation
- `feedback_perceptual_meta.md` — exploit human + nature + hardware
- `feedback_design_references.md` — DawoodUI cursor-as-light + flipbook chrome don't-take

---

## 11. Open Questions (honest unknowns)

These are NOT decisions; they are unresolved questions whose answers shape the vision:

1. **Is Page-collapse correct, or will Connect / Return need their own surfaces?** Working hypothesis: Page-collapse via eyebrows. Could fail if eyebrows feel cluttered or get ignored. Validate in Tier 5/6 prototypes.
2. **Should the AI behavior contract (§7.4) be promoted to a `LOOM_RULES §3` veto?** Currently extends V3/V4. If post-Tier-5 evidence shows AI offering works without violating curiosity-led, formalize as new principle.
3. **At what point do we add Cosmic canon as `LOOM_RULES §11` (Visual / Typography) peer to existing §7 paper specs?** Currently §7 is paper-only. Cosmic canon may need a §7.5 or its own §11.
4. **How does mobile / multi-device fit?** v1 is Mac-only (per `project_loom.md`). Vision assumes Mac. Mobile may need its own substrate variant (probably a single working substrate, no cosmic, since session boundaries are different on mobile).
5. **Sidebar scale**: objecthood-shelf with hand-placed asymmetry doesn't trivially scale to 100+ sources. Open: scrollable shelf with search-fold? Tabbed shelves? Folder-tree fallback at high source counts?
6. **Distill section formalization**: where exactly in `Loom.md` does `## Distilled / YYYY-MM-DD` sit? Top of file (prose region) or per-book section? Heal-on-load needs to know.
7. **Connect surface false-positives**: AI-generated Echoes detection will sometimes surface bad connections. How does the user signal "this isn't useful" without that signal becoming a feedback loop that drifts toward auto-clustering (V5 forbids)?
8. **Return surface privacy**: "Last read 12 days ago + pattern" implies tracking user reading-time patterns per source. Is this stored sandbox-only? Should it be exportable / wipeable?

---

## 12. Update Protocol

**When to update this document**:
- A new top-level surface or substrate is introduced (rare; expect ≤2 over Loom's lifetime)
- A verb collapses or splits (the six are stable; expect changes only after multi-month evidence)
- A success criterion (§9) demonstrably fails and the design must pivot
- A sub-plan ships and changes the inventory in §6

**When NOT to update**:
- For every sub-plan filing — those are referenced, not absorbed
- For implementation details that don't change the vision shape
- For aesthetic refinements within an established substrate

**Update authority**:
- AI assistant currently working on Loom may file proposed updates
- Substantive shape changes (verb decomposition, substrate split, primitive collapse) require product owner approval
- Open Questions (§11) may be appended unilaterally by any AI assistant who finds new ones

**HOT-FILE protocol** (per `tmp/peer-chat-protocol.md`): edits to this file, like any `plans/*.md`, require declaration in peer-chat to avoid concurrent-edit conflicts.

---

*Filed 2026-04-30 by Claude during Codex's CaptureAST architecture pivot. The vision was synthesized across the late-April 2026 session through three rounds of ultrathink analysis with the product owner. It explicitly EMBRACES Codex's CaptureAST work as Tier 1 of the unified roadmap and the Web Capture extension shipping as a Tier 1 prerequisite.*
