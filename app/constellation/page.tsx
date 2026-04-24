import { ConstellationClient } from '../ConstellationClient';

// M16 — Constellation. Day-mode companion to /weaves.
//
// Where /weaves is night + a single bronze-haloed panel, /constellation
// is paper + three basins forming (hot · warm · cool). A wider, calmer
// view: the moment a cluster of thoughts is starting to have gravity
// but hasn't yet collapsed into a panel.
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-constellation.jsx
//     → ConstellationSurface (basins, isoclines, cross-basin bridges).

export const metadata = {
  title: 'Constellation · Loom',
};

export default function Page() {
  return <ConstellationClient />;
}
