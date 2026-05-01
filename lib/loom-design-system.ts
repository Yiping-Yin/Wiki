/**
 * Loom Design System v1.0 — Canonical Token Source
 * ==================================================
 *
 * Filed: 2026-04-28 (Night 1 of 4-night migration)
 * Spec:  /Users/yinyiping/Desktop/LOOM/plans/loom-design-system-v1.md
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH for every visual token in Loom.
 * Any hex, font-size, spacing, motion, radius, or shadow value used in any
 * other file (TS / TSX / CSS / Swift mirror) MUST come from here.
 *
 * Discipline (per the plan's Constitutional rules §10):
 *   - No hardcoded hex anywhere outside this file (or its CSS twin
 *     `app/globals-v2.css`).
 *   - No font-size / spacing / motion / radius literal outside the scales
 *     defined here.
 *   - If a surface needs a value that isn't here, ADD it to the scale —
 *     don't hardcode at the call site.
 *
 * Companion files:
 *   - app/globals-v2.css            — CSS custom-property mirror
 *   - macos-app/Loom/.../LoomTokens.swift — Swift mirror (agent C owns)
 *
 * Light-mode equivalents are deferred to night 4 (open question #1 in the
 * plan). For now: dark only.
 */

// ---------------------------------------------------------------------------
// Colors — 11 base tokens + 4 semantic state tokens (with muted variants)
// ---------------------------------------------------------------------------

export const color = {
  /** Root background — deepest paper layer */
  paperDeep: '#1A1815',
  /** One layer up from root */
  paper: '#221E18',
  /** Two layers up — surfaces, headers */
  paperUp: '#2B2620',
  /** Three layers up — cards, popovers */
  paperCard: '#332E27',

  /** Primary body text */
  ink1: '#E8E0CE',
  /** Secondary / metadata */
  ink2: '#B9AE93',
  /** Muted / chrome */
  ink3: '#8F8571',

  /** Default 0.5px hairline */
  hair: 'rgba(232, 224, 206, 0.10)',
  /** Even fainter hairline (e.g. inner divisions) */
  hairFaint: 'rgba(232, 224, 206, 0.05)',

  /** Single bronze accent — no variations */
  thread: '#C4A468',
  /** Muted bronze for secondary accents */
  threadMuted: 'rgba(196, 164, 104, 0.55)',

  // Categorical tint family — added 2026-04-30.
  // These are NOT state colors. They are categorical / palette colors
  // used when a surface needs to differentiate items by identity (e.g.
  // BPETokenizer per-token coloring, NeuralNetCanvas per-class connection
  // strokes). For destructive / success / info / caution states, use the
  // semantic-state tokens below (alert / success / info / warning).
  // Migration inventory at plans/design-system-migration-inventory.md
  // §1 "Tint family (categorical, only allowed via Loom palette)" maps
  // existing improvised hexes to these canonical values.

  /** Categorical · sage (cool green). */
  tintSage: '#5C6E4E',
  /** Categorical · sage · 55% alpha. */
  tintSageMuted: 'rgba(92, 110, 78, 0.55)',

  /** Categorical · plum (muted purple). */
  tintPlum: '#5E3D5C',
  /** Categorical · plum · 55% alpha. */
  tintPlumMuted: 'rgba(94, 61, 92, 0.55)',

  /** Categorical · indigo (deep blue). */
  tintIndigo: '#3A477A',
  /** Categorical · indigo · 55% alpha. */
  tintIndigoMuted: 'rgba(58, 71, 122, 0.55)',

  /** Categorical · umber (warm brown). */
  tintUmber: '#5C3F2A',
  /** Categorical · umber · 55% alpha. */
  tintUmberMuted: 'rgba(92, 63, 42, 0.55)',

  /** Categorical · rose (warm red). Distinct from `alert`: rose is
   *  identity-coloring, alert is destructive-state communication. */
  tintRose: '#8F4646',
  /** Categorical · rose · 55% alpha. */
  tintRoseMuted: 'rgba(143, 70, 70, 0.55)',

  // Semantic state colors — added 2026-04-27.
  // These cover destructive / success / info / caution states. The
  // canonical rule from the plan is "no other hex anywhere"; these
  // tokens are the sanctioned exits for state communication. Don't
  // re-introduce ad-hoc `#c44` / `Color.red` etc. — pick one of
  // these four (or their muted variants) instead.

  /** Destructive — red. Delete / cancel / error states. */
  alert: '#C44743',
  /** Destructive · 55% alpha for de-emphasised state. */
  alertMuted: 'rgba(196, 71, 67, 0.55)',

  /** Positive — sage. Confirmations, complete states. */
  success: '#6A8C5A',
  /** Positive · 55% alpha for de-emphasised state. */
  successMuted: 'rgba(106, 140, 90, 0.55)',

  /** Neutral informational tints — ink-blue. */
  info: '#5A7A9A',
  /** Info · 55% alpha for de-emphasised state. */
  infoMuted: 'rgba(90, 122, 154, 0.55)',

  /** Caution — warm amber, distinct from bronze accent. */
  warning: '#B98E3F',
  /** Caution · 55% alpha for de-emphasised state. */
  warningMuted: 'rgba(185, 142, 63, 0.55)',
} as const;

