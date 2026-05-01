# Loom Camp C — Editable Render Layer

**Status:** M1 thesis filed 2026-05-01. M2-M5 gated on user authorization + data.

**Owner:** Claude (initial spec), implementation TBD when M2 starts.

**Cross-references:**
- `LOOM.md` §1.5 (Camp C positioning) + §6.5 (engineering decomposition)
- `LOOM_RULES.md` §7.5 (operating rules + bans)
- `docs/design/PRISM_VS_NOTES_VS_LOOM_2026-05-01.md` (design rationale)
- `tmp/loom-correction-log.md` entry-006 (strategic reframe)

---

## Why this plan exists

Knowledge tools have always forced a choice: Camp A (LaTeX/Prism — frozen-beautiful) or Camp B (Notion/Notes — editable-mediocre). Loom's product position is **Camp C** — Prism-grade typography that is editable in place with AI co-edit affordances. This plan is the engineering path from thesis to MVP.

## Sequencing principle

**Each milestone gates the next on USER DATA, not on schedule.** Per `tmp/loom-correction-log.md` entry-005 ("don't ship rules for un-lived workflows"), no Camp C code ships until the prior milestone produces real validation data.

---

## M1 — Thesis falling (now, 2026-05-01)

**Scope (zero code):**
- `LOOM.md` v3.0 — §1.5 (Camp C positioning) + §6.5 (engineering decomposition) + §11 Tier C entries
- `LOOM_RULES.md` §7.5 — operating rules and bans
- `plans/loom-camp-c-editable-render.md` (this file)
- `docs/design/PRISM_VS_NOTES_VS_LOOM_2026-05-01.md`
- `tmp/loom-correction-log.md` entry-006

**Exit criteria:**
- All 5 docs filed in repo
- User reads at least §1.5 + §6.5 + this plan and confirms direction (or pushes back, in which case reverse-write entry-007)

**Time:** ~2 hours (mostly writing this commit)

---

## M2 — Single-shape contenteditable prototype

**Scope:**
- Pick the **Article shape** (most common in Loom captures, simplest visual structure)
- Mount `contenteditable="true"` on the body element of the Article render in `app/loom-render/capture/page.tsx`
- Implement naïve markdown roundtrip:
  - User edits DOM → on debounced blur, serialize back to markdown via existing marked-style transform reversed
  - On save, write to existing `LoomFileStore` path (sandbox)
- DO NOT ship in this milestone:
  - AI co-edit affordances (deferred to M4)
  - Block versioning (deferred to M4)
  - Structural invariant guard (deferred to M4 — accept that user CAN break things in M2)
  - Other shapes (List / Passage / Conversation / Syllabus — deferred to M5)
- Add a NOTE in the reader UI (small banner) saying "Editable preview — break things, give feedback. Block versioning + AI co-edit coming in next phase."

