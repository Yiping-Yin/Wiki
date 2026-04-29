# Design System v1.0 — Migration Inventory

> **Scope.** Read-only audit of `app/loom-render/`, `components/`, `macos-app/Loom/Sources/` against the v1.0 plan in `plans/loom-design-system-v1.md`. Skips `node_modules`, `.next-build`, `.next-export`. Hot files: `capture/page.tsx` (2591 lines), `captures/page.tsx` (2153), `snapshot/page.tsx` (2156), plus 3 Swift surfaces > 1000 lines.
>
> **Intent.** Tonight's three parallel agents (tokens / TS primitives / Swift mirror) ship the foundation. Nights 2-4 consume this doc to know precisely what to migrate, where the constitutional landmines sit, and which 10-minute fixes already pay off.

---

## 1. Hex color inventory

**67 hex literals** in `app/loom-render` + `macos-app/Loom/Sources`, **40+ more** in `components/`. Most are repetitions of ~12 distinct values that already match the canonical palette. Grouped by intent:

### Paper / ink (already Vellum-canonical → drop literal, point at token)
| Hex | Usage | Maps to |
|---|---|---|
| `#1A1815` `#1A1712` | NeuralNetCanvas bg, ContentView dark bg, `--paper-deep` | `--paper-deep` / `LoomTokens.dsPaperDeep` |
| `#221E18` (implicit via tokens) | — | `--paper` |
| `#2B2620` `#242018` | NeuralNetCanvas chip bg | `--paper-up` |
| `#332E27` `#3A3428` | NeuralNetCanvas border | `--paper-card` |
| `#F4F0E4` `#fbf6ec` `#FAF7EC` | snapshot bg fallback, capture mat-thin-bg, BPETokenizer fg, NeuralNet fg | light `--paper` |
| `#E8E0CE` `#D9CFA8` `#ECE2C9` | NeuralNet caption, candle | `--ink-1` / candle |
| `#B9AE93` `#8A8373` `#6F6756` | secondary, muted, mutedNight | `--ink-2` / `--ink-3` |
| `#2A2520` `#4A4339` `#1a1a1a` | snapshot fg, ink-2 | `--ink-1` (light mode) |
| `#1d1d1f` `#f5f5f7` | LoomCursor SVG strokes | `--ink-1` (cursor exception OK; SVG attr) |

### Accent (5 expressions of same bronze, all slightly different)
| Hex | Where | Maps to |
|---|---|---|
| `#9E7C3E` | LoomCursor SVG, ContentView light accent, NeuralNet button, ContentView palette[0] | `--thread` |
| `#C4A468` | LoomTokens canonical, ContentView dark accent | `--thread` (canonical `#C4A468`) |
| `#B98E3F` | GradientDescent canvas, BPETokenizer palette | `--thread` |
| `#D4B478` | ContentView dark accent text | `--thread-hi` |
| `#7A5E2E` | ContentView light accent text | `--thread` (dark variant via `dynamic`) |
| `#8c6a3f` `#a36a3a` `#90683f` `#a07a5a` | captures pivot palette, snapshot accent fallback, CourseContextStrip | **collapse to `--thread`** — these are improvised bronzes |
| `#c4942a` `#A8783E` | snapshot pin highlight, ochre | `--thread` (pin special) / `--thread` |

### Tint family (categorical, only allowed via Loom palette)
| Hex | Where | Maps to |
|---|---|---|
| `#5C6E4E` `#6a8c5a` `#5a7a4a` | sage, captures green | `--tint-sage` (existing) |
| `#3A477A` `#5a7a9a` `#4a6a8a` | indigo, captures blue | `--tint-indigo` |
| `#5E3D5C` | plum (NeuralNet), BPETokenizer | `--tint-plum` |
| `#5C3F2A` | umber | `--tint-umber` |
| `#8F4646` `#a3433a` `#a05a62` `#b06a72` | rose, CourseContextStrip red, captures rose | `--tint-rose` |

### Alert / destructive (improvised — promote to `--alert`)
| Hex | Where |
|---|---|
| `#c44` | captures.delete-confirm bg/border (3x), captures.delete-progress (3x) |
| `#c33` | RehearseThisButton danger fallback (2x) |
| `#c94a4a` | SelectionEditToolbar, SourceCorrectModal, SourceCorrectionsBadge tint-red fallback (4x) |
| `#b04030` | snapshot pin-action.delete:hover |
| `#ff5f57` `#febc2e` `#28c840` | DocViewer traffic-light dots (intentional macOS chrome — keep) |