// ---------------------------------------------------------------------------
// Typography — 7 levels, 3 families
// ---------------------------------------------------------------------------

export const fontFamily = {
  serif: '"Charter", "Iowan Old Style", "Source Serif", Georgia, serif',
  display: '"EB Garamond", "Cormorant Garamond", "Charter", serif',
  mono: '"IBM Plex Mono", "JetBrains Mono", "SF Mono", monospace',
} as const;

export const type = {
  display1: { font: 'display', size: '32px', lineHeight: 1.15, weight: 400, italic: true },
  display2: { font: 'display', size: '22px', lineHeight: 1.20, weight: 500, italic: true },
  display3: { font: 'display', size: '16px', lineHeight: 1.30, weight: 500, italic: true },
  body:     { font: 'serif',   size: '16px', lineHeight: 1.62, weight: 400, italic: false },
  caption:  { font: 'serif',   size: '13px', lineHeight: 1.45, weight: 400, italic: true },
  eyebrow:  { font: 'serif',   size: '11px', lineHeight: 1.00, weight: 500, italic: false, smallCaps: true, tracking: '0.16em' },
  mono:     { font: 'mono',    size: '13px', lineHeight: 1.55, weight: 400, italic: false },
} as const;

// ---------------------------------------------------------------------------
// Spacing — 8pt grid, 6 values
// ---------------------------------------------------------------------------

export const space = {
  xs: '0.25rem',  // 4
  sm: '0.5rem',   // 8
  md: '1rem',     // 16
  lg: '1.5rem',   // 24
  xl: '2.5rem',   // 40
  '2xl': '4rem',  // 64
} as const;

// ---------------------------------------------------------------------------
// Motion — 3 durations, 1 easing
// ---------------------------------------------------------------------------

export const motion = {
  fast: '140ms ease-out',
  normal: '220ms ease-out',
  slow: '400ms ease-out',
} as const;

// ---------------------------------------------------------------------------
// Radius — 3 values
// ---------------------------------------------------------------------------

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
} as const;

// ---------------------------------------------------------------------------
// Shadow — 2 layers, paper-aware
// ---------------------------------------------------------------------------

export const shadow = {
  sm: '0 1px 2px color-mix(in srgb, #1A1815 60%, transparent)',
  md: '0 6px 22px color-mix(in srgb, #1A1815 40%, transparent)',
} as const;

// ---------------------------------------------------------------------------
// Hairline — 1 line style only
// ---------------------------------------------------------------------------

export const hairline = '0.5px solid rgba(232, 224, 206, 0.10)';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

export type ColorToken = keyof typeof color;
export type FontFamilyToken = keyof typeof fontFamily;
export type TypeToken = keyof typeof type;
export type SpaceToken = keyof typeof space;
export type MotionToken = keyof typeof motion;
export type RadiusToken = keyof typeof radius;
export type ShadowToken = keyof typeof shadow;
