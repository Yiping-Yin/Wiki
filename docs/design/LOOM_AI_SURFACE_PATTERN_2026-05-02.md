# Loom AI Surface Pattern — Option ε v2 Design Rationale

**Filed:** 2026-05-02 (v4.1, replacing portions of v4.0 thinking)
**Status:** Design rationale for `LOOM.md` §1.5 (rewritten v4.1) + `LOOM_RULES.md` §7.5 v4.1 + `plans/loom-cmd-k-palette.md` (NEW v4.1)
**Author:** Claude, in dialog with product owner
**Trigger:** Five strategic reframes in one session culminated in user-confirmed Option ε v2: unimodal Loom + 3 AI surfaces split by role (not by mode).

---

## 1. The session arc that produced this design

This document distills 5 reframes into the final architecture. Reading the arc helps future sessions avoid re-walking it.

| Attempt | Thesis | What was wrong |
|---|---|---|
| **v2.0 (baseline)** | Loom = "knowledge tool with AI panel + reader" | Implicit — never explicitly stated as a thesis |
| **v3.0 Camp C γ-heavy** | Add 5 AI co-edit affordances on selection toolbar | Feature-pile: AI buttons everywhere violated substrate purity |
| **β substrate-only** | Delete all internal AI; everything via terminal AI | Lost useful threaded-chat AskAIWindow; substrate too austere |
| **v4.0 γ-light** | Internal AI = background passes; external AI = CLI; no UI surface | Over-推generalized — implied deleting AskAIWindow which user explicitly wants |
| **bimodal proposal** | Reading mode keeps AI panels; writing mode is substrate | Mode-switch friction; user mental load doubles |
| **Option ε v2 (FINAL)** | Unimodal substrate + 3 AI surfaces split by ROLE (not by mode) | User confirmed |

Arc lessons (codified in `tmp/loom-correction-log.md` entry-009/010/011):
1. Architectural thesis must be **explicitly scoped** (mode / surface / phase / role)
2. Don't generalize from a single workflow example to whole product
3. Architecture should derive from **role taxonomy**, not from one example

---

## 2. The role taxonomy that drove the final design

User's actual workflow contains AI in 3 distinct **roles**:

### Role A: Quick generative invocation (one-shot)
- "Rewrite this paragraph more formally"
- "Distill this page"
- "Translate this quote"
- "What is flipdisc?"

**Properties:**
- One-shot (no thread)
- Generative (AI produces new content)
- Summoned (user invokes explicitly)
- Output: in-place edit OR popover answer
- Time: seconds

**Surface that fits:** ⌘K command palette (Cursor pattern adapted)

### Role B: Threaded deep conversation (multi-turn)
- "Tell me about flipdiscs in detail"
- "What's the difference between X and Y?"
- "Continue our discussion of pixel knitting"

**Properties:**
- Multi-turn (chat history matters)
- Generative (AI produces new content)
- Summoned (user opens dedicated window)
- Output: chat history persists across opens
- Time: minutes to hours

**Surface that fits:** AskAIWindow (already exists at 957 lines, ⌘⇧E)

### Role C: Structural / referential plumbing (continuous)
- Auto-typeset raw text (heading detection, list formatting)
- Detect 5 shapes (Article / List / Passage / Conversation / Syllabus)
- Find cross-references to other Loom docs
- Lookup external citations

**Properties:**
- Background (no user invocation)
- NON-generative (only restructure / annotate)
- Invisible (margin marks reveal AI touch)
- Output: applied to document with revert affordance
- Time: continuous (idle-triggered, on open, manual ⌘↩)

**Surface that fits:** Background passes (NEW M4.5)

### What's NOT in v4.1 (deferred or rejected)

- **Always-visible AI bar** (rejected — substrate violation)
- **Inline /ai commands** (rejected — feature-pile, redundant with ⌘K)
- **Generative background passes** (rejected — substrate violation, scope creep risk)
- **Multi-step agent loops in Loom** (deferred — use external AI via CLI)
- **Wiki-scale AI** (deferred to v4.2+)
- **Continuous-while-typing AI** (deferred to v4.2+ as opt-in)
- **AI authoring** (rejected — user is the author)

---

## 3. Why role-based, not mode-based

### Mode-based (rejected — bimodal proposal)

Bimodal would have split:
- **Reading mode**: source open, AskAI available, distill panel visible
- **Writing mode**: paper canon edit, background passes, no panels

