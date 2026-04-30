# Loom Design System v1.0 — Plan

> Status: **foundation shipped · tranche 1 done · tranches 2-4 not started** (updated 2026-04-30)
> Filed: 2026-04-28
> Triggered by: 一夜累积~80 个 patch 后的架构债诊断
> Expected effort: **4 nights** of disciplined work + 1 optional polish night
> Related plans: `phase-c-presentation-layer.md`, `snapshot-capture-mode.md`
>
> **Progress (as of 2026-04-30):**
> - **Foundation shipped**: canonical token source at `lib/loom-design-system.ts`
>   (11 base color tokens + 4 semantic state colors with muted variants +
>   typography scale + spacing + motion). CSS twin staging at
>   `app/globals-v2.css`. TS primitives shipped at `components/loom/*`
>   (Body / Display / Eyebrow / HairlineRule / LayoutArticle / LayoutGallery /
>   LayoutIndex / LayoutMagazine / LayoutSnapshot / Stack / Surface).
>   First consumer: `app/loom-render/capture/page.tsx` (Phase C M1).
> - **Tranche 1 done** (commit `e4c57c0`): collapsed 7 hex literals in
>   `components/{GradientDescent,NeuralNetCanvas}.tsx` to
>   `color.{thread,paperDeep,ink1,ink3,paperUp,paperCard}`.
> - **Tranche 2 blocked on lib expansion**: BPETokenizer palette + the
>   plum/sage/indigo/umber/rose connection strokes in NeuralNetCanvas need
>   a tint family added to the lib first (currently lib has only 4
>   semantic colors, not the 5 categorical tints the inventory expects).
> - **Tranche 3 (CSS migration)**: `app/globals.css` hex collapse + JSX
>   inline-style audits — not started; HOT-FILE-required surface.
> - **Tranche 4 (Swift mirror + light-mode tokens)**: `LoomTokens.swift`
>   alignment + light-mode variants (lib is currently dark-only) — not
>   started.

## Why this exists

After 5+ hours of nonstop iteration on Loom (capture pipeline, magazine landing, snapshot mode, Vellum chrome, agent C/D polish, etc.), every surface looks "OK on its own" but the product **lacks a coherent visual identity**. Each surface improvises:

- **15 different font sizes** scattered across 4 page.tsx files
- **5 different "bronze accent" expressions**: `LoomTokens.thread` / `var(--accent)` / `Color.accentColor` / hardcoded `#a36a3a` / various `color-mix(...)` formulas — **likely all slightly different in actual color**
- **No spacing scale**: 0.18em / 0.4em / 0.6em / 0.85em / 1.1em / 1.4em / 1.6em / 1.8em — every component picks its own
- **No motion scale**: 120ms / 160ms / 180ms / 200ms / 240ms / 400ms — same
- **4 rendering paths** (LoomMarkdownView SwiftUI legacy + Next.js Reader + Next.js Snapshot + Snapshot+JS), each with own CSS
- **State scattered across** sandbox files + 10+ localStorage keys + SwiftData + NSPasteboard
- **Tonight's killer bug** (sticky pivot bar `backdrop-filter` triggering layout oscillation) was a **direct symptom** of having no system-level rule about which CSS properties are scroll-safe

Continuing to add features without first establishing a system **lowers** quality with every patch — each new addition introduces another inconsistency.

## Constitutional rules (non-negotiable)

These are the hard veto rules. Every PR / agent dispatch / live coding session must check against these.

1. **No backdrop-filter on sticky / scroll-aware elements** — caused the reload loop. CSS `position: sticky` + `backdrop-filter` toggle = layout oscillation.
2. **No IntersectionObserver triggering layout-changing className toggle** — same root cause as #1.
3. **Hover state may only change `color` / `opacity` / `border-color` / `background`** — never `box-shadow` / `blur` / `filter` / `transform: scale` / dimensional changes that affect layout.
4. **All `useEffect` must list real dependencies** — empty `[]` is not a valid lazy fix.
5. **`useMemo` deps must be value-stable** — no `Date.now()` / `new Object()` / `[].includes(...)` directly in deps.
6. **Scroll-spy / IntersectionObserver may only do read-only side effects** — no `setState` from observer callbacks unless throttled to 1Hz with hysteresis.
7. **No `position: fixed` + `transform`** — Tahoe renders these inconsistently.
8. **Media elements (`<img>` / `<video>` / `<iframe>` / SVG / canvas) only inside `<MediaFrame>` primitive** — no raw `<img>` scattered across surfaces.
9. **No inline `<style>` blocks in React components** — all styles into either `globals.css` (global), `loom-design-tokens.css` (tokens), or `styled-jsx scoped` (component-local).
10. **No new font sizes / colors / spacings outside the design system** — if a surface needs a value not in the scale, add it to the scale, don't hardcode.