### Chrome / external (out-of-system, intentional or framework)
| Hex | Where | Action |
|---|---|---|
| `#4a7eff` `#335eea` | CapturesView WebKit-injected blue gradient | Keep (extension button) |
| `#ff5f57` etc. | DocViewer traffic lights | Keep (literal Apple chrome) |
| `#fff` (≈12 sites) | DropZone btn, BatchRunner, AnchorDebugOverlay, DevStatusBadge, BPETokenizer, etc. | Convert to `--paper-deep` (inverted) or keep as `#fff` literal once added to alert-on-bronze utility |

### LoomTokens.swift hex literals (CANONICAL — leave alone, this is the source)
Lines 111-133 (paper/ink/candle/thread/gold/ochre/rose/sage/indigo/plum/umber). These define the system. Night 1 spec adds the new `dsPaperUp` / `dsPaperCard` / `dsHair` / `dsHairFaint` / `dsThread*` constants which are already partly present (lines 29-60 — the `ds*` pattern is good). Migration target: every other Swift `Color(hex:0x...)` site outside this file routes through these.

**Net violation count:** ~50 literal hex sites in app code outside `LoomTokens.swift`. Most are 1-line replacements — collapse onto 4 ladder positions: `--paper*`, `--ink*`, `--thread*`, `--tint-*`, plus a single `--alert: #C44`.

---

## 2. Inline font-size inventory

**458 occurrences** across the corpus. Bonkers spread:

| Value | Count | Maps to ladder |
|---|---|---|
| `0.72rem` | 40 | **caption** (13px ≈ 0.81rem; closest, fold up) |
| `0.78rem` | 56 | **caption** |
| `0.82rem` `0.84rem` `0.85rem` | 79 | **caption** (loose) — many of these want `body` smaller variant |
| `0.7rem` `0.66rem` `0.68rem` `0.62rem` `0.64rem` | 72 | **eyebrow** (11px) |
| `0.6rem` `0.6rem` | 5 | **eyebrow** (subtle) |
| `0.86rem` `0.88rem` | 17 | **body** (loose) |
| `0.92rem` `0.94rem` `0.95rem` `0.98rem` `1rem` | ~25 | **body** |
| `1.04rem` `1.05rem` `1.1rem` `1.12em` | 8 | **body** (slight emphasis — replace with weight, not size) |
| `1.18em` `1.2rem` | ~6 | **display-3** (16px) |
| `1.32em` `1.4rem` | ~6 | **display-2** |
| `1.6em` `1.7rem` | ~3 | **display-2** |
| `2.4em` `2.4rem` | 2 | **display-1** |
| `11px` | 3 | **eyebrow** (snapshot banner; literal px) |
| `var(--fs-caption)` etc. | ~17 | already token-bound; rename to `--text-caption` for v2 |

The Type ladder spec (display-1/2/3 + body + caption + eyebrow + mono) collapses 50+ distinct pixel values down to **7**. Every site becomes one of `.display-1` / `.display-2` / `.display-3` / `.body` / `.caption` / `.eyebrow` / `.mono` utility class.

### Swift-side
- `.font(.system(size: 9-14))` accounts for **287 sites** across Swift files. Maps to:
  - 9-10 → `LoomTokens.fontEyebrow` (new)
  - 11 → `LoomTokens.fontCaption`
  - 12-13 → `LoomTokens.fontBody`
  - 14-16 → `LoomTokens.fontDisplay3`
  - 24-32 → `LoomTokens.fontDisplay1/2`
- LoomTokens.swift currently exposes only font *stacks* (lines 141-145), no size constants. **Night 1 must add a 7-element Swift Font ladder** mirroring the CSS classes.

---

## 3. Inline spacing inventory

**153 padding/margin/gap declarations** in TSX/CSS. Top values + 8pt grid mapping:

