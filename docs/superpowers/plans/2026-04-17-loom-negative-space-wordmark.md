# Loom Negative-Space Wordmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the approved negative-space absorption spec into a first deterministic preview board that studies Loom as a real wordmark design problem rather than an AI-styled render.

**Architecture:** Stop using image-generation-first exploration for the core typography. Instead, draw a black-on-white SVG study board directly in the repo so the work can focus on letterform structure, negative space, proportion, and state difference between the two `o` forms. Use the new negative-space spec as the source of truth, then iterate from the strongest study.

**Tech Stack:** SVG, Next.js workspace assets, local image preview in Codex, Markdown design specs.

---

## File Map

- `docs/superpowers/specs/2026-04-17-loom-negative-space-wordmark-design.md`
  Source-of-truth design direction for the new route.
- `docs/superpowers/plans/2026-04-17-loom-negative-space-wordmark.md`
  This execution plan.
- `public/brand/explorations/2026-04-17-negative-space-wordmark/study-board-1.svg`
  First deterministic black-on-white preview board with three Loom studies.

## Task 1: Produce The First SVG Study Board

**Files:**
- Create: `public/brand/explorations/2026-04-17-negative-space-wordmark/study-board-1.svg`
- Reference: `docs/superpowers/specs/2026-04-17-loom-negative-space-wordmark-design.md`

- [ ] **Step 1: Re-read the spec before drawing**

Run:

```bash
sed -n '1,240p' /Users/yinyiping/Desktop/Wiki/docs/superpowers/specs/2026-04-17-loom-negative-space-wordmark-design.md
```

Expected:
- the study emphasizes negative space, omission, and state difference
- the work avoids glow, effects, obvious ligatures, and generic geometric-sans behavior

- [ ] **Step 2: Create the study board SVG**

Draw one clean white sheet with three black `loom` studies:

- Study A: strongest state difference between the two `o` forms
- Study B: most reduced and symbol-like
- Study C: most editorial and calm

Each study should:

- keep `l` as the calm field
- make the first `o` less resolved
- make the second `o` more absorbed and stable
- keep `m` low, wide, and sedimented
- avoid decorative stroke connections

- [ ] **Step 3: Verify the file exists**

Run:

```bash
ls -l /Users/yinyiping/Desktop/Wiki/public/brand/explorations/2026-04-17-negative-space-wordmark/study-board-1.svg
```

Expected:
- one SVG file exists at the exact path above

- [ ] **Step 4: Preview the SVG locally**

Use Codex local image preview on:

```text
/Users/yinyiping/Desktop/Wiki/public/brand/explorations/2026-04-17-negative-space-wordmark/study-board-1.svg
```

Expected:
- the user can evaluate pure form without effects

- [ ] **Step 5: Stop for review**

Do not integrate anything yet. Present the board and explain:

- which study feels most like real identity design
- which study best carries the negative-space absorption idea
- what should change in the next round