## Token system (lock these values, no deviations)

### Color · 11 tokens, no others

```css
:root {
  /* Paper — deep to surface, layered */
  --paper-deep:    #1A1815;   /* root background */
  --paper:         #221E18;   /* one layer up */
  --paper-up:      #2B2620;   /* two layers up */
  --paper-card:    #332E27;   /* three layers up */

  /* Ink — text + iconography */
  --ink-1:         #E8E0CE;   /* primary body text */
  --ink-2:         #B9AE93;   /* secondary / metadata */
  --ink-3:         #8F8571;   /* muted / chrome */

  /* Lines */
  --hair:          rgba(232, 224, 206, 0.10);   /* default 0.5px */
  --hair-faint:    rgba(232, 224, 206, 0.05);

  /* Accent — single bronze, no variations */
  --thread:        #C4A468;
  --thread-muted:  rgba(196, 164, 104, 0.55);
}
```

Light mode: invert paper/ink (warm ivory + dark ink) — values determined during night 1.

**Veto**: any other hex value in any file. If a surface needs e.g. red for destructive action, add `--alert: #C44;` once to the token file.

#### Semantic colors · 4 state tokens + muted variants

Added 2026-04-27 after sweep agents flagged repeated re-introduction of `Color.red` / `#c44` / `#b04030` because the base palette lacked sanctioned state colors. These are the only allowed exits for state communication.

```css
:root {
  /* Destructive — red. Delete / cancel / error. */
  --alert:          #C44743;
  --alert-muted:    rgba(196, 71, 67, 0.55);

  /* Positive — sage. Confirmations, complete states. */
  --success:        #6A8C5A;
  --success-muted:  rgba(106, 140, 90, 0.55);

  /* Neutral informational tints — ink-blue. */
  --info:           #5A7A9A;
  --info-muted:     rgba(90, 122, 154, 0.55);

  /* Caution — warm amber, distinct from --thread bronze. */
  --warning:        #B98E3F;
  --warning-muted:  rgba(185, 142, 63, 0.55);
}
```

Swift mirrors: `LoomTokens.dsAlert / dsAlertMuted / dsSuccess / dsSuccessMuted / dsInfo / dsInfoMuted / dsWarning / dsWarningMuted`.

TS mirrors: `color.alert / alertMuted / success / successMuted / info / infoMuted / warning / warningMuted`.

**Discipline:**
- Destructive states (delete buttons / cancel / error chrome) → `--alert`. No more `#c44` / `#b04030` / `Color.red`.
- Complete / confirmed / saved states → `--success`. The legacy `LoomTokens.sage` alias is kept but new code uses `dsSuccess`.
- Muted hint chips / informational pills → `--info`. Not bronze (which is for AI / selection / focus).
- "Are you sure?" / "Unsaved" / pre-destructive caution → `--warning`. Distinct from bronze; reserve bronze for accent.
- The deliberate per-tag palette in `captures/page.tsx` (`TAG_PALETTE`) is **not** semantic state — it stays as-is.

**Veto**: any new destructive / state hex anywhere. Pick one of these four; add muted suffix if 55% alpha is the right tone.

### Type · 6-step ladder, 3 families

```css
:root {
  --serif:    "Charter", "Iowan Old Style", "Source Serif", Georgia, serif;
  --display:  "EB Garamond", "Cormorant Garamond", "Charter", serif;
  --mono:     "IBM Plex Mono", "JetBrains Mono", "SF Mono", monospace;
}
```

```
display-1   --display   italic   32px / 1.15  weight-400   page H1
display-2   --display   italic   22px / 1.20  weight-500   section H2
display-3   --display   italic   16px / 1.30  weight-500   sub H3
body        --serif     normal   16px / 1.62  weight-400   prose
caption     --serif     italic   13px / 1.45  weight-400   secondary
eyebrow     --serif     normal   11px / 1.00  weight-500   smallcaps + tracking 0.16em
mono        --mono      normal   13px / 1.55  weight-400   code, paths, IDs
```

All numerals use `font-feature-settings: "onum" 1, "pnum" 1` (oldstyle, proportional). All prose uses `hanging-punctuation: first last`.

**Veto**: any inline `font-size: 0.78rem` etc. Use one of these 7 classes / utility presets.

### Spacing · 8pt grid, 6 values

```
xs   4pt   = 0.25rem
sm   8pt   = 0.5rem
md   16pt  = 1rem
lg   24pt  = 1.5rem
xl   40pt  = 2.5rem
2xl  64pt  = 4rem
```

Implementation: `--space-xs` through `--space-2xl` CSS vars + Tailwind-style utility classes if convenient.

