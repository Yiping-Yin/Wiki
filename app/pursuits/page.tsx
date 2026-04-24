import PursuitsClient from '../PursuitsClient';

// M9 — Pursuits. Loom's top-level mind-object: questions the mind is holding.
//
// Not a library of books. Not a folder of notes. The top-level is the
// *question* a mind refuses to put down. Each pursuit has a season
// (active · waiting · held · retired · contradicted), a weight (how
// present it is in attention right now), and gathers sources + panels
// into itself over time.
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-pursuits.jsx → PursuitsSurface
//
// Runtime data arrives through `loom://native/pursuits.json` in the
// macOS shell, with browser-preview fallback only. Empty installs stay
// empty; this route no longer depends on a demo corpus to make the
// layout plausible.

export const metadata = { title: 'Pursuits · Loom' };

export default function PursuitsPage() {
  return <PursuitsClient />;
}