| Value | Count | Grid |
|---|---|---|
| `gap: 0.4rem` | 10 | **xs (0.25)** or **sm (0.5)** — round to `--space-sm` |
| `gap: 0.6rem` `0.7rem` | 11 | **sm (0.5)** |
| `gap: 0.5rem` `0.55em` `0.42rem` `0.34rem` `0.35rem` `0.32em` `0.2rem` `0.25rem` | ~22 | **xs / sm** — snap to one of two |
| `gap: 1rem` `1.4rem` | 5 | **md** / **lg** |
| `padding: 0.85em 0` | 4 | **sm vertical** |
| `padding: 1em 1.2em` etc. | ~25 distinct values | distribute across **sm / md / lg** |
| `padding: 1.4rem 1.6rem 1.2rem` | various 3-value | asymmetric → use `<Surface inset="lg">` primitive |
| `margin: 0.85em 0` `1em 0` `1.6em 0` | 9 | **sm / md / lg** |
| `margin: 0.2em 0 0.4em` | 2 | **xs** |

Spec lists exactly **6 tokens** (xs 4pt / sm 8pt / md 16pt / lg 24pt / xl 40pt / 2xl 64pt). Current implementation runs **~50 distinct values**. Most asymmetric paddings (`1.4rem 1.8rem 1.2rem`) collapse onto a Surface primitive with `inset="lg"` semantic prop.

### Swift-side
SwiftUI padding distribution:
- `.padding(.vertical, {2,3,4,6,8,10})` × 75+ sites → maps to xs/sm/md
- `.padding(.horizontal, {6,8,10,12,14,16})` × 50+ sites → maps to sm/md/lg
- `.padding({8, 10, 16, 20})` × 45+ sites → maps to sm/md/lg

LoomTokens.swift currently has **no spacing constants**. Night 1 must add `LoomSpace.xs / sm / md / lg / xl / xxl` (CGFloat).

---

## 4. Motion / transition inventory

**105 transition declarations**. Duration histogram:

| Value | Count | Maps to |
|---|---|---|
| `120ms` | 44 | **fast (140ms)** — slight slowdown |
| `0.18s` (180ms) | 36 | **fast / normal** — fold to fast |
| `0.2s` `200ms` | 29 | **normal (220ms)** |
| `0.15s` (150ms) | 11 | **fast** |
| `160ms` | 8 | **fast** |
| `0.4s` (400ms) | 7 | **slow (400ms)** — exact match |
| `0.22s` `0.25s` `0.28s` `0.3s` `220ms` `240ms` | ~22 | **normal** |
| `100ms` `180ms` | 6 | **fast** |
| `0.55s` `350ms` `1500ms` `1600ms` `800ms` | rare | bespoke; either drop to `slow` or keep as one-off animation keyframe (acceptable per spec — only `transition` durations are governed)

**Easing.** Almost every site uses `ease` or `ease-out`. A handful use `var(--ease)` (already tokenized — rename to canonical name in v2). Spec mandates `ease-out` everywhere.

After migration, every `transition: …` becomes `var(--motion-fast)` / `var(--motion-normal)` / `var(--motion-slow)` — collapses 44 distinct ms values down to 3.

---

## 5. Files ranked by migration difficulty (smallest first)

