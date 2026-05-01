# Prism vs. Notes vs. Loom — Camp C as Loom's Render Position

**Filed:** 2026-05-01
**Status:** Design rationale for `LOOM.md` §1.5 (Camp C positioning) + §6.5 (engineering decomposition) + `plans/loom-camp-c-editable-render.md` (phased plan)
**Author:** Claude, in dialog with product owner
**Trigger:** Product owner observation that Apple Notes + AI workflow demonstrated a third path between LaTeX/Prism's frozen-beautiful and Notion/Notes' editable-mediocre

---

## 1. The dichotomy that has held knowledge tools captive

For ~30 years, knowledge tools have been forced into one of two camps:

### Camp A — Compiled / frozen output

**Examples:** LaTeX (1985), Typst (2023), Pandoc → PDF, Adobe InDesign (for static docs), Prism (academic auto-typesetter), Quarto, R Markdown → PDF, Sphinx → HTML.

**Properties:**
- Render quality: **academic / print-grade**. Hyphenation, kerning, ligatures, math typography, figure layout, page-on-deck, hanging punctuation, oldstyle figures — all delivered.
- Editing: edit a SOURCE file (`.tex`, `.typ`, `.md`, `.qmd`), then run a COMPILE step. The output is read-only.
- Mental model: **artifact production**. You produce a deliverable; it freezes; revising means going back to source.

