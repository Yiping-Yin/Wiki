import SystemAtlasClient from '../SystemAtlasClient';

// M14 — SystemAtlas. The whole Loom product on one sheet.
//
// A reader's map of the whole system: three vertical bands flowing
// left-to-right — Reader UI (what opens on the desk), The Loom (engines
// that never speak unless asked), and Sanctuary (what the library never
// overwrites). Faint quadratic curves connect adjacent bands' nodes to
// suggest data flow without demanding attention.
//
// Not a feature list. A philosophy of mind made navigable. Reached by
// ⌘K Shuttle → "System".
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-atlas.jsx → SystemAtlasSurface
//   /Users/yinyiping/Downloads/Wiki Logo/loom-diagrams.jsx (architecture diagram)

export const metadata = { title: 'System · Loom' };

export default function SystemPage() {
  return <SystemAtlasClient />;
}
