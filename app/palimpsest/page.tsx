import { PalimpsestClient } from '../PalimpsestClient';

// M16 — Palimpsest. A thought's history, four translucent layers.
//
// Today's thought sits on top at full opacity; three older versions
// fade beneath (0.55 · 0.30 · 0.15) offset down-right, so the reader
// sees how a sentence was reached — not a diff, a geology.
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-thinking.jsx
//     → PalimpsestSurface.

export const metadata = {
  title: 'Palimpsest · Loom',
};

export default function Page() {
  return <PalimpsestClient />;
}