**Problems:**
- User flow constantly crosses mode boundary (reading → annotate → draft → reference back)
- Mode toggle is friction at every transition
- Two mental models to learn
- Code complexity (mode state, mode-aware UI)

### Role-based (chosen — Option ε v2)

3 surfaces by AI role:
- **⌘K**: quick generative one-shot (any context)
- **AskAIWindow**: threaded deep (any context)
- **Background passes**: structural plumbing (any document)

**Advantages:**
- No mode switching
- One document concept (paper canon, always editable)
- Each surface has clear purpose
- Cursor proved this pattern works (⌘K + ⌘L + background lint)
- User's actual workflow maps cleanly to roles, not to modes

---

## 4. The Cursor pattern translation

Cursor (the AI code editor) has 4 AI surfaces:
1. **⌘K** — inline edit on selection
2. **⌘L** — chat panel (threaded)
3. **Tab** — inline autocomplete
4. **Background** — lint / spell-check

Loom v4.1 adapts:
1. **⌘K** — inline edit OR doc-level operation (broader than Cursor's selection-only)
2. **⌘⇧E** — AskAIWindow chat (threaded)
3. *(no Tab equivalent)* — prose autocomplete is too noisy; defer indefinitely
4. **Background passes** — typeset / structure / link / cite

The translation works because:
- Code and prose both have selection-based edit needs (rewrite, expand, translate)
- Code and prose both benefit from threaded conversation (deep discussion of approach)
- Code lints catch typos / style; prose passes typeset / structure
- Both have invisible-AI infrastructure done well

The **substrate** part comes from paper canon (vs Cursor's editor theme): Loom's typography is the differentiator. Cursor is for code; Loom is for academic-grade prose.

---

## 5. Engineering implications

### What ships (M2 → M8)

| Milestone | Scope | Estimated days |
|---|---|---|
| M1 (DONE) | Thesis docs | n/a |
| M2 | Editable Article shape (a)+(b) only | 5 |
| M3 | Decision gate (review M2 user data) | 1 |
| M4 | Editable hardening (d invariant, e versioning) IF M2 data justifies | 5-7 |
| M4.5 | Background passes (typeset, structure, link, cite, non-generative) | 5-7 |
| M5 | Multi-shape + mobile + a11y | 21-28 |
| M6 | ⌘K palette (7 actions) | 5-7 |
| M7 | Delete LoomAIBar + distill panel (gated on M6) | 2-3 |
| M8 | Loom CLI (6 commands) | 3-5 |
| W.M1 | Wiki-scale (deferred v4.2+) | TBD |

### Code deletions (M7, AFTER M6 PASS)

- `macos-app/Loom/Sources/LoomAIBar.swift` (224 lines)
- `app/loom-render/capture/page.tsx` distill panel CSS + JS (~80 lines)
- Total: ~304 lines deleted

### Code preservations (UNCHANGED)

- `macos-app/Loom/Sources/AskAIWindow.swift` (957 lines) — KEPT as-is
- `AskAIContext` singleton — KEPT
- `.loomOpenAskAI` notification — KEPT
- All AI provider clients — KEPT (used by all 3 surfaces)
- Paper canon CSS — sealed, untouched
- Source folder + LoomFileStore — sealed, untouched

### Code additions (M2-M8)

- ⌘K palette UI + handlers (~5-7 days, in `app/loom-render/capture/page.tsx`)
- Background passes (~5-7 days, in capture/page.tsx + Swift bridge)
- Camp C contenteditable (~5 days, in capture/page.tsx)
- Camp C invariant guard + versioning (~5-7 days, conditional on M2 data)
- Loom CLI (~3-5 days, NEW Swift CLI binary in `macos-app/Loom/Sources/CLI/`)

---

## 6. Substrate purity test — Option ε v2 PASSES

A substrate (Word / Excel / PowerPoint) is characterized by:
- Universal applicability (any user, any field)
- Stable file format (decades of compatibility)
- AI/utility surfaces are SUMMONED, not always-visible
- User is the author; tool is the substrate

**Word equivalents for Loom v4.1:**

| Word | Loom v4.1 |
|---|---|
| Document body | Paper canon document (Camp C editable) |
| Spell-check (background) | Background passes (typeset / structure / link / cite, non-generative) |
| Tools menu (summoned) | ⌘K palette (summoned generative actions, hard-capped at 7) |
| Comments / Track Changes | Margin marks for AI-touched content |
| Find & Replace | Loom CLI search (`loom search`) |
| Header / Footer | Paper canon running heads / folio |

**Excel equivalents:**

| Excel | Loom v4.1 |
|---|---|
| Cells (substrate) | Paper canon document |
| Auto-calculate (background) | Background structure / link passes |
| Formula bar (summoned via `=`) | ⌘K palette (summoned via shortcut) |
| Pivot tables (summoned via menu) | AskAIWindow (summoned via ⌘⇧E for deep work) |

Loom v4.1 is structurally consistent with the Word/Excel substrate pattern. Adding always-visible LoomAIBar would violate this; v4.1 deletes it.

---

## 7. What v4.1 is NOT

- ❌ NOT a Cursor clone — Loom is for prose at academic typography; Cursor is for code
- ❌ NOT a Notion AI competitor — Notion AI is bolt-on; Loom AI is structurally integrated
- ❌ NOT a vertical AI app — substrate position matters more than feature breadth
- ❌ NOT an LLM wrapper — paper canon + source folder + immutability are the foundation; AI is one of three surfaces
- ❌ NOT a multi-step agent — single-step per invocation; multi-step work goes external via CLI

---

## 8. Honest unknowns (gating M3 → M4 → M4.5 → M6)

- **M2:** Will users actually edit Loom rendering, or close-and-export to Notion? M2 user data tells us.
- **M4:** Are invariant guard + versioning needed, or is ⌘Z sufficient? M2 breakage incidents tell us.
- **M4.5:** Are background passes useful or annoying? Pass acceptance rate (margin-mark accept vs revert) tells us.
- **M6:** Does ⌘K palette cover distill + LoomAIBar functionality? User testing during M6 → M7 gating period tells us.
- **CLI:** Do external agents (Codex / Claude Code / Cursor) actually adopt Loom CLI? Adoption rate tells us; if zero, MCP may be needed sooner.

---

## 9. The deepest claim of v4.1

Loom is positioned at an unoccupied intersection:

```
              VERTICAL AI APP                SUBSTRATE
              (feature-pile)                 (purity)
                 ↑                              ↑
                 |  Cursor / Notion AI         |  Word / Excel / PPT
                 |  ChatGPT-as-tool            |  LaTeX (frozen variant)
                 |                              |
                 |                              |
                 + ────────────────────────── + 
                                                |
                                                |  ← LOOM v4.1
                                                |  (substrate purity +
                                                |   modern AI surfaces by role +
                                                |   academic typography)
```

No incumbent occupies this intersection cleanly:
- LaTeX/Prism = substrate-pure but frozen output (no edit)
- Notion = editable but Camp B typography
- Cursor = AI-rich but for code
- Word + Copilot = substrate + AI but typography is corner-cut

Loom v4.1's position: **substrate + paper canon + 3 AI roles done right** = the first tool to achieve this combination.

---

## 10. Cross-references

- `LOOM.md` §1.5 v4.1 — substrate positioning + role taxonomy summary (canonical)
- `LOOM.md` §6.5 v4.1 — Camp C editable render (M2 scope cut to a+b)
- `LOOM.md` §6.7 v4.1 — input surface + AI passes (scope clarified)
- `LOOM.md` §11 — roadmap (M-series milestones updated)
- `LOOM_RULES.md` §7.5 v4.1 — operating rules + 12 bans
- `plans/loom-camp-c-editable-render.md` v4.1 — M2 scope cut, AI co-edit deleted
- `plans/loom-ai-passes.md` v4.1 — non-generative hard rule added
- `plans/loom-cmd-k-palette.md` v4.1 — NEW spec for the 3rd AI surface
- `plans/loom-cli.md` — external AI integration (unchanged from v4.0)
- `docs/design/PRISM_VS_NOTES_VS_LOOM_2026-05-01.md` — A/B/C camp framing (kept; v4.1 reframes within Camp C)
- `tmp/loom-correction-log.md` entry-007 — v4.0 substrate reframe (partially superseded)
- `tmp/loom-correction-log.md` entry-009 — thesis-scoping lesson
- `tmp/loom-correction-log.md` entry-010 — generalization lesson
- `tmp/loom-correction-log.md` entry-011 — role-taxonomy meta-lesson
