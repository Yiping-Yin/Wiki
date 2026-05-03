# LOOM — Product Definition

> **READ THIS FIRST** if you are an AI assistant or human collaborator newly arrived on Loom. This is the canonical product document — what Loom is, why it exists, and how its parts fit together.
>
> **Status**: v4.1 filed 2026-05-02 (Option ε v2 — Loom as unimodal substrate with 3 AI surfaces by role: ⌘K quick-invocation, AskAIWindow threaded chat, background passes structural-only. Cursor-pattern adapted to prose. v4.0 "no panel anywhere" was over-推generalized — corrected per `tmp/loom-correction-log.md` entry-009/010/011.)
>
> **What changed in v4.1** (read this if you knew v4.0):
> 1. **§1.5 re-rewritten** — Loom is unimodal (no mode switching). 3 AI surfaces split by ROLE not by mode:
>    - **⌘K palette** (NEW M6/M7): quick generative invocation (selection-based + document-level). Replaces distill panel + LoomAIBar.
>    - **AskAIWindow** (KEPT, ⌘⇧E): threaded conversation, persistent chat history. The 957-line existing implementation is correct.
>    - **Background passes** (M4.5): structural / referential ONLY (typeset / structure / link / cite). HARD RULE: never generative.
> 2. **§6.5 M2 scope cut** — M2 prototype ships modules (a) contenteditable + (b) DOM↔MD bind only (~5 days, was 10-12). Modules (d) invariant guard + (e) versioning deferred to M4 based on M2 user data.
> 3. **§6.7 scope corrected** — "AI passes" applies to background plumbing only. Generative AI invocation lives in ⌘K palette per `plans/loom-cmd-k-palette.md`.
> 4. **NEW §6.8** — "AI Surface Pattern" enumerates the 3 surfaces by role with explicit boundaries.
> 5. **§7.5 LOOM_RULES rewritten** — generative vs non-generative boundary is the new hard rule.
> 6. **DELETIONS** — `LoomAIBar.swift` (224 lines) + distill panel (~80 lines) DELETED in M7, ONLY after ⌘K palette M6 ships replacements.
> 7. **KEPT** — `AskAIWindow.swift` (957 lines), AskAIContext singleton, all AI provider clients, `.loomOpenAskAI` notification. v4.1 does NOT delete reading-mode threaded chat.
> 8. **Wiki-scale AI** — still DEFERRED to v4.2+ per user 2026-05-02 ("这个是后话").
>
> **The unifying principle**: Loom is a substrate. Substrates have summoned utilities (Word's spell-check, Excel's formulas), not always-visible AI bars. Option ε v2 = Cursor's IDE pattern (⌘K + chat panel + background lint) translated to prose with paper canon as the rendering layer.
>
> **Read order**: this doc → `LOOM_RULES.md` (invariants/law) → `LOOM_USER_PROFILE.md` (audience) → relevant plan in `plans/` → memory entries surface as needed.
>
> **Maintained by**: the AI assistant currently working on Loom. Substantive shape changes (modifying the loop, splitting AI modes, adding a third primitive) require product owner approval. Clarifications and §12 Open Question additions can be appended unilaterally with a peer-chat HOT-FILE declaration.

---

## 1. What Loom Is — In One Sentence

**EN**: Loom is where you build your knowledge system over years, by closing the learning loop on every source you encounter.

**中**: Loom 是你用多年时间一遍遍闭合学习闭环、积淀出自己知识体系的地方。

This single sentence is the product. Every other framing in this document expands on it. Five years from now, when many features have shipped and others have been replaced, this sentence still defines Loom.

**What "knowledge system" means concretely**: not a graph, not a tag tree, not a database. It is your accumulated source-anchored thinking — every PDF, web page, course folder you ever encountered, with your notes, your AI dialogues archived, your compiled artifacts, all in markdown you own. Searchable by full-text. Re-readable as written. Cite-able by anchored URL. Re-compilable when models improve. Exportable in plain markdown. Lives forever in your `LoomFileStore` (or a future iCloud-synced equivalent), independent of any vendor.

---

## 1.5. Loom as 思维超导值 / Substrate (rewritten v4.1)

> v4.0 framed Loom as "no panel anywhere; AI = invisible plumbing globally". User clarified next turn that this was over-推generalized: reading mode wants AskAI; writing mode wants substrate. v4.1 corrects via Cursor-pattern adaptation: unimodal Loom + 3 AI surfaces split by **role**, not by mode. See `tmp/loom-correction-log.md` entry-009/010/011 for the correction.

### The thesis (50 words, user-confirmed 2026-05-02 with explicit role-scope)

> **Loom = paper canon 可编辑文档（unimodal）+ 3 个 AI surface 按 role 分：⌘K 一次性 invocation、AskAI 持续对话窗口、background passes 无形整理（structural-only，never generative）。无 mode 切换。LoomAIBar + distill panel 删除（被 ⌘K palette 替代）。AskAIWindow 保留。外部 AI 通过 Loom CLI 联动。**

### Loom's position — substrate, not vertical AI app

Loom is to thought what **Word / PowerPoint / Excel** are to text / slides / spreadsheets — a stable, predictable, universal substrate. Specifically:

- **Word/PPT/Excel grade of universality**: any field, any user, any context. Not specialized for one vertical.
- **30-year stability target**: markdown + standard frontmatter, no proprietary format, no vendor lock-in. The artifacts you weave today will open in any markdown tool 30 years from now.
- **AI is invisible plumbing**: like Word's spell-check (background, subtle red underline, you accept or fix). Not a feature pile. Not a chat partner. Not the author.
- **User is the author**: Loom hosts the user's expression. AI helps with collection (capture) and organization (typeset / structure / link / cite). Authorship is the user's, always.

### The 织机 (loom / weaving frame) metaphor

A loom is a frame that holds threads under tension so the weaver can produce cloth. Loom-the-app is the same:

| Loom (the weaving machine) | Loom (the app) |
|---|---|
| Frame holds tension | App provides paper canon + file storage |
| Weaver brings threads | User dumps raw content (typed / dictated / captured / pasted) |
| Loom doesn't supply threads | Loom doesn't author content |
| Loom doesn't decide pattern | Loom doesn't impose structure (AI suggests, user accepts) |
| Cloth IS the artifact | Paper canon document IS the artifact |
| Continuous, not batch | AI passes run on idle, not as separate "compile" actions |

### 思维超导值 (thought superconductor)

A superconductor conducts current with zero resistance. Loom-as-thought-superconductor:

- **Zero friction in**: voice, type, paste, capture, drop — all converge to the same writing surface
- **Zero friction in organize**: AI runs typesetting / structuring passes in background; you don't trigger anything
- **Zero friction out**: edit any rendered text in place at paper-canon quality; no mode switch
- **Zero friction connect**: external AI reads/writes Loom files through standard markdown + CLI; no API negotiation

The "超导" is the absence of friction at every layer of thought-flow. This is the design north star.

### Where AI sits (Option ε v2 architecture, v4.1)

```
┌──────────────────────────────────────────────────────────┐
│  USER (the author / weaver)                                 │
└──────────────────────────────────────────────────────────┘
                          │
                          │ voice / type / paste / capture
                          ▼
┌──────────────────────────────────────────────────────────┐
│  LOOM DOCUMENT (paper canon, Camp C editable, unimodal)    │
│  ─────────────────────────────────────────                │
│  • Always reachable; no mode switching                      │
│  • Edit anywhere (Camp C — see §6.5)                        │
│  • AI surfaces are summoned from here, not always-visible   │
└──────────────────────────────────────────────────────────┘
                          │
       ┌──────────────────┼──────────────────┐
       │ generative       │ generative       │ structural-only
       │ summoned         │ threaded         │ background
       ▼                  ▼                  ▼
   ┌────────┐      ┌──────────────┐    ┌──────────────────┐
   │  ⌘K    │      │ AskAIWindow   │    │ Background Passes │
   │ Palette │      │ (KEPT, ⌘⇧E)  │    │ (M4.5+)           │
   │ (M6/M7) │      │ ────────────  │    │ ────────────────  │
   │         │      │ • Persistent  │    │ • Idle 3-5s        │
   │ Quick   │      │   chat        │    │ • On open          │
   │ ask /   │      │ • History     │    │ • Manual ⌘↩        │
   │ inline  │      │ • Threaded    │    │                    │
   │ edit /  │      │   Q&A         │    │ Pass types:        │
   │ doc-op  │      │ • Side by     │    │ • typeset          │
   │         │      │   side w/     │    │ • structure        │
   │ ❌ NO    │      │   source      │    │ • link             │
   │ feature │      │               │    │ • cite             │
   │ pile    │      │               │    │                    │
   │ (≤7     │      │               │    │ ❌ NEVER generative │
   │ actions)│      │               │    │ (only structural / │
   │         │      │               │    │  referential)      │
   └────────┘      └──────────────┘    └──────────────────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          ▼
                  callAiPrompt
                  (5 providers + custom + off)

External AI:
                  ┌──────────────────┐
                  │  Loom CLI (M6)    │
                  │  ──────────────   │
                  │  • capture        │
                  │  • search         │
                  │  • open           │
                  │  • related        │
                  │  • render         │
                  │  • write          │
                  │                   │
                  │  MCP server       │
                  │  v4.2+ deferred   │
                  └──────────────────┘
```

