import AtelierClient from '../AtelierClient';

// M13 — Atelier. Writing across four sources at once.
//
// A long-table composition surface: 2×2 grid of source mini-panes on the
// left, a ruled writing area on the right for composing a synthesis.
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-atelier.jsx → AtelierSurface

export const metadata = { title: 'Atelier · Loom' };

export default function AtelierPage() {
  return <AtelierClient />;
}
