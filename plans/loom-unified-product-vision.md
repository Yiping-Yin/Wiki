# Loom — Plan Navigation Map (formerly Unified Product Vision)

> **Status**: SUPERSEDED 2026-05-01 by `LOOM.md` at repo root.
> **Original filed**: 2026-04-30 as a v1 "six-verb decomposition" vision document.
> **Current role**: navigation map showing where each sub-plan fits within the canonical product framing in `LOOM.md`.

---

## 1. Why this document was reduced

The original v1 of this document attempted to be both a vision statement AND a sub-plan navigation map. After the late-April → early-May 2026 ultrathink rounds with the product owner, the vision crystallized to a different, cleaner shape that no longer fit "six verbs":

- The unifying axis turned out to be the **learning loop**, not a list of verbs.
- The architectural primitive turned out to be the **Page** hosting **two AI modes** (LEARN / Teacher · THINK / Typesetter), not a "collapsing of six verbs".
- The missing piece turned out to be a single **Compile pipeline** sitting on top of seven existing or in-flight substrate pieces — not multiple new surfaces.

Rather than rewrite this document in place, the canonical product framing was elevated to **`LOOM.md` at repo root** (peer to `LOOM_RULES.md` and `LOOM_USER_PROFILE.md`). This file is now reduced to its still-useful function: a **navigation map** showing where each sub-plan fits.

---

## 2. The current canonical framing — read `LOOM.md`

For "what is Loom", "what AI modes are there", "what's the moat", "what's the roadmap", "what's the privacy model", "how do the eight supporting pieces fit together" — read **`LOOM.md`**.

`LOOM.md` covers:

- §1 What Loom Is — In One Sentence
- §2 The Learning Loop
- §3 Three Time Scales (Session / Span / Arc)
- §4 Two AI Modes (LEARN / THINK) + mode handshake + language behavior
- §5 The Page Primitive
- §6 Eight Supporting Pieces
- §7 The Compile Pipeline (the missing 8th piece)
- §7.5 Privacy & Data Flow
- §8 The Moat — Two Layers
- §9 What Loom Is NOT (12 anti-patterns including AI agent platform)
- §10 Current State
- §11 Roadmap (Tier 1 → Tier 6)
- §12 Open Questions (15 honest unknowns)
- §13 North-Star Image (Cosmic Substrate)
- §13.5 Onboarding & First-Run Experience
- §14 Built With — The Peer-AI Development Methodology
- §15 How This Document Relates to Others
- §16 Update Protocol

---

## 3. Sub-plan navigation map

| Tier | Concern | Plan | Status |
|------|---------|------|--------|
| 1 | Capture extractor lanes | `plans/ingest-extractor-refactor.md` | Shipped |
| 1 | Schema → reading-page bridge | `plans/ingest-to-learning-loop-bridge.md` | Shipped |
| 1 | Design System v1 foundation | `plans/loom-design-system-v1.md` | Foundation shipped, tranche 1 done, tranches 2-4 pending |
| 1 | Hex literal migration | `plans/design-system-migration-inventory.md` | Tranche 1 done; tranche 2 unblocked by tint family |
| 1 | CaptureAST pivot | (No formal plan filed; tracked by Codex via task list and peer-chat msg-002 onward) | In flight |
| 2 | Compile pipeline MVP | `plans/compile-pipeline-mvp.md` | TO BE FILED — derives from `LOOM.md §4`, §7, §7.5 |
| 2-3 | Content-shape rendering | `plans/phase-c-presentation-layer.md` | M1/Path B partial; M2-M4 not started |
| 4 | Cosmic substrate canon | `plans/cosmic-canon-v1.md` | TBD — derives from `LOOM.md §13` |
| 5 | Connect surface | `plans/connect-surface-echoes.md` | TBD — derives from `LOOM.md §3` Span scale |
| 6 | Return surface | `plans/return-surface-last-read.md` | TBD — derives from `LOOM.md §3` Arc scale |

---

## 4. Read order on session start

1. `LOOM.md` — what Loom is (canonical product definition)
2. `LOOM_RULES.md` — what Loom must / must not do (12 vetoes + North Star principles + §8 decision log)
3. `LOOM_USER_PROFILE.md` — who Loom is for
4. The relevant sub-plan in this map for the current task
5. Memory entries surface naturally via auto-memory

---

## 5. Maintenance protocol

This file should remain a **map**, not a vision document. Updates:
- When a new sub-plan is filed, add a row to §3.
- When a sub-plan's status changes (TBD → in flight → shipped), update the row.
- When a sub-plan is renamed, fix the link.
- When the canonical framing in `LOOM.md` changes substantively, this file does NOT need to be re-edited — the navigation map is decoupled from the framing.

Substantive vision changes go in `LOOM.md`. Implementation details go in the per-tier sub-plans. This file is the index between them.

---

*Reduced 2026-05-01 by Claude. The original v1 content (six-verb framing, page-as-primitive, five-ones architecture, seven 静奢 disciplines, tier 1-6 sequencing) lives in git history and conceptually in `LOOM.md`'s richer v2 framing. No information was lost; the framing was sharpened.*
