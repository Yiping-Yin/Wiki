# Phase C — Presentation Layer (体面 OUT)

> Status: **planning · no code yet**
> Filed: 2026-04-27
> Triggered by: user "差很远。这怎么给人看" after v1.1.5 (HN extractor shipped)
> Expected effort: ~5–10 days, broken into 4 milestones below

## Why this exists (frame)

Phase A ships **顺手 IN**: capture from any source (web / Atlas extension / clipboard / manual) into a per-folder `Loom.md`. That works.

Phase A does **not** ship **体面 OUT**. The only "view" of a capture today is the raw `Loom.md` opened in whatever the user's default markdown app is (iA Writer / Xcode / whatever). Even with a perfect site-specific extractor, the user is reading **markdown source code**, not typeset prose. That fails the "Prism / LaTeX-quality" bar by definition.

体面 is a separate concern that needs its own architectural layer:

- **Source of truth:** stays as `.md` files (interop with markdown ecosystem, plain-text durable, user-editable in any tool)
- **Presentation:** Loom owns the rendering, with content-shape-aware visual idiom
- **Export:** PDF / printable HTML / static site (Phase D scope, not here)

The mistake we kept making in Phase A: optimizing extraction polish (mini-Defuddle, sr-only stripping, HN tuple extractor) without recognizing that **even perfect markdown text rendered as source is still ugly**. The unit of "体面" is rendered output, not extracted text.

## Constitutional rules for this phase

1. **Source folder remains immutable.** All Loom-owned writes go through `LoomFileStore`. Phase C never writes back to user's external folder. (Carried over from "源文件夹是 immutable" memory.)
2. **`.md` is canonical.** Renders are derived; never lose information vs the source file. If a render hides metadata, that metadata must stay reachable in source.
3. **Content-shape-aware.** A list-of-pointers page (HN frontpage) is NOT visually the same shape as an essay (Substack post) or a syllabus (Moodle course). One renderer per shape; pick by detection, not user choice.
4. **No AI-generated rewriting at render time.** Render is deterministic given source. AI distill (Phase C2) writes back to source as a tagged section; then rendering picks that up. The render layer itself is not creative.
5. **User retains full editing power.** Drag-reorder / inline edit / section CRUD all work on the rendered surface. Source folder is read-only; `Loom.md` is read-write through Loom UI. (Carried over from "顺手 in / 体面 out" memory.)
6. **Veto: no in-Loom AI chat.** External LLMs do thinking; Loom does archiving + presenting. Render is the surface where archived material becomes presentable, not where new thinking happens.

## Detection: content shapes

Render shape is picked by inspecting the `Loom.md` content. The detection is heuristic but stable.

| Shape          | Signal                                                                  | Renderer         |
| -------------- | ----------------------------------------------------------------------- | ---------------- |
| **List**       | `^\d+\.\s+\[.+?\]\(.+?\)` matches ≥3 entries; uniform tuple metadata     | `ListGridView`   |
| **Article**    | One `H1` or `H2` followed by `>500` chars freeform prose; no tabular list pattern | `ArticleView`    |
| **Passage**    | `originalPaste` field present; `selection.length > 0`; quoted block     | `PassageCardView`|
| **Conversation** | `aiThread` body shape (alternating role:user / role:ai turns)         | `ConversationView`|
| **Syllabus**   | Course-code detected in eyebrow (e.g., `ECON 3202`); ingestion-extractor anchors present | `SyllabusBoard`  |
| **Mixed/unknown** | None of the above match cleanly                                      | `ArticleView` (fallback) |

Detection function returns a tagged enum + confidence; rendering layer picks the highest-confidence match. Cap detection cost at 5ms for entire `Loom.md` — regex passes only, no parser.

## Milestones

### M1 · `ArticleView` + `ListGridView` (3 days)

The two highest-frequency shapes. Ship together because they share the same chrome (header, source eyebrow, footer).

- `ArticleView`: applies existing Vellum tokens — paper background, serif body, drop cap, oldstyle figures, hanging punctuation. Reuses `LoomTokens`. Body width capped at 64ch per Premium Paper Principles.
- `ListGridView`: card grid layout. Each `\d+\. [title](url) _(domain)_\n   metadata` block becomes one card. Card has:
  - Title (serif 16pt, weight 500)
  - Domain (oldstyle small caps, top-right corner)
  - Meta line (sans 11pt, separator dot · pattern)
  - Hover state: hairline border darkens, no shadow shift (no "lift" — flat per craft rules)
- Both share an `EnvelopeFrame` chrome: title + eyebrow + the rendered body, hairline-bound.
- Click row in `CapturesView` → presents the appropriate shape view in a sheet sized 720×800.
- Print stylesheet hooks via `@page` (already present in `globals.css`).

**Definition of done:** screenshot of HN list and a Substack article side-by-side, both at "could ship to App Store screenshots" quality. User confirms before next milestone.

### M2 · `PassageCardView` + `ConversationView` (2 days)

Lower-frequency but identity-defining shapes — the existing `ProvenanceSlip` design (canonical 2026-04-25 paper recipe) is the visual core for `PassageCardView`. Don't redesign it; productionize the HTML preview into native SwiftUI.

- `PassageCardView`: page-on-deck inset, asymmetric padding, bronze pin, hairlines. Quote text in serif italic; source eyebrow; `→` link to the source URL.
- `ConversationView`: alternating role bubbles, role label as small-caps eyebrow (USER / ASSISTANT), no chat-app skeuomorphism (no rounded bubbles → just typographic rhythm).