**Coordination:**
- Reader page (`app/loom-render/capture/page.tsx`) is shared with Codex (capture work). HOT-FILE coordination via peer-chat before starting.
- Per-region anchoring (Codex's P0) should be either complete OR explicitly parallelizable before M2 starts.

**Engineering estimate:** 3-5 days, single agent (Claude or Codex).

**Exit criteria (USER DATA, gating M3):**
- User uses the editable Article reader for **at least 1 week** of normal Loom use
- User logs at least 5 edit incidents (good or bad) in `tmp/loom-correction-log.md` as Camp-C-area entries
- We have concrete data on:
  - Did users naturally edit, or instinctively close-and-export-to-Notion?
  - How often did naïve markdown roundtrip lose information?
  - What's the most common "I broke the canon" incident?
  - Subjective: did editing the rendering feel right, or did it feel awkward?

---

## M3 — Decision gate (review only)

**Scope:**
- Review M2 user data
- Make one of three decisions:
  1. **PASS — proceed to M4 full MVP** (data shows users edit naturally, breakage is rare, marked roundtrip is acceptable)
  2. **SCOPE-DOWN — ship simpler version** (e.g., editable but no AI co-edit; or editable only for drafts not articles)
  3. **ABORT — revert M2, keep Loom read-only, accept Camp B-or-export workflow** (data shows users don't actually want to edit Loom; export-to-Notion is the real workflow)

**Exit criteria:**
- Decision filed as a new `tmp/loom-correction-log.md` entry-NNN
- If PASS: proceed to M4. If SCOPE-DOWN: spec the reduced version here. If ABORT: revert M2 commit + update `LOOM.md` §1.5 to reflect the wrong-thesis lesson.

**Time:** 1 day (decision review)

---

## M4 — Full Camp C MVP (gated on M3 PASS)

**Scope (5 modules per `LOOM.md` §6.5):**

### Module (a) — Editable paper canon hardening
- `contenteditable` on `.loom-capture-article` (already in M2)
- Edge-case CSS for selection, caret behavior, IME composition
- Mobile responsive (hard — defer to M5 if blocking)
- **Time:** 1-2 days

### Module (b) — DOM ↔ Markdown bi-directional binding
- Replace M2's naïve roundtrip with structured AST-based binding
- Use existing CaptureAST schema where possible
- Detect Loom-custom components (figures, callouts, ProvenanceSlip, drop-cap markers, ornaments) and roundtrip them via JSON-frontmatter blocks
- AI edits source MD → local DOM region re-renders (not full reload) via React reconciliation
- **Time:** 3-5 days
- **Risk:** lossy roundtripping of custom components; may need a structured intermediate AST. Surface in correction log if hits.

### Module (c) — AI co-edit affordances on selection
- Existing `loom-capture-sel-toolbar` (Highlight / Note / Copy link + transient highlight model from 2026-05-01) gains 5 new buttons:
  - **Rewrite** — selected text → AI rewrite suggestion → diff modal → accept/reject
  - **Expand** — selected paragraph → AI expansion suggestion → inline accept/reject
  - **Cite source** — selected claim → AI find supporting passage in user's Loom corpus (uses ContentRootStore + EmbeddingStore) → inserts citation footnote
  - **Translate** — selected text → AI translate to user's secondary language → diff modal
  - **Footnote** — selected text → AI generates footnote (definition / context / source) → inline insert
- Each wires to `callAiPrompt` Swift bridge with sufficient context window
- **Time:** ~1 day per affordance, 5 days total
- **Coordination:** AI co-edit UI is in `app/loom-render/capture/page.tsx` (shared with Codex). HOT-FILE.

### Module (d) — Structural invariant guard
- Pick strategy:
  1. **CSS approach** — `user-modify: read-only` on shells (`<figure>`, `<table>`, `.loom-callout`, drop-cap container, chapter ornament), `user-modify: read-write` on inner text spans
  2. **MutationObserver approach** — observe DOM mutations; if a destructive deletion crosses a structural boundary, undo via `document.execCommand('undo')` and show a brief toast "Structural element protected — use Edit Markdown menu to remove"
- Hybrid likely best: CSS for the common case, MO as fallback for keyboard navigation edge cases
- **Time:** 2-3 days
- **Test:** generate adversarial edit sequences (delete via Backspace from end of text, select-all-and-delete, paste-replace) and verify no structural elements are corrupted

### Module (e) — Block-level versioning + history
- On every debounced edit (~500ms idle), snapshot the source MD
- Store snapshots in `~/Library/Application Support/Loom/<key>/history/<timestamp>.md`
- UI: a small "history" affordance in the reader (perhaps inside the existing meta line) opens a side-panel with snapshot list + diff view
- Rollback at full-doc granularity in MVP; block-granularity rollback deferred unless user demand arises
- **Time:** 3-5 days

**M4 total estimate:** ~15-20 days for full 5-module ship.

**Coordination during M4:**
- Reader page (`app/loom-render/capture/page.tsx`) is the most-touched file. Use HOT-FILE protocol aggressively.
- Codex's per-region anchoring + Claude's Camp C work both touch this file. Sequence them serially (anchoring first, Camp C second) OR carve clean territory rules for parallel work.

**Exit criteria (USER DATA, gating M5):**
- User uses M4 editable rendering with all 5 modules for **at least 2 weeks**
- correction log Camp-C entries surface real failure patterns and successes
- Decision: extend to other shapes (M5) or hold at Article-only

---

## M5 — Multi-shape expansion + mobile + a11y

**Scope:**
- Apply Camp C editing to remaining 4 shapes: List / Passage / Conversation / Syllabus
- Each shape may have shape-specific invariant rules (Conversation must preserve speaker attribution; Syllabus must preserve week-number ordering)
- Mobile editing experience for paper canon (hard problem — paper canon is desktop-first; mobile may need a "draft mode" variant)
- Accessibility audit (keyboard navigation, screen reader, focus indicators)

**Engineering estimate:** ~3-4 weeks

**Exit criteria:**
- All 5 shapes editable
- Mobile editing usable (per user testing)
- a11y audit clean

---

## Risk register (cross-cutting, all milestones)

| Risk | Probability | Mitigation |
|---|---|---|
| Users prefer to export-to-Notion rather than edit in Loom | Medium | M2 user data tells us; if confirmed, ABORT at M3 |
| AI co-edit on prose is less useful than on code | Medium | M4 module (c) ships incrementally; abandon affordances that don't get used |
| DOM ↔ MD roundtripping is fundamentally lossy for Loom custom components | Medium-high | Structured AST as intermediate (deferred design work); fallback: read-only mode for documents containing custom components |
| `contenteditable` breaks paper canon CSS in unexpected ways (caret position, selection visuals, etc.) | Medium | M2 surfaces these; CSS adjustments in M4 module (a) |
| Mobile editing of paper canon is impossible | High | M5 may discover paper canon is desktop-only; mobile may need a separate "draft mode" CSS variant |
| Coordination cost with Codex (shared reader page) becomes blocking | Low-medium | HOT-FILE protocol + sequential serial work where possible |

---

## What this plan does NOT do

- ❌ Does not modify paper canon visual rules (sealed v1.0 2026-04-25)
- ❌ Does not add an "Edit mode" button (per `LOOM_RULES.md` §7.5)
- ❌ Does not expose markdown source in UI (no split-pane)
- ❌ Does not touch `LoomFileStore` sandbox model
- ❌ Does not modify source folder permissions
- ❌ Does not add new AI panels or popovers (the AI co-edit lives ON the existing selection toolbar)
- ❌ Does not delete askPassage / distill (just downgrades from main entry to convenience shortcut — see `LOOM.md` §1.5 + §6.5)

---

## Ownership conventions

- **M1**: Claude (this commit)
- **M2-M5 implementation**: TBD per milestone. Either Claude or Codex; coordinate via peer-chat at milestone start.
- **Camp C strategic ownership**: Claude (single editor of `plans/loom-camp-c-editable-render.md` + `LOOM.md` §1.5 / §6.5 / §7.5)
- **User decisions**: each gate (M3 especially) requires explicit user GO/SCOPE-DOWN/ABORT call

---

## Update protocol

- When M2 prototype ships: update this file with link to commit + initial user-feedback note
- When M3 decision is filed: append the decision section here + cross-link to correction log entry
- Each subsequent milestone: same pattern — append commit refs + user data + decisions

This plan is append-only for milestone outcomes. Major scope changes require a v2 with explicit changelog at the top.