**Strengths:**
- Highest possible visual quality
- Reproducible from source
- Long-form structure (books, papers, theses) handled natively
- AI-aided source editing works fine (you're editing text)

**Weaknesses:**
- Compile cycles slow
- Source language is a barrier (LaTeX / Typst syntax is not natural)
- Cannot tweak the rendered output
- Edit mid-stream during reading is impossible
- Once a PDF is shared, future edits require re-distribution

### Camp B — WYSIWYG / live editing

**Examples:** Notion (2016), Google Docs (2006), Apple Notes, Obsidian (with WYSIWYG plugins), Microsoft Word, Confluence, Substack editor, Medium editor.

**Properties:**
- Render quality: **adequate**. Headings, lists, tables, code blocks, basic emphasis, basic math (some support KaTeX). NOT page-on-deck, NOT hanging punctuation, NOT oldstyle figures, NOT real small caps. Print-CSS is an afterthought.
- Editing: the rendered surface IS the document. Click to edit. No compile step.
- Mental model: **continuous draft**. The document evolves; "publish" is a sharing action, not a freeze.

**Strengths:**
- Zero edit friction
- Real-time collaboration possible (Notion, Google Docs)
- Mobile-friendly editing
- Block-level operations (drag, duplicate)
- Native AI integration possible (Notion AI, Google Doc AI)

**Weaknesses:**
- Typography is corner-cut everywhere
- Math renders crudely or via plugins
- Figure / table layout is fragile
- Long-form structure (chapters, footnotes, references) is shoehorned
- Print output looks amateur compared to Camp A

### The forced choice

Until now, every knowledge tool picked Camp A or Camp B. Hybrid attempts (Obsidian's preview pane, Quarto's interactive notebook) split the screen — they don't dissolve the dichotomy, they show both sides.

A user who wants academic typography MUST use Camp A. A user who wants editability MUST use Camp B. Wanting both = use two tools in series (compose in Notion, finalize in LaTeX) at the cost of the seam.

---

## 2. What changed (why Camp C is now possible)

Three enabling shifts converged ~2025-2026:

### Shift 1: Browser CSS reached print quality

- CSS Houdini, container queries, `font-feature-settings`, `font-variant-numeric` `oldstyle-nums`, advanced `@font-face`, hanging punctuation polyfills, hyphenation dictionaries, KaTeX rendering, `text-wrap: balance`, `text-wrap: pretty`, `@page` print styles, color-mix, OKLCH colors — all production-ready in evergreen browsers
- Loom's **paper canon v1.0** (sealed 2026-04-25) demonstrates this: page-on-deck cards + 60-72ch measure + asymmetric inset + zero texture + Vellum identity, all in browser CSS. Visually competitive with InDesign output.

### Shift 2: AI can maintain structural invariants during edits

- 2023's AI: could rewrite a paragraph but couldn't notice "this paragraph is a chapter intro and needs a drop cap"
- 2026's AI: can read structural context (frontmatter, surrounding markup) and make edits that preserve it
- Means: user can edit a paragraph without knowing its structural role; AI keeps the canon intact

### Shift 3: User mental model has caught up

- Notion (2016+) trained an entire cohort that "the rendered surface IS the document"
- ChatGPT / Claude (2022+) trained an entire cohort that "AI is a co-editor, not a separate tool"
- 2026 user expectation: **"why CAN'T I have both quality typography AND in-place edit AND AI co-edit?"** The constraint that produced the dichotomy is no longer a constraint.

---

## 3. Camp C — Loom's position

**Camp C** dissolves the dichotomy by combining all three:

1. **Camp A's typography** — full paper canon (sealed v1.0)
2. **Camp B's editability** — `contenteditable` on the rendered surface; no source/preview split; no compile step
3. **AI co-edit (the Camp C original)** — selection-based affordances (rewrite / expand / cite / translate / footnote) that maintain structural invariants
4. **Versioning** — block-level history (Apple Notes parallel)

The user reads at print quality. The user clicks any text and edits in place. The user selects a passage and asks AI to rewrite it. The structure (chapter ornaments, drop caps, figure layout) survives every edit.

**This is not a research idea.** Each component exists in production today:
- Paper canon CSS: shipped in Loom v1.0 (sealed)
- contenteditable on rich rendered surfaces: shipped in Apple Notes, Notion, Substack
- Selection-based AI co-edit: shipped in Cursor (for code), partially in Notion AI (for prose)
- Block versioning: shipped in Apple Notes, Notion

**The integration is novel.** No tool combines all four AT PAPER-CANON QUALITY.

---

## 4. Loom is uniquely positioned to deliver Camp C

### Capabilities Loom already has (sealed)
- Paper canon v1.0 (vellum, page-on-deck, 60-72ch, KaTeX, oldstyle, hanging, asymmetric inset, zero texture)
- 5 shape detection (List / Article / Passage / Conversation / Syllabus per Phase C presentation layer)
- Source-fidelity principle (display ≡ Finder tree)
- Sandboxed `LoomFileStore` (immutable source folder protected)
- AI integration framework (`callAiPrompt` Swift bridge, 5 providers + custom + off)
- CaptureAST schema for structured source representation
- Selection toolbar (Highlight / Note / Copy link with transient highlight model added 2026-05-01)
- Vellum visual identity (warm paper + bronze)

### Capabilities Loom needs to add (M2-M5 of `plans/loom-camp-c-editable-render.md`)
- contenteditable on `.loom-capture-article` body
- DOM ↔ Markdown bi-directional binding
- AI co-edit affordances on selection (5 actions)
- Structural invariant guard (CSS + MutationObserver)
- Block-level versioning + history

### Why competitors can't do this
- **LaTeX / Prism**: their entire architecture is source-then-compile. Adding edit-in-place would require rewriting the rendering engine to be browser-based + bidirectional. Years of work.
- **Notion**: their typography would need to be rebuilt from scratch. Their editor architecture is block-based at the WRONG granularity for paper canon.
- **Apple Notes**: not extensible enough. Apple controls the surface; can't add domain-specific affordances.
- **Obsidian**: WYSIWYG plugin space exists but typography is community-driven and fragmented; no canonical paper rendering.
- **Substack**: editor is locked-down; no way to add academic structure.
- **Quarto / R Markdown**: dual-pane (source + preview); not single-surface edit.

Loom comes in fresh, with paper canon already done, AI integration already done, and the design discipline (sealed canon, immutable source, hard vetoes) to maintain quality through edit cycles.

---

## 5. What Camp C is NOT

- ❌ Not a Notion replacement. Notion is right for raw collaborative drafts and team docs.
- ❌ Not a LaTeX replacement. LaTeX is right for pure-print artifacts that don't evolve (theses, conference papers, textbooks).
- ❌ Not Obsidian's split-pane preview. There is no source/preview split — the render IS the surface.
- ❌ Not "Loom is a better editor." Loom is a better RENDER + EDIT integration; the editor part is necessary not central.
- ❌ Not an AI feature pile. The 5 co-edit affordances are intentionally minimal; the moat is that they live ON the paper canon, not that there are many of them.

---

## 6. Integration with the 3-layer architecture (also added v3.0)

`LOOM.md` §1.5 introduces the 3-layer architecture: terminal AI thinks, Loom renders, user orchestrates. Camp C lives entirely in the **render** layer:

```
User (orchestrator: vision keeper / capability router / verify gate / memory enforcer)
    │
    │ voice ⌥ / dictation / typing
    ▼
Terminal AI (thinking: Codex / Claude Code)
    │
    │ writes draft / artifact directly to Loom file (via LoomFileStore)
    ▼
Loom (rendering: paper canon + Camp C editability)
    │  ← user reads, edits in place, AI co-edits selections
    │  ← changes write back to source MD
    ▼
Wiki / archive / future re-reading
```

Camp C is the SURFACE where "user reads + edits + AI co-edits" happens. Without Camp C, Loom would be only the read-side endpoint of terminal AI's writes, and users would copy-paste to Notion to actually edit. With Camp C, Loom is the workshop where the artifact lives.

---

## 7. Honest unknowns (filed in `LOOM.md` §12 and this doc)

These don't block thesis filing but block M3 → M4 promotion until M2 surfaces real data:

1. **Will users edit Loom's rendering, or instinctively close-and-export to Notion?**
   - Hypothesis: paper canon quality + zero-friction edit is sticky enough to keep them
   - Risk: years of "to edit, go to Notion" muscle memory
   - Test: M2 prototype + 1-week user logging

2. **Is selection-based AI co-edit useful for prose?**
   - Hypothesis: yes — Cursor proved it for code, prose has more variation but more flexibility
   - Risk: prose AI suggestions are generic / unhelpful at the paragraph level
   - Test: M4 module (c) ships affordances incrementally; abandon ones unused

3. **Can DOM ↔ MD roundtripping survive Loom's custom components without lossy conversion?**
   - Hypothesis: structured AST as intermediate handles 95% of cases
   - Risk: long-tail of components require ad-hoc handlers
   - Test: M2 naïve roundtrip + cataloguing of failures

4. **What does mobile editing of paper canon look like?**
   - Hypothesis: TBD — paper canon is desktop-first; may need a "draft mode" CSS variant for mobile
   - Risk: paper canon is fundamentally not mobile-editable
   - Test: M5 explores; may discover paper canon is desktop-only and mobile gets a different layer

5. **Is the moat real, or will Notion ship paper-canon-quality typography in 2027?**
   - Hypothesis: Notion's architecture makes this hard; their block model is wrong granularity
   - Risk: large competitor catches up faster than Loom matures
   - Mitigation: Loom's source-anchored learning loop is a deeper moat than typography alone

---

## 8. Decision log for this design

- 2026-05-01 — Camp C reframe filed by Claude in dialog with product owner. Triggered by user observation: "我看你今天要你做 note，把笔记放到 notes 上，你也做好了很好的排版，但是我随时可以在 notes 上对你进行 edit，这也是个很重要的事情。" Apple Note workflow demonstrated the principle; Loom should deliver the same at paper-canon quality.
- 2026-05-01 — Decision: file thesis (this doc + LOOM.md §1.5 + §6.5 + LOOM_RULES §7.5 + plan), defer code. Honors `tmp/loom-correction-log.md` entry-005 ("don't ship rules for un-lived workflows").

---

## 9. Glossary

- **Camp A** — frozen-beautiful (LaTeX / Prism / Typst / Pandoc → PDF)
- **Camp B** — editable-mediocre (Notion / Apple Notes / Obsidian / Substack / Google Docs)
- **Camp C** — editable-beautiful (Loom's position)
- **Paper canon** — Loom's sealed v1.0 typography rules (vellum + page-on-deck + 60-72ch + zero texture, etc.)
- **3-layer architecture** — terminal AI (thinking) + Loom (rendering) + user (orchestrating)
- **AI co-edit** — selection-based AI affordances that suggest/apply edits while maintaining structural invariants
- **Structural invariant guard** — mechanism (CSS or MutationObserver) preventing user edits from breaking canon elements (drop caps, figures, ornaments)
- **Bi-directional binding** — DOM↔Markdown two-way sync; either side is single source of truth depending on direction

---

## 10. Cross-references

- `LOOM.md` §1.5 — Camp C positioning summary (canonical)
- `LOOM.md` §6.5 — Engineering decomposition of 5 modules (canonical)
- `LOOM.md` §11 Tier C — Roadmap entries C.M1-M5
- `LOOM_RULES.md` §7.5 — Operating rules + bans (binding for any agent touching Camp C work)
- `plans/loom-camp-c-editable-render.md` — Phased plan with milestone exit criteria
- `tmp/loom-correction-log.md` entry-005 — Don't-ship-un-lived-rules lesson (informs why M2 must validate before M4 ships)
- `tmp/loom-correction-log.md` entry-006 — Strategic reframe entry covering this whole filing