**Veto**: any `padding: 0.85em` / `margin: 1.4em` etc. Pick a token.

### Motion · 3 durations, 1 easing

```
fast    140ms ease-out   hover, active, button-press
normal  220ms ease-out   layout-shift, expand/collapse
slow    400ms ease-out   route-transition, modal-open
```

**Veto**: any `transition: 200ms cubic-bezier(...)` in component CSS.

### Radius · 3 values

```
r-sm   4px   chips, small buttons
r-md   8px   cards, surfaces
r-lg   12px  sheets, full panels
```

### Shadow · 2 layers, paper-aware

```
shadow-sm   0 1px 2px color-mix(in srgb, var(--paper-deep) 60%, transparent)
shadow-md   0 6px 22px color-mix(in srgb, var(--paper-deep) 40%, transparent)
```

**Veto**: bare RGBA shadows.

### Hairline · 1 line style only

```
border: 0.5px solid var(--hair);
```

No 1px, no 2px, no varied colors. Hair is `--hair`. Always.

## 6 primitives (use these, don't hand-roll)

These are the building blocks. Each ≤80 lines, accepts standardized props, applies tokens.

### `<Surface tone="card|paper|deep" radius="sm|md|lg">`

Card-or-panel base. Auto-applies bg + hairline border + radius.

```tsx
<Surface tone="card">
  <Stack gap="md">
    <Eyebrow>Workspaces</Eyebrow>
    <Display level="2">Today</Display>
    <Body>Some prose...</Body>
  </Stack>
</Surface>
```

### `<Eyebrow level="section|chip|caption" subtle?>`

Smallcaps section labels. `level` controls size + tracking.

### `<Display level="1|2|3" italic?>`

Display serif headings. Italic by default at 1/2.

### `<Body weight="normal|medium" tone="primary|secondary|muted">`

Prose body. Auto applies serif + line-height + onum.

### `<Stack gap="xs|sm|md|lg|xl|2xl" align="start|center|stretch">`

Vertical layout primitive with rhythm. Replaces every ad-hoc VStack-with-spacing.

### `<HairlineRule orient="horiz|vert">`

The single allowed divider. 0.5px `var(--hair)`.

## 5 layouts (every capture / surface picks one)

Each layout is a top-level composition primitive. Layouts compose primitives + tokens — no custom CSS allowed inside.

### `<LayoutArticle>`

64ch centered, drop cap on first p, folio at footer, optional inline TOC.

For prose-heavy captures: Substack articles, Wikipedia entries, blog posts.

### `<LayoutGallery>`

96ch wider, 3-col image grid, hero image full-bleed top.

For image-heavy captures: dev guides like flipdisc.io, design portfolios, photo essays.

### `<LayoutMagazine>`

Full-width hero + auto-fill grid of cards.

For list captures: HN frontpage, Reddit subreddit, arxiv list.

### `<LayoutSnapshot>`

Full-width iframe with sticky toolbar strip.

For snapshot captures: original page reproduction.

### `<LayoutIndex>`

Section-grouped collapse list with pivot bar.

For the captures landing itself + any "browse N items" surface.

**Auto-detection** function picks layout per content shape; user can override via dropdown in toolbar.

## Migration path · 4 nights

### Night 1 · Token + Primitives + globals-v2.css (foundation)

**Deliverables:**
- `lib/loom-design-system.ts` — TypeScript constants for all tokens (color, type, spacing, motion, radius, shadow)
- `app/globals-v2.css` — replaces `globals.css` (or supplements it) with token CSS vars + 6 utility classes (`.eyebrow / .display-1 ... / .body / .caption / .mono`)
- `components/loom/Surface.tsx` + `Eyebrow.tsx` + `Display.tsx` + `Body.tsx` + `Stack.tsx` + `HairlineRule.tsx` — 6 primitives, ≤80 lines each
- `LoomTokens.swift` updated to expose Swift-equivalent constants (mirror of design-system.ts)

**Discipline:**
- Delete every hex literal that's not in the token list
- Delete every font-size that's not in the type ladder
- Delete every spacing that's not in the spacing scale
- Inline-style attributes auditing: `style={{...}}` only allowed for tokens-already-applied via class

**Acceptance:**
- TypeScript + Next.js build green
- New file structure committed
- `globals-v2.css` size ≤ 2KB vs current `globals.css` 100+KB (most of current is dead/legacy)

### Night 2 · Reader path (capture/page.tsx)

**Deliverables:**
- Rewrite `app/loom-render/capture/page.tsx` ground-up using primitives + layouts
- `<LayoutArticle>` for prose-heavy
- `<LayoutGallery>` for image-heavy
- Migrate Prism syntax highlighting tokens to `--ink-X` palette
- Drop ALL inline `<style>` blocks; move to `globals-v2.css` or scoped JSX