**Definition of done:** existing `LOOM-Design-Resources/visual-language/PROVENANCE_SLIP_PREVIEW_PAPER_V7_FINAL.html` renders pixel-faithfully in SwiftUI. Conversation captures from M1 spec read like a stage-play transcript, not a Slack export.

### M3 · `SyllabusBoard` (2 days)

Specific to course-page captures. Reuses ingestion-extractor schema (already shipped). Surfaces as a structured board:

- Header: course code · course name · semester (oldstyle figures)
- Section: weekly schedule (when extractable)
- Section: assessments (when extractable)
- Section: instructor + contact (when extractable)
- Footer: source PDF / Moodle URL with re-extract button

Pulls schema from existing per-course extractor output (no new extraction work).

**Definition of done:** ECON 3202 capture renders as a clean board, not a wall of "Select activity Welcome to Country" lines.

### M4 · Distill layer entry (3 days)

The first taste of Phase C2 — capture → AI structured pull (external, via AIProviderSettings clients). Output written back to `Loom.md` as a `## Distill` section under the entry, schema-bound:

```yaml
---
distill_schema_version: 1
distilled_at: 2026-04-28T10:00:00Z
distill_provider: claude-opus
---
## Distill
### Key claims
- ...
### Citations
- ...
### Open questions
- ...
```

The renderer then picks up that section and renders it as a subordinate band beneath the main capture body. Distill is opt-in per capture (button on the rendered view, not auto-runs at capture time). User edits distill freely; subsequent re-distill respects user edits (prepend new attempt under timestamp, don't overwrite).

**Definition of done:** one HN capture has a ⌥-clickable "Distill" button. Click → external AI provider call → ~10 seconds → result lands in source as a `## Distill` block → renderer surfaces it inline. User can edit. User can delete. User can re-run. All without leaving the rendered view.

## Open design questions (resolve during M1)

1. **Sheet vs window vs replacing CapturesView body?** Right now `CapturesView` lists captures and a click reveals in Finder. After Phase C, click could:
   - (a) Push a NavigationStack page within the same view
   - (b) Open a separate window
   - (c) Slide-in a half-sheet
   - Need to test which feels least like "leaving Loom" — read-without-interruption. Tentative pick: (a) NavigationStack push, with `←` to return to list.
2. **Token sharing with web `globals.css`?** Loom has dual rendering paths (Vellum web + native Swift). Should Phase C reuse `globals.css` via a SwiftUI WebView, or re-implement tokens in `LoomTokens.swift`? Native is faster and avoids Webview overhead, but loses CSS reach (oldstyle figures, hanging punct, KaTeX). Tentative pick: native for `ListGridView` + `PassageCardView` (simple typography); web for `ArticleView` (long-form needs full CSS).
3. **Tabular content?** Loom currently has no rendered table. If a captured page has `<table>`, what does the render do? Defer to M1 after seeing real samples.
4. **Footer / pagination?** Long captures (>50 entries in one Loom.md) — paginate the list grid? Lazy-render? Tentative: lazy-render via `LazyVStack`, no pagination chrome.
5. **What lives at `/captures/<rootID>/<entry-slug>` URL?** If the rendered view becomes deep-linkable, what's the canonical URL pattern? Defer to M4 when distill writes back; that's when stable identifiers matter.

## Non-goals (explicitly out of scope)

- **In-Loom AI chat** — vetoed in memory. AI thinking happens externally; Loom presents what was archived.
- **Real-time collaboration** — single-user app for the foreseeable.
- **Mobile rendering** — macOS-only; iOS is post-1.0.
- **Comment threads / annotations on captures** — tempting but out of scope; Phase D.
- **Search across rendered views** — search is a separate feature; renders don't need to know about it.

## What this plan does NOT replace

- The capture pipeline (Phase A) keeps shipping incremental improvements. Site-specific extractors (Reddit, arxiv, GitHub, Twitter) are still useful — they make the source `.md` cleaner, which makes M1 renders cleaner with zero render-side work. Continue when real samples arrive.
- Storage location UX (P0 just shipped) is independent of rendering. Captures live where they live; rendering is a layer on top.
- Existing Captures list view (`CapturesView`) stays. The change is what happens on row click — instead of `NSWorkspace.shared.open` (current: P1) → reveal in Finder, post-Phase C: present an in-Loom shape-aware render.

## Kickoff checklist (when this gets the green light)

- [ ] Lock token map for `ListGridView` cards. Open existing Vellum tokens in `LoomTokens.swift`; add `cardElevation`, `cardSpacing`, `metaSeparator` if missing. No raw hex.
- [ ] Detection function unit-tested against fixtures: HN frontpage, Substack post, ProvenanceSlip-shaped passage capture, ECON 3202 syllabus, AI-thread paste.
- [ ] Pick sheet vs NavigationStack via 2-hour spike on M1 prototype.
- [ ] Wire `CapturesView` row click to a presenter that picks the right view by shape detection.
- [ ] Hairline / paper-on-deck primitives extracted to a shared `EnvelopeFrame` so all four views share chrome.

## What "done" looks like

A user clicks an HN frontpage capture in `CapturesView`. Within Loom (no external app), they see a card grid: 30 stories, each card readable at a glance, points and comments as visual hierarchy not raw text noise. They can ⌘P print it as a clean PDF. They can screenshot it and post it. It looks like something from a good design publication, not from a markdown source file.

Same for a Substack article capture, an arxiv list, a syllabus. Each has its own visual idiom that fits the content shape. No more "差很远".