### The 3 AI surfaces by ROLE (not by mode)

**(1) ⌘K Palette** (NEW, M6 spec, M7 ship)
- **Role**: quick generative invocation (one-shot)
- **Triggers on**: keystroke ⌘K
- **Cover**: selection-based edit (rewrite/expand/translate) + document operations (distill/restructure)
- **Output**: in-place at cursor / margin-marked / popover for ask
- **Hard cap**: ≤7 actions to prevent feature-pile drift
- **Replaces**: distill panel + LoomAIBar functionality

**(2) AskAIWindow** (KEPT — `macos-app/Loom/Sources/AskAIWindow.swift` 957 lines)
- **Role**: threaded conversation (deep, persistent)
- **Triggers on**: ⌘⇧E or "Ask AI" menu item
- **Cover**: long Q&A sessions, multi-turn brainstorm, source-passage grounded chat
- **Output**: chat history persists across opens
- **Why kept**: user explicitly confirmed "在阅读层面 Ask AI 我觉得是有用的" (reading mode AskAI is useful) 2026-05-02

**(3) Background Passes** (NEW, M4.5)
- **Role**: structural / referential plumbing (invisible)
- **Triggers on**: idle 3-5s after edit, on document open, manual ⌘↩
- **Cover**: typeset (structural reformat), structure (5 shapes detection), link (cross-reference), cite (external citation lookup)
- **Output**: applied to document with subtle bronze margin marks; hover reveals diff + revert
- **Hard rule**: NEVER generative work. Background AI may rearrange / link / lookup, but never write new content. Generative work goes through ⌘K palette (user-summoned).

### Why split by role, not by mode (v4.1 design rationale)

**v4.0 said**: "no panel anywhere" — over-推generalized.
**Bimodal proposal said**: "reading mode has panels, writing mode doesn't" — adds mode-switch friction.
**v4.1 (Option ε v2) says**: split by AI role, unimodal document, surfaces summoned by purpose.

The user's actual workflow contains 3 distinct AI relationships:
- **Quick ask** ("what is X" / "rewrite this") → ⌘K
- **Threaded deep** (long conversation about source) → AskAIWindow
- **Invisible plumbing** (typeset / link in background) → passes

These are different roles, not different modes. A user might do all 3 in one minute on the same document.

### Substrate purity test (Option ε v2 passes)

**Word**: spell-check (background) + thesaurus (summoned via menu) + no always-visible AI bar = substrate.
**Excel**: auto-calc (background) + formula bar (summoned by typing `=`) + no always-visible AI bar = substrate.
**Loom v4.1**: background passes + ⌘K palette + AskAIWindow (summoned via shortcut) + no always-visible AI bar = substrate. ✓

LoomAIBar (right-edge, always-visible) violated this test. Hence deletion in M7 (after ⌘K palette M6 ships replacement functionality).

### What this means for incumbents

| Tool | Position | Loom's relationship |
|---|---|---|
| Word / PPT / Excel | Universal substrate, basic typography, no AI native | Loom matches substrate purity + adds paper canon + adds AI surfaces by role |
| LaTeX / Prism / Typst | Frozen high-quality output | Loom delivers similar typography but editable, not frozen |
| Notion / Apple Notes | Editable, basic typography, bolt-on AI panel | Loom has paper-canon typography + AI by role (not always-visible) |
| Cursor / Claude Code | Vertical AI for code; ⌘K + chat + background lint pattern | **Loom is Cursor for prose**, with paper canon as the rendering layer. Same affordance map, different domain. |
| Obsidian | Substrate + plugin ecosystem | Loom is opinionated on typography + AI roles; less plugin sprawl |

**v4.1 framing**: Loom = Cursor's IDE-pattern translated to prose / knowledge work, with Word-tier substrate purity and academic-grade typography (paper canon).

### What Loom is NOT (per v4.1)

