# Loom Design System

**Who this is for**: future agent/dev edits that touch UI. Before writing
another `style={{ padding: '0.5rem 0.9rem', borderRadius: 'var(--r-2)', ... }}`,
check this file. We went through 15+ build cycles in April 2026 to unify
layout, and every ad-hoc inline style risks re-fragmenting it.

## Tokens (see `app/globals.css`)

### Spacing — 4px grid
- `--space-0_5` 2px · `--space-1` 4px · `--space-2` 8px · `--space-3` 12px
- `--space-4` 16px · `--space-5` 20px · `--space-6` 24px · `--space-7` 32px
- `--space-8` 40px · `--space-9` 48px · `--space-10` 64px

Use these in any `padding`, `gap`, `margin`. Don't invent new rem values.

### Type — 7 sizes
- `--fs-caption` 0.68rem — microcopy, timestamps, badges, eyebrow
- `--fs-small` 0.78rem — secondary labels, buttons
- `--fs-body` 0.88rem — body baseline
- `--fs-body-lg` 0.96rem — primary reading text
- `--fs-h3` 1.14rem · `--fs-h2` 1.4rem · `--fs-h1` 1.72rem

Line heights: `--lh-tight` 1.2 · `--lh-snug` 1.35 · `--lh-body` 1.5 · `--lh-relaxed` 1.6

### Motion
- `--dur-1` 120ms (quick) · `--dur-2` 180ms (standard)
- `--dur-3` 260ms (pronounced) · `--dur-4` 400ms (scene)
- `--ease` · `--ease-spring` · `--ease-enter` · `--ease-exit`
- All `--dur-*` multiply `--motion-scale` so Settings > Reduce motion works globally.

### Shape / color
- Radius: `--r-1` 10px · `--r-2` 14px · `--r-3` 18px · `--r-4` 24px
- Accent: `--accent`, `--accent-soft` — per-category themed via `lib/category-theme.ts`
  on knowledge/cowork/category landing pages.

## Primitives (see `components/`)

### `<PageFrame>` — page shell (`components/PageFrame.tsx`)
Every top-level page uses this. Slots: `breadcrumb`, `eyebrow`, `title`,
`description`, `actions`, `children`. Emits a consistent h1 + hairline rule.
Migrated: Today, Atlas, /coworks, Home, Patterns empty, Relations empty, Browse,
Notes, Highlights, Quizzes, Uploads, Help, /dev/principles.

### `<Button tone size destructive busy>` (`components/Button.tsx`)
- Tones: `primary` (solid accent) · `secondary` (outlined) · `ghost` (link-like)
- Sizes: `sm` · `md` · `lg`
- `destructive` flips color to `--tint-red` on any tone
- `busy` disables + shows wait cursor
- One primary per surface. Default to secondary; ghost for cancel/tertiary.

### `<TextInput size>` / `<TextArea size>` (`components/TextInput.tsx`)
- Sizes align with Button: sm / md / lg
- `invalid` prop flips border red
- Focus ring via `.loom-text-input:focus-visible` CSS (accent border + soft fill)
- forwardRef for imperative focus

For the chromeless "hairline underline" search bar pattern (Browse, Uploads),
wrap the input row in a div with `className="loom-inline-search"` instead of
setting `borderBottom` inline. The class handles the focus-within accent
transition so keyboard users get a visible focus target.

### `<Panel tone density>` (`components/Panel.tsx`)
- Tones: `plain` (neutral surface) · `accent` (AI / reflection) · `flat` (no chrome)
- Density: `compact` / `regular`
- Accepts any HTML div attributes (onPaste/onDragOver/etc.)

### `<BreadcrumbHome items>` (`components/PageFrame.tsx`)
- Renders `Home › Category › Current` style breadcrumb

### `<SelectionEditToolbar>` (`components/SelectionEditToolbar.tsx`)
- GPT-style span edit verbs (Tighten / Expand / Rewrite) + Revert + citation popover
- Mounted over a `targetRef` textarea
- Verbs bounded by server protocol (length + citations)

### `<ScanScopePicker>` (`components/ScanScopePicker.tsx`)
- Folder-tree modal for ingest scope selection
- Triggers /api/content-root/scope + /api/ingest

## Naming conventions

- **No metaphor feature names** (see `feedback_no_metaphor_feature_names` memory).
  User-facing labels stay literal: "Queue", "Recently resolved", "Continue where
  you left off." NOT "Quiet surface", "Return paths", "One foreground object".
- Canon metaphors (weave, panel) from early Loom are grandfathered but don't
  introduce new ones.

## Category accent theming

Every page under a knowledge category inherits `--accent` / `--accent-soft`
from `lib/category-theme.ts` (FNV-1a hash → 10-color Apple Tint palette).
Same category = same color across doc reading, category landing, cowork detail.
LLM Wiki already has its own section-based theming via `components/ChapterShell.tsx`.

## Word-like cowork Read view

`.loom-cowork-page-frame` + `.loom-cowork-page` in globals.css give the
cowork Read view a centered 780px "paper page" with serif body, 72/88px
page margins, and a soft drop shadow. Goal: instantly recognizable as a
document (Word / PDF mental model).

## Build infrastructure notes

- `scripts/stage-loom-runtime.mjs` copies `public/` + `standalone/` to the
  runtime dir. Uses `fastCopy` (rsync → /bin/cp -R → fs.cp fallback).
  `fs.cp` on 1000+ small files takes 20 min; rsync 5 seconds.
- `next.config.mjs` sets `webpack.cache = { type: 'memory' }` because
  Spotlight/TimeMachine occasionally vanish `.pack_` files during rename,
  causing 10-min stalls.
- `npm run app:user` can fail if `.next-build/` has partial output from a
  previous kill. `rm -rf .next-build .next-build.lock` then retry.

## When you migrate a new surface

1. Find inline `style={{ padding, borderRadius, border, background }}` → replace with primitive
2. Find ad-hoc button / input → Button / TextInput / TextArea
3. Find "card" with border+bg → Panel tone=plain or accent
4. Find page header (h1 + breadcrumb + actions) → PageFrame
5. Run `npx tsc --noEmit` before build
6. `npm run app:user` — should be < 5 min cold, < 2 min warm

If you touch `app/globals.css`, keep tokens at top — primitives + pages inherit.