| File | Lines | Token violations | Effort |
|---|---|---|---|
| `components/PyodideRunner.tsx` | 55 | 1 hex (`#fff`), 1 fontSize, 1 padding | **small** |
| `components/Callout.tsx` | 37 | minimal | **small** |
| `components/RehearseThisButton.tsx` | ~95 | 2 danger hex (#c33), 1 hover | **small** |
| `components/CoverPlate.tsx` | ~60 | 3 var() with hex fallback | **small** (just drop fallback hex) |
| `components/AnchorDebugOverlay.tsx` | 67 | 1 hex (`#fff`), inline styles | **small** |
| `components/DevStatusBadge.tsx` | 67 | 1 hex (`#fff`), inline styles | **small** |
| `components/SourceCorrectModal.tsx` | 182 | 2 var with #c94a4a fallback | **small** |
| `components/AttentionHeatmap.tsx` | ~150 | 1 rgba (intentional heatmap), 1 fontSize | **small** (heatmap exempt — categorical color) |
| `components/SourceCorrectionsBadge.tsx` | 319 | 3 var fallbacks, inline styles, position:fixed | **medium** |
| `components/SelectionEditToolbar.tsx` | 419 | 1 var fallback, ~12 inline sizes | **medium** |
| `components/CourseContextStrip.tsx` | 894 | 1 hex (`#a3433a`), inline `<style>` block | **medium** |
| `components/ChatFocus.tsx` | 1426 | inline `<style>`, multiple opacity literals | **large** |
| `components/ReviewThoughtMap.tsx` | 1696 | already heavy `var(--*)` user, ~5 misuses | **medium** (mostly clean) |
| `app/loom-render/captures/page.tsx` | **2153** | 13 hex, 34 font-size, 43 spacing, **3 backdrop-filter on sticky/animated**, 1 `position:fixed`, hover transform | **large** (pivot rewrite via `<LayoutIndex>`) |
| `app/loom-render/snapshot/page.tsx` | **2156** | 17 hex, 43 font-size, 56 spacing, **6 backdrop-filter**, 5 `position:fixed`, hover `transform: scale` | **large** (rewrite via `<LayoutSnapshot>`) |
| `app/loom-render/capture/page.tsx` | **2591** | 3 hex, 55 font-size, 87 spacing, 3 `position:fixed`, **1 IntersectionObserver→setState (rule #6)**, hover box-shadow growth (rule #3) | **large** (rewrite via `<LayoutArticle>` + `<LayoutGallery>`) |
| `macos-app/Loom/Sources/LoomMinimalRootView.swift` | 1044 | 4 opacity literals, 20 font(.system) | **medium** |
| `macos-app/Loom/Sources/CapturesView.swift` | 1429 | 6 opacity, 56 font(.system), 1 webview hex (extension chrome — exempt) | **large** (driver of WebCaptureSetupView) |
| `macos-app/Loom/Sources/CaptureSheet.swift` | 2164 | 12 `Color.secondary.opacity` literals, 69 font(.system) | **large** |
| `macos-app/Loom/Sources/LoomFolderHomeView.swift` | 2208 | 5 opacity, 45 font(.system) | **large** |
| `macos-app/Loom/Sources/SourceFileView.swift` | 2005 | 3 opacity stroke, ~30 font(.system) | **medium** |
| `macos-app/Loom/Sources/ContentView.swift` | 3524 | **two embedded JS strings literally encoding the entire palette as hex** (lines 1532-1545, 2223-2224), 37 font(.system) | **large** (the embedded JS is a script — token sync challenge) |

**Order recommendation for nights 2-4:**
- **Night 2 (Reader path):** `capture/page.tsx` rewrite (largest, but stand-alone; pulls components/Mermaid, components/CopyButton along).
- **Night 3 (Index + Snapshot):** `captures/page.tsx` + `snapshot/page.tsx` together — they share pivot/chip/backdrop-filter patterns.
- **Night 4 (Swift chrome):** sweep CaptureSheet + WebCaptureSetupView + LoomMinimalRootView + LoomFolderHomeView. ContentView's embedded JS palette becomes a `LoomDesignSystem.swift` exported JSON blob.

---

## 6. Constitutional violations found

### Rule 1 (no `backdrop-filter` on sticky / scroll-aware): **9 violations**
- `app/loom-render/captures/page.tsx:701` — sticky pivot bar `backdrop-filter: blur(10px)` (rule's literal namesake; comment at line 684 says the `stuck` class was killed but the filter remains)
- `app/loom-render/captures/page.tsx:1137` — sub-pivot strip blur(8px)
- `app/loom-render/captures/page.tsx:1519` — bulk-action floating bar (position:fixed) blur(14px)
- `app/loom-render/snapshot/page.tsx:506-507` — `#loom-snapshot-banner` blur(6px), banner is fixed
- `app/loom-render/snapshot/page.tsx:1298-1299` — sticky toolbar blur(8px)
- `app/loom-render/snapshot/page.tsx:1505-1506` — floating fullscreen exit blur(8px)
- `app/loom-render/snapshot/page.tsx:1761-1762` — pin popover blur(10px)
- `app/loom-render/snapshot/page.tsx:1944-1945` — annotation drawer blur(8px)
- `app/loom-render/snapshot/page.tsx:1990-1991` — fullscreen overlay blur(4px)

**Diagnosis.** The sticky-pivot `backdrop-filter` was the literal cause of tonight's reload loop (per plan). All sticky/fixed sites must drop the filter and use a solid `var(--paper)` with `box-shadow` instead.

### Rule 3 (hover may not change `box-shadow` / `filter` / `transform: scale`): **3 violations**
- `app/loom-render/captures/page.tsx:985-986` — `.loom-capture-row-wrap:hover { transform: translateY(-1px) }` causes layout shift
- `app/loom-render/snapshot/page.tsx:1701-1702` — `.pin:hover { transform: scale(1.08) }` violates `scale` clause
- `app/loom-render/capture/page.tsx:1799-1800` — `.loom-embed.video:hover { box-shadow: 0 6px 22px ... }` — hover-grow shadow

**Diagnosis.** All three are decorative; replace with `opacity` / `border-color` change. `transform: translateY(-1px)` on `:hover` is a particularly common temptation — flag it for the agent.

### Rule 6 (IntersectionObserver may only do read-only side effects, throttled): **1 confirmed, 2 probable**
- `app/loom-render/capture/page.tsx:704-723` — `useActiveSection` IO callback iterates entries and calls `setActive(pick)` synchronously, no throttle, no hysteresis. This is the same shape as the killed sticky pivot bug. **Must add 1Hz throttle + hysteresis.**
- `components/AnchorDot.tsx:76` — IntersectionObserver in component, needs review (file truncated; assumption: same pattern).
- `components/TableOfContents.tsx:50` — IntersectionObserver, same audit needed.

`components/DocOutline.tsx:71` is **clean** — comment explicitly says "previous implementation used IntersectionObserver; replaced." Good model.

### Rule 7 (no `position: fixed` + `transform`): **0 confirmed**
- All five `position: fixed` sites in `snapshot/page.tsx` (499, 542, 1500, 1754, 1986) and three in `capture/page.tsx` (1466, 1914, 2112) — none combine with `transform` on the same element per quick scan. **Re-verify on full migration, especially line 1754 pin popover.**
- `components/SourceCorrectionsBadge.tsx:144` — sets style string `'position:fixed'`; needs verification it's not paired with transform.

### Rule 4 / 5 (`useEffect` empty deps doing more than mount-once; `useMemo` with unstable deps)
- 13 instances of `}, [])` in the three loom-render pages. Most are mount-time fetches (`fetch('loom://native/...')`) which are LEGITIMATE. The lint-eslint-disable at `capture/page.tsx:733` (`useActiveSection`) signals an intentional dep override — verify behavior is correct.
- No instance of `Date.now()` / `Math.random()` / `[].includes()` directly inside a `useMemo` deps array detected. **Clean on rule 5.**

### Rule 8 (no raw `<img>`)
**Clean.** Every `<img>` reference in `app/loom-render` is inside a regex/string transform (markdown→HTML). No live JSX `<img>` outside a primitive. Migration: define `<MediaFrame>` and pipe the markdown output through it.

### Rule 9 (no inline `<style>` in React components)
- 22 `<style>` blocks total. Locations: `snapshot/page.tsx`, `capture/page.tsx`, `captures/page.tsx` (these are the page-level pages — `styled-jsx` is acceptable per spec, just confirm scope), plus `SelectionWarp.tsx`, `DocViewer.tsx`, `ChatFocus.tsx`, `CourseContextStrip.tsx`, `AnchorCard.tsx`, `CollapseSection.tsx`. The 6 component files need their `<style>` either scoped via `styled-jsx scoped` or moved to `globals-v2.css`.

### Rule 10 (no new font-size / color / spacing outside the system)
458 font-size + 153 spacing + ~50 hex literals. Tracked above.

---

## 7. Migration suggestions per major surface

### `app/loom-render/capture/page.tsx` (Reader path, 2591 lines, large)
**Current.** Five inline `<style jsx>` blocks (~700 lines of CSS), bespoke per-element font-size/padding, custom IntersectionObserver scroll-spy, three `position:fixed` toolbars, hero-image extraction logic, markdown-to-HTML transform.
**Replace with.** `<LayoutArticle>` (prose) + `<LayoutGallery>` (image-heavy) + `<MediaFrame>` for `<img>/<iframe>`. CSS goes to `globals-v2.css` capture path. IntersectionObserver wrapped in a `useThrottledActiveSection(slugs)` hook with 1Hz hysteresis.
**Tricky.** First-image hero promotion logic + Mermaid + Pyodide + KaTeX integration each rely on raw `dangerouslySetInnerHTML`; need a content-render contract that survives token migration. Drop-cap on first `<p>` already in spec for Article — verify CSS lives in primitive, not surface.

### `app/loom-render/captures/page.tsx` (Index, 2153 lines, large)
**Current.** Sticky pivot bar with `backdrop-filter` (constitutional rule 1 violation), nested chip/sub-chip pivot (`anchor` / `domain` / `tag`), 5 hardcoded category color tuples (lines 76-84) using `color-mix` over arbitrary bronzes, hover `translateY(-1px)` (rule 3), `position:fixed` bulk-action bar.
**Replace with.** `<LayoutIndex>` (section-grouped collapse list with pivot bar). Pivot bar becomes a primitive `<PivotBar items=...>` that uses `var(--paper)` solid bg + `box-shadow` instead of blur. Category colors collapse onto the 6 `--tint-*` semantic tokens (rose/sage/indigo/plum/umber/ochre).
**Tricky.** localStorage-driven star/tags/progress/last-visited state stays as-is; pure UI rebuild. Search debounce + `selectMode` keyboard shortcuts must survive.

### `app/loom-render/snapshot/page.tsx` (Snapshot, 2156 lines, large)
**Current.** 6 `backdrop-filter` sites, 5 `position:fixed`, hover `transform: scale(1.08)` on annotation pin (rule 3), inline `var(--mat-thin-bg, #e8dec4)` fallback hex throughout, sticky toolbar + side-by-side splitter + chain-by-tag chip set.
**Replace with.** `<LayoutSnapshot>` (full-width iframe + sticky toolbar strip). Toolbar uses solid `var(--paper)` + 0.5px `var(--hair)`. Pin hover changes `border-color`, not `transform`. Annotation drawer drops `backdrop-filter` for solid bg.
**Tricky.** Side-by-side reader split has its own scroll logic + scroll-lock + chain-scope persistence. Verify scroll stays smooth under solid-bg replacement of blurred sticky elements.

### `macos-app/Loom/Sources/LoomMinimalRootView.swift` (1044 lines, medium)
**Current.** Sidebar via ScrollView+LazyVStack (already follows chrome-constraints rule). Mostly font(.system, size: ...) and `.padding(...)` literals.
**Replace with.** Swift `LoomDS.Stack(gap: .md)` + `LoomDS.Display(.l1)` + `LoomDS.Eyebrow()` calls. Use `LoomTokens.dsPaper` (already exists), `LoomTokens.dsThread` for accent.
**Tricky.** Memory `feedback_loom_chrome_constraints` says ONE toolbar auto-injected — do not touch toolbar plumbing. Sidebar must retain ScrollView+LazyVStack.

### `macos-app/Loom/Sources/CapturesView.swift` → `WebCaptureSetupView` (lines 997-1429)
**Current.** Card-based setup UI with `Color.secondary.opacity(0.05/.08/.12/.18/.45)` hairlines + selection states, 56 font(.system) calls, embedded WebKit gradient `#4a7eff→#335eea` (extension button — keep literal).
**Replace with.** `LoomDS.Surface(tone: .card)` + `LoomDS.HairlineRule()` for separators. Selection state uses `LoomTokens.threadMuted` instead of `Color.accentColor.opacity(0.45)`.
**Tricky.** Many of the `.opacity(...)` hairline values are visually-tuned for cards-on-paper; do diff visual before/after. The `#4a7eff` gradient is injected into a webview as part of an extension button — leave alone.

### `macos-app/Loom/Sources/CaptureSheet.swift` (2164 lines, large)
**Current.** 12 `Color.secondary.opacity` hairline literals, 69 `font(.system)` size literals, complex review-flow chrome.
**Replace with.** Same primitives as WebCaptureSetupView. Hairlines all become `LoomTokens.dsHair`.
**Tricky.** Review-before-save flow must not change behavior; pure visual sweep.

### `macos-app/Loom/Sources/ContentView.swift` (3524 lines, large)
**Current.** **Embedded JavaScript palette** at lines 1532-1545 (dark + light variants) and `["#9E7C3E", "#8F4646", ...]` palette at line 2223 — these are JS-source strings injected into the webview and are the de facto palette duplicate.
**Replace with.** Move palette out to a generated `LoomDesignSystem.swift` exporting both `LoomTokens.swift` Swift API + the JS string blob via `LoomDesignSystem.injectionScript`. Source of truth is one place.
**Tricky.** Webview script injection ordering — palette must arrive before any rendering. Check tonight's `LoomTokens.cssInjectionScript` (line 201) — same machinery; this is the right pattern to extend.

### `components/CourseContextStrip.tsx` (894 lines, medium)
**Current.** Inline `<style>` block (~150 lines), 1 hardcoded `#a3433a` red, var-fallback chains. Provides the syllabus-fallback hint and folder-fallback eyebrow.
**Replace with.** Move CSS to `globals-v2.css` `.course-context-strip` namespace. Red collapses to `var(--alert)`.
**Tricky.** This file is load-bearing per memory `project_loom_ingest_extractor_plan` — verify visual identical post-migration.

---

## 8. Quick wins (under 30 min total)

These are mechanical replacements that improve consistency tonight, before night 2:

1. **`app/loom-render/captures/page.tsx:1554-1556`** — replace 3x `#c44` with `var(--alert, #C44)` so once `--alert` lands tonight, this site updates automatically. (~2 min)
2. **`app/loom-render/captures/page.tsx:1218,1314-1316`** — same `#c44` collapse for delete-confirm UI. (~2 min)
3. **`components/SelectionEditToolbar.tsx:411`**, **`SourceCorrectModal.tsx:138,160`**, **`SourceCorrectionsBadge.tsx:247,288`** — 5 sites of `var(--tint-red, #c94a4a)` — pin tonight's `--alert` token to these var fallbacks. (~3 min)
4. **`components/RehearseThisButton.tsx:94,96`** — 2 sites of `var(--danger, #c33)` — fold into single `--alert` source. (~1 min)
5. **`components/DocViewer.tsx:214,218,219`** — 3 traffic-light hex (`#ff5f57`/`#febc2e`/`#28c840`) — extract to `--macos-traffic-{red,yellow,green}` const, leave values literal. (~3 min)
6. **`macos-app/Loom/Sources/LoomFolderHomeView.swift:1023,1977`**, **`CapturesView.swift:528,680`**, **`CaptureSheet.swift:1612,1698,1957`** — 6 instances of `Color.secondary.opacity(0.05)` or `.opacity(0.06)` collapse to single `LoomTokens.dsHairFaint`. (~5 min)
7. **`macos-app/Loom/Sources/CapturesView.swift:565,684`**, **`SourceFileView.swift:257,294`**, **`CaptureSheet.swift:1995,2054`** — 6 `Color.secondary.opacity(0.18-0.25)` stroke literals → `LoomTokens.dsHair`. (~5 min)
8. **`app/loom-render/snapshot/page.tsx:1745`** — `#b04030` literal → `var(--alert)`. (~30 sec)
9. **`app/loom-render/captures/page.tsx:986`**, **`snapshot/page.tsx:1702`**, **`capture/page.tsx:1800`** — comment out the 3 hover violations with `/* TODO night-2: remove transform/box-shadow on hover */`, dropping them disables 3 layout-shift sources immediately. (~3 min)
10. **`app/loom-render/captures/page.tsx:701-706, 1137-1138, 1519-1520`** — comment out the 4 `backdrop-filter` lines on sticky/fixed elements; sticky bar already lost its `stuck` class so visual will be solid bronze + hairline, which is cheaper AND closer to spec. (~2 min)
11. **`app/loom-render/snapshot/page.tsx:506-507, 1298-1299, 1505-1506, 1761-1762, 1944-1945, 1990-1991`** — same blur-strip across 6 sites. (~3 min)

**Total:** ~30 min, zero new file creation, zero behavior change risk, and sets nights 2-4 up for clean primitive substitution rather than fighting tech debt.

---

## Audit headline

The deepest pre-existing pain isn't quantity (459 font-sizes is daunting but mechanical). It's the **9 backdrop-filter sites on sticky/fixed elements**, the **3 hover-state layout-shifters**, and the **1 IntersectionObserver→setState** in capture/page.tsx that mirror exactly the bug pattern that triggered this whole rebuild. Quick wins #9-11 alone defang those landmines tonight without waiting for the primitive layer.

The five duplicate "bronze accents" identified in the plan are confirmed in code — `#9E7C3E` (LoomCursor + ContentView light + NeuralNet button + palette[0]) ≠ `#C4A468` (LoomTokens canonical) ≠ `#B98E3F` (GradientDescent + BPETokenizer) ≠ `#8c6a3f` (improvised in captures pivot palette) ≠ `#a36a3a` (snapshot pin highlight area). All five must collapse onto `LoomTokens.dsThread = #C4A468` + `LoomTokens.threadMuted` with one accent-text variant for light mode.

Embedded-JS-palette duplication in `ContentView.swift:1532-1545` is a quietly load-bearing hazard — fixing this needs a single source-of-truth export, not just a sed.
