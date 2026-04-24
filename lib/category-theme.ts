/**
 * category-theme · deterministic accent color per knowledge category.
 *
 * LLM Wiki's ChapterShell hand-picks a color per section (Start=blue,
 * Foundations=orange, etc.) — this gives the library visual identity. For
 * user-imported knowledge categories we can't hand-pick, but we CAN hash
 * the slug into a curated palette so each course/collection gets a stable
 * color the user learns to associate with it.
 *
 * The palette mirrors Apple system tints so it sits next to the wiki's
 * theming without fighting it.
 */

const PALETTE = [
  { accent: 'var(--tint-blue)',   accentSoft: 'color-mix(in srgb, var(--tint-blue) 14%, transparent)' },
  { accent: 'var(--tint-orange)', accentSoft: 'color-mix(in srgb, var(--tint-orange) 14%, transparent)' },
  { accent: 'var(--tint-purple)', accentSoft: 'color-mix(in srgb, var(--tint-purple) 14%, transparent)' },
  { accent: 'var(--tint-green)',  accentSoft: 'color-mix(in srgb, var(--tint-green) 14%, transparent)' },
  { accent: 'var(--tint-pink)',   accentSoft: 'color-mix(in srgb, var(--tint-pink) 14%, transparent)' },
  { accent: 'var(--tint-teal)',   accentSoft: 'color-mix(in srgb, var(--tint-teal) 14%, transparent)' },
  { accent: 'var(--tint-yellow)', accentSoft: 'color-mix(in srgb, var(--tint-yellow) 14%, transparent)' },
  { accent: 'var(--tint-indigo)', accentSoft: 'color-mix(in srgb, var(--tint-indigo) 14%, transparent)' },
  { accent: 'var(--tint-cyan)',   accentSoft: 'color-mix(in srgb, var(--tint-cyan) 14%, transparent)' },
  { accent: 'var(--tint-mint)',   accentSoft: 'color-mix(in srgb, var(--tint-mint) 14%, transparent)' },
];

export type CategoryTheme = {
  accent: string;
  accentSoft: string;
};

/** FNV-1a hash — stable, fast, good-enough distribution for a small palette. */
function hashSlug(slug: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i += 1) {
    h ^= slug.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

export function categoryTheme(slug: string): CategoryTheme {
  if (!slug) return PALETTE[0];
  const idx = hashSlug(slug) % PALETTE.length;
  return PALETTE[idx];
}
