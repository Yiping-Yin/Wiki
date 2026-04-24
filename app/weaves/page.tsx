import { WeavesClient } from '../WeavesClient';

// M7 — Weaves. Focused knowledge-graph constellation around ONE active Panel.
//
// Not a full-graph view: a quiet, night-palette SVG scene with a single
// bronze-haloed panel at the center, a handful of source nodes orbiting
// it, and one or two echo-related panels upstream. Users reach this by
// clicking a Panel in /patterns or via URL (future: `?focus=<panelId>`
// query param once data is wired from SwiftData + trace).
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-habitat.jsx → GraphSurface
//   /Users/yinyiping/Downloads/Wiki Logo/loom-constellation.jsx
//
// Runtime data arrives through `loom://native/panels.json` and
// `loom://native/weaves.json` in the macOS shell, with browser-preview
// fallback only. When nothing has settled yet, the route now stays
// honestly empty instead of drawing synthetic relations.

export const metadata = {
  title: 'Weaves · Loom',
};

export default function Page() {
  return <WeavesClient />;
}
