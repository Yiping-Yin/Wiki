import PatternsClient from '../PatternsClient';

// M8 — Patterns habitat (kesi mosaic of held panels).
//
// The /patterns habitat surface: crystallized panels as a woven-block
// grid, rendered as paper tiles with a colored top band, Cormorant
// italic titles, and a muted kesi mini-weave in the lower corner.
//
// Layout is deliberately asymmetric — 1.4fr / 1fr / 1fr / 1.2fr across
// two rows, with "big" tiles spanning both rows. It's a finished-work
// wall, not a feed. Panels ripen; they do not pile up.
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-habitat.jsx → PatternsSurface
//
// Runtime data arrives through `loom://native/panels.json` in the macOS
// shell, with browser-preview fallback only. Empty installs therefore
// stay empty instead of rendering a seeded wall of fake held panels.

export const metadata = { title: 'Patterns · Loom' };

export default function PatternsPage() {
  return <PatternsClient />;
}