**Acceptance:**
- 4 capture types render correctly: HN list (→ Magazine), Moodle prose (→ Article), flipdisc rich (→ Gallery), Substack (→ Article)
- No reload loops, no scroll lockouts
- Print-to-PDF works (⌘P)

### Night 3 · Index + Snapshot

**Deliverables:**
- Rewrite `app/loom-render/captures/page.tsx` using `<LayoutIndex>`
- Rewrite `app/loom-render/snapshot/page.tsx` using `<LayoutSnapshot>`
- Verify scroll stable, hover states consistent, no layout-shift bugs

**Acceptance:**
- Captures landing scrolls smoothly under all conditions
- Snapshot view chrome consistent with Reader chrome (visual coherence)

### Night 4 · SwiftUI chrome + finalize

**Deliverables:**
- `LoomMinimalRootView` sidebar uses Swift-side primitive equivalents
- `WebCaptureSetupView` cards use Swift-side primitives
- Token sync verified between `loom-design-system.ts` and `LoomTokens.swift`
- Print stylesheet polished
- Audit pass: every remaining hardcoded value flagged + corrected

**Acceptance:**
- Native chrome looks identical (or at parity) to webview chrome
- Sidebar / toolbar / setup pages match Vellum identity
- No visual orphans: every surface clearly part of "Loom"

### Night 5 (optional) · Animation + media polish

**Deliverables:**
- GIF / WebP / APNG verified animating
- Canvas recording stable + working (file-based, no body-cap interaction)
- Snapshot+JS mode CSS animations re-running
- YouTube fallback works in Reader

**Acceptance:**
- Pages with animation come through as expected
- No regression to text-heavy capture rendering

## What gets thrown away

- `LoomMarkdownView` SwiftUI native rendering path (deprecated by Reader webview)
- `globals.css` ~95% of contents (legacy / dead / one-off rules)
- All inline `<style>` blocks in page.tsx files
- All hardcoded hex / RGBA values in components
- All ad-hoc useEffect with bad deps
- Sticky pivot bar `stuck` state class (already removed tonight)
- Refresh-on-notification webview reload (already removed tonight)

## What survives

- Capture pipeline (extension v1.4.0) — sound, just polish
- Native bridge endpoints — sound, additive only
- LoomFileStore + sandbox storage — sound
- CaptureSheet review-before-save flow — sound
- Magazine landing data flow — sound, just visual rebuild
- Phase D Snapshot mode v0 — sound, just chrome rebuild

## How to dispatch agents under this plan

Each agent gets a **slice of the plan**, not free rein. The plan itself is the contract:

- Agent owns 1 file or 1 surface
- Agent applies primitives + tokens, no inventing
- Agent verifies every constitutional rule (1-10) before declaring done
- Agent reports which rules they checked (not just "shipped")

This way 4 agents in parallel = 4 surfaces migrated to the system, with **provable consistency**.

## Open questions (resolve during night 1)

1. **Light mode tokens**: do we ship with light mode equivalents from day 1 or defer? Recommendation: defer. Get dark right first, then derive light.
2. **Tailwind vs styled-jsx vs CSS Modules**: pick one for primitives. Recommendation: CSS Modules + utility classes from `globals-v2.css`. Avoid Tailwind sprawl.
3. **Where do existing one-off Loom components fit** (LoomDiagram, AnchorCard, ProvenanceSlip recipe, etc.)? Recommendation: review one by one; either rewrite to primitives or mark as "specialty" outside the system but auditable.
4. **Migration big-bang vs gradual**: do we rewrite all surfaces in 4 nights, or migrate one a day for 8 days? Recommendation: 4 disciplined nights. The system is small enough that big-bang is feasible.
5. **Backwards compat with shipped data**: existing Loom.md + snapshots must still render correctly. Recommendation: yes — design rendering to read existing schema unchanged.

## What this plan does NOT replace

- Phase C presentation layer plan (`phase-c-presentation-layer.md`) — that's about content-shape-aware rendering, this is about the design system that drives all rendering. Compatible.
- Snapshot capture mode plan — orthogonal capability layer.
- The capture pipeline / Phase A work — pipeline stays, only surfaces are migrated.

## Quality bar

Each surface in the system must pass these checks before counting as "migrated":

- [ ] Uses only tokens from this plan
- [ ] Uses only primitives from this plan
- [ ] Uses only layouts from this plan
- [ ] Passes all 10 constitutional rules
- [ ] No new hex / font-size / spacing / motion value introduced
- [ ] Verified scroll-stable + hover-stable on real captures
- [ ] Visual identity unmistakably "Loom"

When all 4 main surfaces (Reader / Index / Snapshot / Web Capture Setup) pass these checks, Loom v1.0 design system is shipped.