- ❌ NOT a Cursor for knowledge that mimics ALL Cursor features — no autocomplete (prose doesn't suit), no agent loop in Loom (external CLI handles)
- ❌ NOT a Notion AI competitor — no /ai slash menu, no always-visible AI sidebar
- ❌ NOT a thinking partner that initiates — AI responds to summons (⌘K, ⌘⇧E) or runs structural background. Never proactive content suggestion.
- ❌ NOT a 3D / specialized design tool — text + academic models (math, citations, structured prose, tables) only
- ❌ NOT an LLM wrapper that calls AI for everything — AI is one of many surfaces; substrate quality (paper canon, source folder, file integrity) is the foundation

### Validation status (honest, 2026-05-02)

- **Option ε v2 thesis** = user-confirmed 2026-05-02 with explicit role-scope. 50-word version above.
- **⌘K palette** = M6 work, un-shipped. Spec in `plans/loom-cmd-k-palette.md`.
- **Camp C editable rendering** = M2 prototype (a)+(b) only, gated on user GO. M4 full MVP gated on M2 data.
- **Background passes** = M4.5 work, un-shipped. Spec in `plans/loom-ai-passes.md` (with v4.1 update: non-generative hard rule).
- **External AI via CLI** = M6 work, un-shipped. Spec in `plans/loom-cli.md`.
- **Multi-document wiki-scale stringing** = DEFERRED to v4.2+ per user 2026-05-02 ("这个是后话").
- **Reading-mode AskAIWindow** = KEPT as-is; no migration needed for user.

See:
- `tmp/loom-correction-log.md` entry-007/009/010/011 — full reframe history + meta-lessons
- `plans/loom-ai-passes.md` — background passes engineering spec
- `plans/loom-cmd-k-palette.md` — ⌘K palette engineering spec (NEW v4.1)
- `plans/loom-cli.md` — external AI integration spec
- `docs/design/LOOM_AI_SURFACE_PATTERN_2026-05-02.md` — full Option ε v2 design rationale (NEW v4.1)
- `LOOM_RULES.md` §7.5 — operating rules including generative-vs-non-generative boundary

---

## 2. The Learning Loop — Loom's Object

Real learning is a loop, not a list of activities. Loom hosts the loop:

```
   ┌─────────────────────────────────────────────────────────┐
   │                                                         │
   │  ① Encounter source                                     │
   │     PDF, folder, web, clipboard, video (later)          │
   │              │                                          │
   │              ▼                                          │
   │  ② Read source                                          │
   │     paper canon attention; eyes dwell                   │
   │              │                                          │
   │              ▼                                          │
   │  ③ Ask AI when stuck   ◄── LEARN mode (AI as Teacher)   │
   │     streaming Q&A, source-aware                         │
   │              │                                          │
   │              ▼                                          │
   │  ④ Internalize          [happens in user's head,        │
   │                          not in Loom]                   │
   │              │                                          │
   │              ▼                                          │
   │  ⑤ Write thinking on scratch  ◄── THINK mode entry      │
   │     no formatting pressure, just typing                 │
   │              │                                          │
   │              ▼                                          │
   │  ⑥ Compile to artifact ◄── THINK mode (AI as Typesetter)│
   │     5-15 sec; raw thinking → typeset learning page      │
   │              │                                          │
   │              ▼                                          │
   │  ⑦ Save artifact, anchored to source                    │
   │              │                                          │
   │              ▼                                          │
   │  ⑧ Return weeks later                                   │
   │     last-read eyebrow + Echoes from related sources     │
   │              │                                          │
   │              ▼                                          │
   │  ⑨ Loop back to ② or ③ on a new related source          │
   │                                                         │
   └─────────────────────────────────────────────────────────┘

   Over months: artifacts accumulate, patterns emerge.
   Over years: knowledge system is your aggregated thinking,
                source-anchored, AI-typeset, in markdown you own.
```

Steps ④ (internalize) and ⑨ (loop) are not Loom moments — they are user moments. Loom hosts steps ①-③ and ⑤-⑧. Step ④ happens in the human brain. Step ⑨ happens automatically as users add sources over time.

**The product claim**: No other tool hosts steps ①-⑧ in one place, source-anchored, with markdown ownership.

---

## 3. Three Time Scales

Loom serves the user at three distinct time scales. Each has its own user experience and its own product defense.

### Session (minutes) — the immediate wow

User experience: open Loom → encounter a source → read → ask AI when stuck → close panel → write thoughts → click Compile → watch a typeset learning artifact emerge → save anchored to source. Total: 5-30 minutes per session.

Loom's role: live host of the learning behavior. The wow moment is the Compile step — raw thinking-flow becomes a typeset artifact in 5-15 seconds.

What's defended at this scale: substrate quality (paper canon typography, single light direction, no faux texture) + AI compile reliability.

### Span (days to weeks) — the medium-term wow

User experience: across multiple sessions on related sources, artifacts accumulate. Returning to a source weeks later, the eyebrow shows *"Last read 12 days ago · pattern: [one-line summary]"*. Reading a passage that echoes past notes from another source surfaces a quiet *"Echoes from..."* cue.

Loom's role: short-term memory delegate. Loom remembers your prior thinking better than you can; surfaces it when relevant.

What's defended: source-anchored persistence + cross-source detection without auto-clustering (`LOOM_RULES.md` V5).

Technical hints (Tier 5/6 implementation): Last-read tracking via per-`ContentRoot` last-visit timestamp stored in `LoomFileStore`. Echoes detection via on-device or sandbox-only embedding store (`LoomEmbeddingStore`) computed at compile time + when source is opened; surface filtered to top-1 quietest match per page render. No cross-user data, no central server, no graph view exposed.

### Arc (months to years) — the long-term moat

User experience: hundreds of artifacts later, your knowledge system is your aggregated thinking — source-anchored, AI-typeset, in markdown you own. New sources you encounter trigger AI references to your past thinking from years ago. You cannot easily migrate away because your knowledge system IS Loom.

Loom's role: permanent substrate of personal knowledge.

What's defended: substrate alignment (8 supporting pieces fully cohering) + multi-year user data accumulation (network-effect lock-in inherent to personal knowledge bases).

Technical hints (Arc implementation): no Loom-side migration ever required because storage is plain markdown — old artifacts stay readable as new features ship. As new AI capability arrives, OLD artifacts can be re-compiled (opt-in) to take advantage; uncompiled artifacts remain unchanged. Versioning is per-artifact via `### Compiled · YYYY-MM-DD` header; artifact history accumulates organically. The user can grep their own thinking across years.

---

## 4. Two AI Modes (Functional, Not Temporal)

Loom hosts TWO distinct AI modes. They serve different cognitive states. They are NOT phases — you do not finish LEARN then start THINK; they interleave at high frequency. The user invokes whichever mode they need at the moment.

### Mode 1 — LEARN (AI as Teacher)

**When invoked**: user is encountering new material they do not yet understand. They ask AI questions to absorb information.

**Surface**: Ask AI panel (`LoomAIBar` in macos-app, summoned via Cmd+E or right-click → Ask AI).

**AI behavior**: streaming Q&A. Source-aware (knows the user's prior notes on the same source via Tier 1 source-aware context, see `LOOM_RULES.md §8 2026-04-26`). Curiosity-led (V4 — AI never quizzes the user). Dismissable.

**Metaphor**: tutor / teacher. Answers when asked. Stays silent otherwise.

**Status**: ✅ **built** as of 2026-04-26 (streaming + Tier 1 + bidirectional Note↔AI).

### Mode 2 — THINK (AI as Typesetter)

**When invoked**: user has internalized enough to start synthesizing. They write raw thinking-flow on a scratch surface — no formatting pressure, no structure pressure, just typing what is in their head.

**Surface**: Page body inline edit (`LoomFolderHomeView` editable region) + a Compile button (not yet built).

**AI behavior**: when Compile is clicked, AI reads all of user's scratch + the source + Tier 1 prior notes and produces a structured typeset artifact (math typeset in LaTeX, possibly flipbook frames for step-by-step content, hover-reveals for terms, possibly visualizations). AI does NOT think for the user; AI typesets the user's already-formed thoughts.

**Metaphor**: scribe / typesetter / editor. Composes; does not think.

**Status**: 🔶 **half-built** — scratch surface exists, Compile pipeline does not.

### Critical: both modes coexist on the same Page

The user can have Ask panel open AND be writing in scratch simultaneously. Modes are not exclusive. Loom does not require the user to declare which mode they are in; the surface they touch determines the mode.

This is consistent with `LOOM_RULES.md §2.5` (one primitive over many — the Page is the primitive, both modes operate on it) and V3 (no always-visible AI chrome — Ask panel is summonable, dismissable).

### Mode handshake (shared context envelope)

Both modes share the SAME context envelope. The AI invoked in either mode sees:

- The **source** (PDF passage, web capture markdown, etc.) the user is on
- The **Tier 1 prior notes** (user's earlier annotations on this source)
- The **Ask AI conversation history** archived as inline notes on the same Page (per V8 per-book grouping)
- The **scratch** the user has written so far on this Page

Practically:
- When user is mid-Compile and AI archives an Ask conversation, the next Compile invocation sees that conversation as additional context.
- When user opens Ask panel after writing scratch, the AI can reference the scratch ("you noted earlier that...").
- This shared envelope means **the user's Page is a single coherent context for AI**, not two parallel histories.

Implementation: both `LoomAI.send` (Ask) and the future Compile call build their prompt from the same `gatherPageContext(rootID:)` helper, which reads the Page's `Loom.md` plus the source. Compile differs only in system prompt (typesetter vs teacher) and trigger (button vs user-typed-question).

### Language behavior

The AI follows the user's language, not the source's. If the source is English and the user writes / asks in Chinese, AI responds in Chinese (with original-language quotes preserved as quotes). If the user mixes languages, AI mirrors the user's last-used language. Math, code, LaTeX symbols are language-neutral and rendered identically.

This is consistent with `feedback_loom_language_mirror.md` memory (2026-04-27): "用户用中文问→整段中文答". The Compile pipeline must inherit this rule — typeset artifacts are written in the user's language even if the source is English.

---

## 5. The Page Primitive

Per `LOOM_RULES.md §2.3`: *"Loom = pages. The page (a `ContentRoot`) is the primary unit of meaning."*

Every source maps to a Page. Every Page has its own `Loom.md`. Both AI modes operate on this Page. All learning verbs collapse to operations on the Page:

| Verb | On the Page | Where in `Loom.md` |
|------|-------------|---------------------|
| Encounter | Sidebar adds the Page | (entry registered in `ContentRootStore`) |
| Read | The Page renders | (rendered from `Loom.md` + source files) |
| Ask | Open Ask panel summoned from Page | (Q&A archived as inline notes per V8) |
| Scratch | Edit page body inline | (raw text in prose region) |
| Compile | Click Compile → artifact appears below scratch | (`### Compiled · YYYY-MM-DD` section) |
| Connect | Quiet eyebrow appears on the Page | (cross-source AI reference, transient UI) |
| Return | Eyebrow at top of Page on reopen | (computed from last-read time + diff) |

**No new view types.** All verbs collapse onto the existing primitive. What is needed is the Page becoming expressive enough to host all verbs via inline affordances (eyebrows, sections, the summonable Ask panel, the Compile button).

This is a working hypothesis, not yet a hard veto. Default: try Page-collapse first. Carve out a separate surface only if a verb genuinely fails to fit. (See `feedback_loom_panel_model.md` memory — the 1.5D panel strip was a separate Connect surface that was built then deleted; the current eyebrow-on-Page approach is the second attempt.)

---

## 6. Eight Supporting Pieces

Loom is not eight features. It is eight pieces that converge on one outcome: the user's learning loop closing on every source they encounter.

| # | Piece | Role | Status |
|---|-------|------|--------|
| 1 | Web Capture extension + Capture host | Encounter — bring web sources into Loom | ✅ Built (Safari Web Extension v1.4.6 with CaptureAST in flight) |
| 2 | Folder + PDF + clipboard import | Encounter — bring local sources | ✅ Built |
| 3 | `LoomMinimalRootView` + paper canon | Read — the Page rendering substrate | ✅ Built (paper canon SEALED 2026-04-25) |
| 4 | Ask AI panel (`LoomAIBar`) | LEARN mode — AI teacher | ✅ Built |
| 5 | Page body inline edit | THINK mode — scratch surface | ✅ Built |
| 6 | CaptureAST architecture | Source structured-data layer feeding Compile | 🔄 In flight (Codex pivot 2026-04-30 → 2026-05-01) |
| 7 | Phase C content-shape detection | Compile output format dispatch | 📅 Planned (M1/Path B partial; M2-M4 not started) |
| 8 | **Compile pipeline** | THINK mode — AI typesetter; the missing piece | ❌ Not built |

Plus the Design System v1 (canonical token source at `lib/loom-design-system.ts`, paper canon visual tokens) feeds visual consistency across all 8.

### The convergence diagram

```
   [Web Capture v1.4.6] ──┐
                          │
   [Folder/PDF/clip]    ──┼──→  Page primitive  ──┬──→ LEARN mode (Ask AI)  ──┐
                          │     (paper canon)     │    streaming + Tier 1    │
   [CaptureAST]         ──┘                       │                          │
   (source structure)                             └──→ THINK mode            │
                                                       ├── Page body scratch ┤
                                                       │                     │
                                                       └── ╔══════════════╗  │
                                                           ║  COMPILE     ║  │
                                                           ║  PIPELINE    ║◀─┘
                                                           ║              ║
                                                           ║  Phase C     ║
                                                           ║  shape       ║
                                                           ║  detection   ║
                                                           ║              ║
                                                           ║  paper canon ║
                                                           ║  + DS tokens ║
                                                           ╚══════════════╝
                                                                   │
                                                                   ▼
                                                          typeset artifact
                                                          in Loom.md (markdown)
```

**Loom is not 6 verbs or 3 capabilities or two modes — it is one Compile primitive on top of seven substrate pieces.** Eight pieces full-aligned IS the product. Compile alone is just a feature. Substrate alone is just plumbing. The full alignment is what nobody else has.

### Future-extensibility (when new source types arrive)

When Loom adds video, audio, or notebook source support: these become new INGEST lanes feeding into the existing CaptureAST schema. They do NOT become a 9th supporting piece. Each new source type extends piece #2 (folder/PDF/clipboard import) with a new ingestion handler and a new content shape for Phase C detection. Compile pipeline is source-type-agnostic — it only sees structured text + metadata, regardless of original medium. This keeps the architecture stable as Loom's source coverage grows.

---

## 6.5. Editable Render Layer — The 9th Supporting Piece (revised v4.0; v4.1 M2 scope cut to modules (a)+(b))

§1.5 (rewritten v4.1) positions Loom as a substrate. This section is the engineering decomposition for the editable rendering layer — Camp B's editability applied to paper canon. The v3.0 module list had **5 modules** including AI co-edit affordances; v4.0 deletes that 5th module per the substrate thesis. **v4.1 further cuts M2 ship scope to modules (a)+(b) only**; (d) invariant guard + (e) versioning gate to M4 based on M2 user data.

### Why this is the 9th piece, not part of an existing one

Pieces 1-8 cover INGEST → STRUCTURE → COMPILE → READ. The user reads the result. v3.0 added a 9th: **EDIT-IN-RENDER**. v4.0 keeps this 9th piece but scopes it tighter — editing is a substrate property (Word/PPT/Excel-tier), not an AI co-edit surface.

### The 4 engineering modules (v4.0 — was 5 in v3.0)

**(a) Editable paper canon** — Mount `contenteditable` on `.loom-capture-article`. Existing paper canon CSS rules (vellum, page-on-deck, drop cap, oldstyle figures, hanging punctuation, KaTeX math, asymmetric inset) all apply during edit. Estimated: 1-2 days for naïve implementation, more for hardening.

**(b) DOM ↔ Markdown bi-directional binding** — User edits DOM → diff and write back to source `.md`. AI passes (see §6.7) edit source `.md` → re-render local DOM region (not full reload). Single source of truth for content, two views for editability. Estimated: 3-5 days. Risk: lossy roundtripping for complex Loom-custom components (figures with captions, callouts, ProvenanceSlip).

**(c) ~~AI co-edit affordances on selection~~** — **DELETED v4.0.** Was: selection toolbar with rewrite / expand / cite / translate / footnote buttons. Per substrate thesis, AI is invisible plumbing not a feature surface. The same value (AI helps refine selected text) is delivered via §6.7 AI passes operating on the entire document, not via selection-based UI.

**(d) Structural invariant guard** — Chapter ornaments, drop caps, figure containers, table structure, callout shells must survive arbitrary user edits. Two strategies (pick one or hybrid):
1. CSS `user-modify: read-only` on structural shells, `read-write` on text spans inside
2. MutationObserver intercepts destructive deletions and wraps them in undo prompts

Estimated: 2-3 days. Risk: users find a thousand ways to break invariants; cost may grow.

**(e) Block-level versioning + history** — Every edit auto-snapshotted, rollback at block granularity. Apple Notes has this natively; users rarely use it but its presence is reassurance. Estimated: 3-5 days.

**Total engineering estimate**: ~10-12 days for full MVP. v4.1 splits as M2 (modules a+b, ~5 days) + M4 (modules d+e, ~5-7 days, gated on M3 PASS). v3.0 was 15-20 days; v4.0 cut to ~10-12 by removing module (c); v4.1 further phases the remainder.

### What this does NOT change

- **Paper canon visual rules**: sealed v1.0 (2026-04-25). Adding editability does not change vellum, measure, drop caps, or any other typographic decision. CSS rules are immutable through this work.
- **Source folder immutability**: edits to `.md` continue to go through `LoomFileStore` (sandbox), never to the user's source folder.
- **Read-only rendering remains the default for source materials**: external PDFs, web captures' source pages, etc. Editable render applies to ARTIFACTS Loom or AI generates (drafts, distillations, articles, notes), not to immutable inputs.

### How editable render interacts with AI passes (§6.7)

```
External AI (Codex / API) writes draft to Loom file
       OR
User dumps content into document via input surface
       ↓
Loom paper canon renders content
       ↓
AI background pass (idle 3-5s) typesets / structures / links / cites
       ↓
User reads + edits in place (modules a-e of this section)
       ↓
Loop: user edit → 5s idle → AI re-pass → user edit → ...
       ↓
Eventually: user promotes draft to wiki location
```

The reader page is a **continuously editable workshop surface** where content arrives (typed / dictated / AI-written), AI passes structure it, user refines, and finished artifacts emerge.

### Phased rollout (updated v4.0; v4.1 adds M6/M7/M8 + cuts M2 scope)

See `plans/loom-camp-c-editable-render.md` for full milestone scope.

- **M1 — Thesis filed (done 2026-05-02)**: this section + §6.7 + LOOM_RULES §7.5 + design doc + 2 plans + correction log entry-007.
- **M2 (v4.1 scope cut) — Single shape contenteditable prototype**: Article shape only, **modules (a) + (b) only** (contenteditable + naïve MD roundtrip). NO AI passes, NO invariant guard, NO versioning. User tests 1 week.
- **M3 — Decision gate**: M2 data → continue, scope-down, or abort.
- **M4 — Editable render hardening (modules (d) + (e) IF M2 data justifies)**: invariant guard + block-level versioning, Article shape end-to-end.
- **M4.5 — AI passes integration (§6.7 work)**: Add idle-triggered AI passes that operate on the document. Background passes are **structural-only, never generative** (v4.1 hard rule).
- **M5 — Multi-shape expansion**: List / Passage / Conversation / Syllabus + mobile + a11y.
- **M6 (v4.1 NEW, parallelizable with M4) — ⌘K palette**: per `plans/loom-cmd-k-palette.md`, ≤7 actions hard-cap.
- **M7 (v4.1 NEW, gated on M6 PASS) — delete LoomAIBar + distill panel**: NO delete-without-replace.
- **M8 (v4.1 NEW, parallelizable with M6) — Loom CLI**: per `plans/loom-cli.md`. **MVP shipped 2026-05-02 commit `f65cc67`**.

### Honest unknowns (for §12)

- Will users edit Loom rendering, or instinctively export to Notion?
- Can DOM ↔ MD roundtripping survive Loom's custom components without a structured intermediate AST?
- Does AI margin-marking (per §6.7 spec) read as "transparency" or "clutter"?
- What does mobile editing of paper canon even look like?

These don't block thesis filing but block M3 → M4 promotion until M2 surfaces real data.

---

## 6.7. Input Surface and AI Passes (added v4.0; **refined v4.1**)

**The deepest design question** answered by v4.0/v4.1: where does AI integration live in Loom? Answer (v4.1, refined): **3 AI surfaces split by ROLE, not by mode**: (1) ⌘K palette (M6, summoned generative one-shot), (2) AskAIWindow (KEPT, ⌘⇧E, threaded conversation), (3) background passes (M4.5, structural-only, never generative). v4.0's "no panel anywhere" was over-推generalized same day — AskAIWindow restored. Neither v4.0 nor v4.1 allow always-visible AI chrome, /ai inline, or co-edit selection toolbars.

### Why no separate AI input

A separate AI input (chat box, command palette, side panel) would create a feature surface — and Loom is a substrate, not a feature platform. Word doesn't have a chat box for spell-check; spell-check just runs in background and underlines words. Loom AI works the same way at a higher level of organization.

### How content arrives in Loom

Five equivalent input streams (per §1 / §2 / §3 of LOOM.md):

1. **Type / dictate** directly into a Loom document (paper canon styled writing surface)
2. **Voice** — OS dictation (⌥ hotkey) or 3rd-party tool transcribes into the active Loom document
3. **Web capture** — extension pushes a captured page into LoomFileStore, opens reader
4. **External AI write** — Codex / Claude Code / API call writes a markdown file directly to LoomFileStore (Loom watches and renders)
5. **Paste / drop** — clipboard or file drop targets a Loom document; structure-detection runs

All five end up at the same place: a Loom document with paper canon rendering.

### How AI work happens (background passes)

Once content exists in a Loom document, AI runs **invisible background passes**:

| Pass | What it does | Triggered by |
|---|---|---|
| **Typeset** | Apply paper canon visual structure to raw content (headings, lists, blockquotes, etc.) | Idle 3-5s after edit / on document open / manual ⌘↩ |
| **Structure** | Detect 5 shapes (Article / List / Passage / Conversation / Syllabus) and apply matching layout | Idle 5-10s after content stabilizes |
| **Link** | Cross-reference: find other Loom documents that mention the same concepts and add subtle margin links | Idle 10-15s after content stabilizes |
| **Cite** | For academic-leaning content, find external citations (DOI lookup, etc.) and add footnotes | Idle 15-30s after content stabilizes |

Passes run via `callAiPrompt` Swift bridge to the user's configured AI provider (5 supported per existing AIProviderSettingsView). API costs are user-paid; passes are aggressively debounced to minimize call volume.

### How AI changes are surfaced to user

AI-touched content is **subtly margin-marked** in the right margin (a small bronze dot — see paper canon recipe). On hover:
- Dot expands to a small affordance
- Click reveals a popover with: what AI did + diff + revert button
- Click outside closes popover

This is borrowed from Word's revision marks but redesigned for paper-canon aesthetic. **AI changes are visible enough that user doesn't lose authorial control, but subtle enough to not pollute the read.**

### The triggering model (idle + open + manual)

- **Idle** (~3-5s after last edit) — most passes; lets the user write without interruption, then catches up when they pause
- **On document open** — re-runs typeset/structure passes to apply latest model improvements to old documents
- **Manual ⌘↩** — user explicitly demands a pass right now (e.g., "I just dictated a paragraph; please typeset it now")

NO continuous-while-typing trigger in v4.1. (Tested as "too distracting" in informal user research; deferred to v4.2+ as opt-in.)

### What AI passes do NOT do

- ❌ Do not author content (only restructure/typeset what's already there)
- ❌ Do not delete user content (additive only — AI can wrap, mark, link, but not remove)
- ❌ Do not present a chat / command interface
- ❌ Do not initiate unprompted (only respond to user's content stream)
- ❌ Do not work across documents (single-document scope in v4.1; cross-document is v4.2+ wiki work)

### How external AI integrates (Loom CLI)

External AI (Codex / Claude Code / Cursor / future X) integrates via:

1. **File system access** — LoomFileStore is plain markdown + standard frontmatter. Any AI can read/write directly.
2. **Loom CLI** — exposes substrate operations:
   - `loom capture <url>` — trigger web capture
   - `loom search "query"` — full-text + embedding search across user's Loom corpus
   - `loom open <file>` — open Loom UI to specific file
   - `loom related <file>` — find related Loom documents
   - `loom render <file>` — headless render markdown to paper canon HTML
   - `loom write <path>` — write artifact to LoomFileStore (with frontmatter)

External AI doesn't need a Loom-specific API; CLI + files are the standard substrate interface.

See `plans/loom-cli.md` for full CLI design and `plans/loom-ai-passes.md` for internal passes design.

### Wiki-scale stringing (DEFERRED to v4.2+)

When Loom contains many documents (personal wiki / 维基百科库), additional AI work becomes valuable:
- Auto-link concepts across documents
- Auto-cluster related documents into topics
- Auto-generate library indexes
- Auto-detect contradictions across documents
- Auto-suggest new wiki entries from accumulated captures

User explicitly deferred this to v4.2+ on 2026-05-02 ("这个是后话"). v4.1 ships single-document AI passes only. Wiki-scale work scopes after v4.1 ships and yields data on real usage patterns.

---

## 7. The Compile Pipeline (the missing 8th piece)

Compile is what turns Loom from "useful tool" into "category-defining product." It is the wow moment at session scale and the substrate of everything Loom accumulates at arc scale.

### Three subtasks of Compile

| Subtask | What it does | Reliability today (GPT-4o / Claude 3.5+) |
|---------|--------------|--------------------------------------------|
| **A. Recognize structure** | "User wrote `loss = x²+y², gradient is partial derivs, step in -direction`" → AI recognizes this is a math derivation, not prose, not a list | ~95% |
| **B. Generate structure** | Transform recognized content into proper sections, LaTeX equations, possibly flipbook frames | ~90% |
| **C. Embellish** | Add visualizations, hover-reveals, interactive elements (requires code generation + execution) | ~60-80% |

**A+B today is reliable enough to ship as MVP** (~4-6 hour engineering work for a competent team with a good system prompt). C is the moat extension that requires more time and depends on model capability improvements.

### Invocation model (MVP)

Manual button. User finishes a writing burst, clicks Compile. AI processes for 5-15 seconds, output streams in. User can edit either the scratch (re-compile) or the output (preserve as final).

Future: opt-in idle-detect compile. Never on-keystroke (would feel surveilled and break THINK flow).

### Storage shape

Both scratch and compile output coexist in the same `Loom.md` per source section, per V8 (per-book grouping):

```markdown
## ECON 3202 / Lecture 3 PDF

### Raw thoughts · 2026-05-01 14:30
ok so loss is x²+y² + sin(x)cos(y).
gradient is partial derivs.
step in -direction.
lr too small slow, too big oscillate.

### Compiled · 2026-05-01 14:35

**The loss surface**

$$ f(x, y) = \frac{x^2 + y^2}{4} + \sin(x)\cos(y) $$

[term: gradient | The vector of partial derivatives ∂f/∂x, ∂f/∂y]

---

**Step 1**: Compute the gradient at the current position.
**Step 2**: Take a step in the negative direction, scaled by learning rate.
**Step 3**: Repeat until convergence.
```

Both editable by user (V8). Heal-on-load preserves both. Multiple compile snapshots not supported in MVP (latest only); user can copy good output to a separate region to preserve.

### System prompt sketch

```
You are a typesetter for a learning artifact. The user has just written
their raw thinking on a source they are studying. Your job is to produce
a structured artifact, NOT to think for them.

Rules:
- Use $...$ for inline math, $$...$$ for blocks. LaTeX rigorous.
- For step-by-step content: separate frames with `---`.
- For definitions: mark `[term: explanation]` for hover-reveal.
- Reference the user's prior notes on this source: "as you noted earlier..."
- Read like a textbook page, not a chat reply.
- Do NOT add information the user did not write. Only structure what's there.
- If user wrote `(show plot)` or similar hint, generate the plot directive.
```

### Pipeline implementation outline

1. Extract scratch from `Loom.md` (per-source section, prose region above the next heading)
2. Build prompt with: source context (Tier 1 prior notes from same source) + Ask conversation archive on this Page + CaptureAST hint (if present) + scratch
3. Stream completion from user-configured AI provider (`LoomAI.send` already routes provider)
4. Parse embedded directives ([term:...], frame separators `---`, etc.) as the stream arrives
5. Render in paper canon substrate (KaTeX for math, embedded directives for hover-reveals, frame transitions for step-by-step)
6. Write the rendered output back to `Loom.md` as a `### Compiled · YYYY-MM-DD HH:MM` section in the same per-source heading

### Error and edge cases

| Case | Handling |
|------|----------|
| **Empty scratch** | Compile button disabled. Tooltip: "Write a few thoughts, then compile." Alternative: compile-from-source-only mode (single-shot summarize the source) — gated behind a separate "Summarize source" button to avoid confusing user who expects scratch-driven compile |
| **Stream interrupted** (network, rate limit) | Save partial output as `### Compiled · YYYY-MM-DD HH:MM (partial)` section. User can re-compile to retry. Never silently discard partial work |
| **AI hallucinates content user did not write** | Loom CANNOT detect this server-side. Mitigation: system prompt explicitly forbids ("Do NOT add information the user did not write"). User retains edit rights on output (V8). Future: a `(unsupported)` marker for AI claims that don't trace to scratch |
| **Contradictory user thinking** ("X is Y" + later "X is Z") | AI defaults to LATEST statement. If both are equally weighted, AI surfaces both with `[user noted both X=Y earlier and X=Z later]`. Never silently chooses |
| **Rate limit / API quota exhausted** | Per V7 (no silent failures): show a clear error banner. Save scratch unchanged. Suggest provider switch (LoomAI.send already supports multi-provider) |
| **Provider returns malformed structured output** | Fall back to plain-markdown render of the response text. User can re-compile or edit manually |
| **Source unavailable at compile time** (PDF deleted, web capture lost) | Compile uses only scratch + prior notes. Eyebrow: "Source unavailable; compiled from your notes only" |
| **Compile output exceeds reasonable size** (e.g. 50k tokens) | Truncate at sane limit (~10k chars). Eyebrow: "Output truncated; consider splitting your scratch into focused sections" |

---

## 7.5. Privacy & Data Flow

Loom's data model is privacy-first by design. This section is canonical for any feature that touches user data, AI providers, or external services.

### What lives where

| Data | Location | Visibility |
|------|----------|------------|
| User's source files (PDFs, folders) | User's chosen folder, untouched | Loom reads via security-scoped bookmark; never writes |
| Loom-managed data (`Loom.md`, sidecars, settings) | macOS sandbox at `~/Library/Containers/com.yinyiping.loom/Data/Documents/Loom Data/` | Sandbox-only, accessible to user via Files.app reveal |
| Embedding caches (`LoomEmbeddingStore`) | Same sandbox | Sandbox-only, never leaves device |
| AI provider credentials (API keys) | macOS Keychain | Encrypted at rest, OS-managed |
| AI prompts (when user invokes Ask or Compile) | Sent to user-configured provider over HTTPS | Provider sees the prompt + source context user chose; not all of LoomFileStore |
| Telemetry | **None by default** | No usage data, no analytics, no error reporting unless user opts in |

### What AI providers see

When user invokes Ask AI or Compile, the prompt sent to the provider includes:
- The active Page's source content (or relevant excerpt)
- Tier 1 prior notes from THIS source
- Ask conversation history on THIS Page
- Scratch text from THIS Page

It does NOT include:
- Other sources or their notes
- Cross-source embeddings or similarity matches
- The user's identity beyond what they've configured for the provider
- Any data from other applications

The user controls which provider receives this. Apple Foundation Models (default) keeps everything on-device. OpenAI / Anthropic / OpenAI-compatible endpoints send over HTTPS to the user's chosen provider per their privacy policy.

### Export & sovereignty

Per `LOOM_RULES.md` V6 (markdown only, no proprietary formats): user can export their entire `LoomFileStore` directory at any time — it is plain markdown + media files. No database, no proprietary index, no DRM. Loom can be uninstalled and the user's data remains fully readable in any markdown editor.

A future "Reveal in Finder" affordance (or `Export Knowledge System...`) makes this explicit. Already implicitly true via Files.app sandbox access.

### `loom://` URL scheme security

`loom://` URLs (used by capture extension + intra-app links) are restricted to known prefixes:
- `loom://content/<uuid>/<sub-path>` — user content
- `loom://anchor?...` — passage navigation
- `loom://capture?payload=...` or `loom://capture?via=clipboard` — capture handoff
- `loom://native/<endpoint>.json` — native bridge for renderers

The native side validates the prefix + path before any FS access. Cross-origin in WKWebView is rejected for `loom://content` writes (only the sandbox container is writable through this scheme).

### Network behavior summary

- Loom does NOT phone home for telemetry, crash reports, license checks (default).
- Loom does NOT pre-fetch or background-process AI calls.
- Network calls happen ONLY when the user invokes Ask or Compile, OR when the Web Capture extension hands off a capture.
- All AI traffic uses HTTPS to the user-configured provider only.

---

## 8. The Moat — Two Layers

### Session moat (today)

The Compile button → typeset artifact emerges. This is the wow. Anyone can copy: system prompt + KaTeX + parser + renderer = ~2 weeks of engineering work for a competent team.

This moat is real but not durable.

### Arc moat (multi-year)

After 6+ months of Loom use, the user's `LoomFileStore` contains:
- Hundreds of source-anchored artifacts
- Cross-source AI references (Echoes, when Tier 5 ships)
- Returnable patterns (Last-read eyebrows, when Tier 6 ships)
- Multi-year accumulated thinking, source-anchored, in markdown they own

Forking Loom code would not migrate any of this. A new competitor on day 1 has zero accumulated knowledge per user; a Loom user on day 1 has years.

This is the durable moat. Substrate alignment + accumulated user data + AI cross-reference = personal-knowledge-base lock-in.

### Honest acknowledgment of early-days fragility

The Arc moat is durable AFTER multi-year accumulation. In the first 6 months of Loom's existence, neither layer is yet defensive: a small, design-strong startup CAN clone the session-moat features and chase Loom on substrate alignment. Open-source clones are also possible.

What Loom relies on during this window: (a) shipping faster than clones can specify their own design language, (b) building real user habit before competitive pressure, (c) earning the "thinking environment" mental category before incumbents notice. **The moat compounds with time and use; it does not exist on day 1.** This is not a risk to hide; it is a phase to acknowledge.

### What incumbents cannot easily clone

- **OpenAI** would not ship markdown-as-data-store (against their business model — they sell API + chat product, not user-owned data).
- **Notion** has block editor architecture incompatible with paper canon + per-book per-source structure.
- **Obsidian** has graph metaphor; Loom rejects graph in favor of source-anchored Page.
- **Cursor** is text→code domain; learning artifacts require typesetting + visualizations + flipbook frames, not code.
- **Marker tools** (Granola, Mem.ai) do scattered-notes-to-summary but not source-anchored compile-into-typeset-artifact for learning specifically.

Each incumbent would have to fundamentally rebuild their data model + design system + AI pipeline to match Loom. By the time they did, Loom users would have 18-36 months more accumulated thinking.

---

## 9. What Loom Is NOT

| Confusion to head off | Why Loom is different |
|------------------------|-----------------------|
| Notion clone | Notion has block-editor structure pressure + no AI-as-teacher; Loom has zero structure pressure on scratch + first-class LEARN mode |
| ChatGPT wrapper | ChatGPT history is ephemeral; Loom artifacts are persistent, source-anchored, in markdown the user owns |
| Notability replacement | Notability is handwriting capture for reading; Loom is the typed-thinking + AI-typesetting loop |
| Research-management tool | Bibliography/citation managers are out of scope; Loom is for thinking, not for managing references |
| AI study guide generator | Loom does not generate content from nothing; AI's role is teach-when-asked or typeset-when-clicked |
| Note-taking app | Notes are byproducts of learning, not the object (`LOOM_RULES.md §2.1`); collection-as-end is punished by V8 (per-book grouping) |
| Chat shell | Chat (LEARN mode) is a means, not the product. The product is the loop |
| Dashboard | Loom does not aggregate metrics; it hosts thinking on individual sources |
| Publishing platform | Artifacts are for the user's own thinking. Sharing/export is Phase D scope, not v1 |
| Knowledge graph | Loom rejects graph metaphors. Sources are anchored to Pages; cross-source detection surfaces as eyebrows, not visible graph |
| Outliner | Linear flow, not hierarchical. Sources lead the structure; the user does not impose ontology upfront |
| **AI agent platform** | Loom does NOT autonomously learn for the user. AI plays Teacher (when asked) or Typesetter (when triggered). No background agent reads sources unprompted, summarizes uninvited, or generates conclusions the user did not commission. The user remains the LEARNER, not the consumer of AI-finished thinking. This is a curiosity-led extension of V4 — distinct from products like AutoGPT, Devin-for-research, or "AI study companion that reads your textbooks for you" |
| Cloud-synced knowledge service | Loom is local-first. Data lives in your macOS sandbox. iCloud sync is a future opt-in via system mechanisms (markdown files in iCloud Drive); never Loom-managed cloud servers |

---

## 10. Current State (snapshot 2026-05-01)

### Built ✅
- Reading-flow rewrite (single-capture primitive, per-book sections, heal-on-load, edit/promote/delete) — 2026-04-26
- Apple Foundation Models default provider — 2026-04-26
- Streaming Ask AI + Tier 1 source-aware AI — 2026-04-26
- Bidirectional Note ↔ AI — 2026-04-26
- Web Capture Safari extension v1.4.6 + native Capture host — 2026-04-29
- DS v1 lib + tint family + tranche 1 hex collapse — 2026-04-28..30
- Paper canon SEALED v1.0 — 2026-04-25
- Peer-AI coordination protocol (peer-chat, coord doc, HOT-FILE, ESCALATE) — 2026-04-30

### In flight 🔄
- **CaptureAST architecture pivot** (Codex) — feeds the Compile pipeline; see `tmp/peer-chat.md` and `tmp/loom-coordination.md` for current task progress
- Reading-flow Swift slicing commit (Claude) — 10 files staged at last check, awaiting baseline-green
- DS migration tranches 2-4 (Claude) — pending baseline-green

### Planned 📅 (not started)
- **Compile pipeline (Subtasks A+B)** — the highest-leverage next ship, ~4-6 hour MVP work given green tree
- Phase C M2-M4 content-shape renderers (consume CaptureAST + feed Compile output formats)
- Connect surface (Echoes eyebrow)
- Return surface (Last-read eyebrow)
- Cosmic canon v1 (brand substrate for splash/about/empty)
- LoomTokens.swift / globals.css full alignment with DS v1

### Repo state
- HEAD: see `git log -1`. Multiple unpushed commits (push is user-only decision per protocol).
- Verify current baseline state with: `npx tsx --test tests/capture-media-contract.test.ts tests/captures-landing-refresh-contract.test.ts tests/capture-render-debug-artifacts.test.ts tests/source-authority-contract.test.ts tests/night-chrome-theme.test.ts`

---

## 11. Roadmap (Tier 1 → Tier 6)

| Tier | Work | Approx duration | Status |
|------|------|-----------------|--------|
| 1 | CaptureAST + reading-flow Swift slicing + DS v1 foundation + tranche 1 | days | **In flight 2026-05-01** |
| 2 | **Compile pipeline MVP** (Subtask A+B) — system prompt + parser + renderer | 1-2 weeks | Plan-able directly from §7 |
| 3 | Phase C M2 (List shape) + M3 (Article shape) + sidebar objecthood + AI panel summonable-object treatment | ~1 month | Sub-plans exist (`plans/phase-c-presentation-layer.md`) |
| 4 | Cosmic canon v1.0 SEALED + brand surfaces (splash / about / empty) | 3-4 weeks | Net-new product work; cosmic canon doc TBD |
| 5 | Connect surface (Echoes eyebrow) — AI cross-source detection + quiet eyebrow UI | ~6 weeks (includes detection R&D) | Net-new product work |
| 6 | Return surface (Last-read eyebrow) + Compile Subtask C (visualizations + interactive elements) | ~3-4 weeks | Net-new product work |
| **C.M1** | **v4.0 thesis filed → v4.1 reframe filed 2026-05-03 commit `63007cf` — LOOM.md §1.5 + §6.5 + §6.7 + LOOM_RULES §7.5 + plans/loom-ai-passes.md + plans/loom-cmd-k-palette.md + plans/loom-cli.md + design doc + correction-log entries 007/009/010/011** | now | **filed** |
| **C.M2** | **Single Article shape contenteditable prototype — modules (a)+(b) only per v4.1 (contenteditable + naïve MD roundtrip; NO invariant guard, NO versioning, NO AI passes)** | ~5 days | gated on user authorization |
| **C.M3** | **Decision gate after M2 user data (1 week test)** | review only | gated on M2 data |
| **C.M4** | **Editable render hardening — modules (d) invariant guard + (e) block versioning IF M3 PASS justifies. v4.1 only ships (d)+(e) here, not all 4.** | ~5-7 days | gated on M3 |
| **C.M4.5** | **AI passes integration per §6.7 (idle-triggered typeset/structure/link/cite passes + margin-marking). Structural-only, never generative — contract test enforces.** | ~5-7 days | gated on M4 |
| **C.M5** | **Multi-shape expansion (List / Passage / Conversation / Syllabus) + mobile + a11y** | ~3-4 weeks | gated on M4.5 |
| **C.M6** | **(v4.1 NEW) ⌘K Palette per `plans/loom-cmd-k-palette.md` — ≤7 actions hard-cap. Generative one-shot summoned invocation.** | ~5-7 days | parallelizable with C.M4 |
| **C.M7** | **(v4.1 NEW) Delete LoomAIBar + distill panel — gated on M6 PASS (verify ⌘K covers their functionality). NO delete-without-replace.** | ~2-3 days | gated on M6 |
| **C.M8** | **(v4.1 NEW) Loom CLI per `plans/loom-cli.md` — external AI integration**. MVP shipped commit `f65cc67`. | ~3-5 days | **MVP DONE 2026-05-02; full ship pending render/related/capture wiring** |
| **W.M1** | **(v4.2+) Wiki-scale AI: auto-link + auto-cluster + library indexing across N documents** | TBD | DEFERRED per user 2026-05-02 |

Approximate calendar: ~5-6 months from current state to full unified product, with Camp C work parallelizable to Tiers 3-6 once M3 gate passes.

**Important**: Tier 2 (Compile MVP) is the next user-visible product moment. Once Tier 1 lands, ALL Loom's prior work pays off the moment Compile ships. Until Compile ships, Loom is "a great reading tool"; once it ships, Loom is "a learning loop."

**Estimate caveat**: durations above are rough — actual sequencing depends on team size (currently ~one product owner + Codex + Claude), AI capability progress (compile quality scales with model improvements), and unblocking unknowns surfaced during build. Treat the tier ORDER as load-bearing; treat the WEEKS estimates as ±50%.

---

## 12. Open Questions (honest unknowns)

These are NOT decisions. They are unresolved questions whose answers will shape Loom's trajectory:

1. **Page-as-primitive holding under Connect/Return**: working hypothesis. Could fail if eyebrows clutter or get ignored. Validate in Tier 5/6 prototypes.
2. **AI behavior contract**: should the "AI may offer information unrequested when offer is quiet, dismissable, non-interrogative" extension to V3/V4 be promoted to a North Star principle?
3. **Compile invocation**: button-only MVP vs idle-detect later; how to design opt-in without surveillance feel.
4. **Compile output uniqueness**: latest-only vs version history — UX vs storage trade-off.
5. **Cosmic canon scope**: cosmic substrate at session boundaries could conflict with paper canon during working state (the fade is the design challenge).
6. **Multi-device / mobile**: v1 is Mac-only. Does mobile require its own substrate variant? (Probably yes, simpler than desktop.)
7. **Sidebar scale**: objecthood-shelf with hand-placed asymmetry doesn't trivially scale beyond ~50-100 sources. Search-fold? Tab grouping? Open question.
8. **Distill section placement**: top of `Loom.md` (prose region) or per-book section? Heal-on-load needs to know.
9. **Connect false-positives**: AI-generated Echoes will sometimes surface bad connections. How does the user signal "not useful" without that signal becoming a feedback loop drifting toward auto-clustering (V5)?
10. **Return surface privacy**: "Last read 12 days ago + pattern" implies tracking user reading-time per source. Sandbox-only? Exportable? Wipeable?
11. **Business model**: not yet decided. Candidates: freemium with $X/mo for unlimited AI, university institutional license, BYO-API-key + markup. PMF first.
12. **Compile when source has no scratch**: should Compile also be invokable on user notes alone, without a connected source? Probably yes for free-form thinking pages, but spec needs writing.
13. **Offline vs online Compile choice**: Apple Foundation Models (free, on-device, zero data leaves machine) vs GPT-4o or Claude (more capable, sends prompts to provider, costs API budget). Should the user pick per-compile, per-page, or per-install? How do we communicate the quality difference without burdening every compile with a chooser?
14. **Multi-session source continuity**: a single source spans multiple work sessions over weeks. Does scratch accumulate across sessions or get a fresh slate per day? Does each session produce its own compiled artifact (versioned), or do sessions share one rolling artifact updated each compile? UX implications for both directions.
15. **Model capability upgrade path**: when GPT-5 / Claude 4 / a new SOTA arrives mid-year and users have 6 months of compiled artifacts under the older model, what's the upgrade story? Re-compile button per artifact (opt-in)? Bulk re-compile with diff view? Or freeze old artifacts as historical record? This question recurs every model generation.

---

## 13. North-Star Image (Cosmic Substrate)

The product owner's 2026-04-16 mockup is the visual destination Loom converges toward at session-boundary moments (splash / about / empty / first-run):

`/Users/yinyiping/Desktop/Pictures for Design/Screenshot 2026-04-16 at 2.23.18 AM.png`

Black canvas + comet mist + serif hero + tiny serif caption + zero chrome:

> *"Loom is a reading-and-thinking environment where source-bound understanding is woven into memory. It is not a notebook, not a chat shell, and not a dashboard. It is where reading becomes judgment, judgment becomes pattern, and pattern returns when it changes."*

Loom has TWO canonical visual substrates. Both share 静奢 (quiet luxury) discipline; they differ in palette and emotion:

| | Brand substrate (Cosmic) | Working substrate (Paper) |
|---|---|---|
| Palette | Deep dark + starfield + comet mist + ivory hero text | Warm ivory `#FBF6EC` + hairline + bronze + ink scale |
| Verb moments | Session boundaries (open / close / about / empty) | All six verbs in working state |
| Emotion | Cosmic permanence; single bright element vs vast dark | Paper intimacy; warm; near; touchable |
| Canonical doc | `cosmic canon` (TO BE WRITTEN — Tier 4) | `feedback_loom_paper_recipe_canonical.md` v1.0 SEALED 2026-04-25 |

The 7 静奢 disciplines (emptiness as shape, monolithic palette, hand-placed asymmetric, object-as-sculpture, single off-axis warm light, material-is-message, slow gaze) apply differentiated by IN (capture / Encounter / Respond — speed-first, discipline cautious) vs OUT (Read / Distill / Return — dignified, full force). See `feedback_loom_unified_material_scene.md` memory for full detail.

---

## 13.5. Onboarding & First-Run Experience

A new user's first 30 seconds in Loom shape their entire mental model. The onboarding follows the dual-substrate transition:

**Frame 1 — Cosmic substrate (splash, ~800ms)**:
- Black canvas + comet mist + serif "Loom" wordmark + the 4-16 mockup tagline as caption
- No buttons, no progress bar, no "Welcome to Loom!" banner
- Quietly fades to working substrate after ~800ms (or on click)

**Frame 2 — Working substrate (empty state)**:
- Paper-canon page, mostly empty
- Single quiet invitation centered: *"Pick a folder to start, or drop a PDF here"*
- Two ways to start: `+ Folder` button (opens NSOpenPanel) or drag-drop PDF onto window
- No tutorial, no walkthrough, no checklist

**Frame 3 — First source loaded**:
- Sidebar shows the new Page; main area renders the source (PDF or folder home)
- Once user selects text in PDF (their first natural action), a single subtle hint appears near the cursor: *"Right-click to note this passage"*
- Hint is dismissable and never re-appears once the user has saved their first note

**Frame 4 — First Ask AI**:
- When user first invokes Cmd+E or right-click → Ask AI, the panel slides in
- A one-line eyebrow above the input: *"Ask anything about this passage"*
- After first conversation, eyebrow disappears

**Frame 5 — First Compile** (when Tier 2 ships):
- After user has written ~50+ words on a Page's body, a quiet pulsing dot appears near the Compile button (the only attention-grab in Loom — once)
- Click → first compile happens → user sees the wow
- Pulse never returns; subsequent Compiles are silent

**What Loom does NOT do at first run**:
- No mandatory account creation (Loom is local-first, no account needed)
- No tutorial video or interactive walkthrough
- No "tell us about yourself" form
- No newsletter signup, no telemetry opt-in dialog (telemetry is off by default; no dialog needed)
- No popup / modal anywhere except for system-required confirmations (folder access, etc.)

This is consistent with V3 (no always-visible AI chrome), V11 (no duplicate UI for system features), and the Hermès craft principle — the first 30 days reveal Loom's depth through use, not through narration.

---

## 14. Built With — The Peer-AI Development Methodology

Loom is currently being built by two AI agents collaborating: **Codex** (OpenAI) on the capture pipeline, **Claude** (Anthropic) on design / vision / repo hygiene. They communicate via:

- `tmp/peer-chat.md` — append-only message bus
- `tmp/loom-coordination.md` — shared work board (current state truth)
- `tmp/peer-chat-protocol.md` — protocol spec (HOT-FILE declaration, ESCALATE flag, atomic coord-doc updates)
- Per-agent cursors (`tmp/.peer-cursor-claude`, `tmp/.peer-cursor-codex`) tracking last-processed message

Per `feedback_tool_capability_honesty.md` memory: there is no autonomous polling. Both agents run only when their respective user sessions are active and prompted. The user is the external clock.

This methodology is itself a Loom artifact. Loom is built using the same patterns it enables for users:
- Peer thinking (two AIs co-iterating instead of one monolithic agent)
- Source-anchored discussions (peer-chat is markdown the user owns)
- Persistent across sessions (peer-chat survives compaction; cursors track progress)
- Each agent has own territory + HOT-FILE for shared surfaces (parallel of Loom's per-book grouping)

**Why this matters beyond the obvious dogfood story**: the same problems Loom solves for human learners (high-frequency context switching, source-anchored thinking, persistent reference, structured output across sessions) are the exact problems that surface when two AI agents collaborate on a complex multi-month project. The fact that the peer-AI methodology even works — across compaction events, across sessions days apart, across mode handshakes — validates the underlying thesis that **structured thinking-substrates with source anchoring are how complex intellectual work actually compounds**, AI or human. Loom's dev process is therefore a real-world demonstration of Loom's product thesis.

For the OpenAI-hackathon context (May 2026): this is itself a story worth telling. Loom is dogfood — built using the patterns it enables.

---

## 15. How This Document Relates to Others

| Document | Layer | What it covers |
|----------|-------|----------------|
| **`LOOM.md` (this doc)** | Product canon | What Loom IS — vision, framing, architecture, moat |
| `LOOM_RULES.md` | Invariants / law | What Loom MUST and MUST NOT do — 12 vetoes, North Star principles, decision log §8 |
| `LOOM_USER_PROFILE.md` | Audience | Who Loom is FOR — user habits, working patterns, preferences |
| `plans/loom-unified-product-vision.md` | Implementation map | Reduced from v1 vision doc to the plan/sub-plan navigation map under LOOM.md |
| `plans/phase-c-presentation-layer.md` | Implementation | Render-layer milestones M1-M4 |
| `plans/loom-design-system-v1.md` | Implementation | Token system + 4-night migration tranches |
| `plans/design-system-migration-inventory.md` | Implementation | Hex-by-hex migration shopping list |
| `plans/ingest-extractor-refactor.md` | Implementation (shipped) | Capture extractor lanes Phase 0-7 |
| `plans/ingest-to-learning-loop-bridge.md` | Implementation (shipped) | Schema → reading-page bridge |
| (Future) `plans/compile-pipeline-mvp.md` | Implementation | Tier 2 — the Compile pipeline build plan |
| (Future) `plans/connect-surface-echoes.md` | Implementation | Tier 5 |
| (Future) `plans/return-surface-last-read.md` | Implementation | Tier 6 |
| (Future) `plans/cosmic-canon-v1.md` | Implementation | Tier 4 — brand substrate canonical doc |

Plus memory entries (private to AI assistant) at `~/.claude/projects/-Users-yinyiping/memory/`. Key load-bearing memories include:
- `feedback_loom_paper_recipe_canonical.md` — paper canon SEALED v1.0
- `feedback_loom_unified_material_scene.md` — substrate authenticity / 实物质感 / 静奢 disciplines / DawoodUI + Hermès + Marginalia + Loro Piana references
- `feedback_loom_smooth_in_dignified_out.md` — 顺手 in / 体面 out
- `feedback_loom_dual_friction_purpose.md` — Loom's purpose at higher level
- `feedback_learn_not_organize.md` — north-star principle (notes are byproducts)
- `feedback_chan_design.md` — with behavior, not animation
- `feedback_tool_capability_honesty.md` — no autonomous polling; verify tool semantics before promising automation
- `feedback_loom_panel_model.md` — historical: Connect surface attempts (the 1.5D panel was built then deleted)
- 30+ other Loom memories surface naturally via the auto-memory system

**Read order on session start**:
1. **This document (LOOM.md)** — what is Loom
2. `LOOM_RULES.md` — what Loom must / must not do
3. `LOOM_USER_PROFILE.md` — who the user is
4. Relevant plan in `plans/` for the specific task at hand
5. Memory entries surface naturally via auto-memory; check `MEMORY.md` index if newly arrived

---

## 16. Update Protocol

**When to update this document**:
- A new mode, primitive, or substrate is introduced (rare; expect ≤2 over Loom's lifetime)
- A success criterion (§3 time-scale defenses) demonstrably fails and the design must pivot
- A sub-plan ships and changes the inventory in §10

**When NOT to update**:
- For every sub-plan filing — those are referenced, not absorbed
- For implementation details that don't change the framing
- For aesthetic refinements within an established substrate

**Update authority**:
- AI assistants currently working on Loom may file proposed updates
- Substantive shape changes (modifying the loop, splitting AI modes, adding a third primitive) require product owner approval
- Open Questions (§12) may be appended unilaterally by any AI assistant who finds new ones

**HOT-FILE protocol** (per `tmp/peer-chat-protocol.md`): edits to this file require a peer-chat declaration to avoid concurrent-edit conflicts between Codex and Claude. This file is shared territory; both AI assistants must respect HOT-FILE.

---

*Filed v2.0 by Claude on 2026-05-01 during Codex's CaptureAST architecture pivot. Replaces the v1 "six-verb" framing in `plans/loom-unified-product-vision.md` with the cleaner "learning loop + two AI modes + Page primitive + 8 supporting pieces converging on Compile" framing crystallized through multiple ultrathink rounds with the product owner across the late-April 2026 working session. The crystallization point: Loom is not a feature bundle, it is the entire learning loop externalized as software, and Compile is the missing piece that makes the loop close.*
