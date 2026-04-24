import { BranchingClient } from '../BranchingClient';

// M16 — Branching. Argument as a tree.
//
// A thesis at the top, with supports radiating left (solid) and counters
// right (dashed). Each support holds 2 sub-supports. Cleaner than the
// multi-direction reference — this is the pared-down page version.
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-thinking.jsx
//     → BranchingSurface.

export const metadata = {
  title: 'Branching · Loom',
};

export default function Page() {
  return <BranchingClient />;
}
