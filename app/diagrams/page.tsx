import DiagramsClient from '../DiagramsClient';

// M15 — Diagrams. Five ways to draw a thought.
//
// A single surface that holds five switchable diagram modes: argument,
// model, architecture, decision, state. Each mode is a thinking surface,
// not a decoration — it renders a different *shape* the thought can
// take. A left rail lets the user step between modes; the main canvas
// shows a clean, minimal SVG for whichever is active.
//
// Reached via ⌘K Shuttle → "Diagrams".
//
// Design reference:
//   /Users/yinyiping/Downloads/Wiki Logo/loom-diagrams.jsx → DiagramsSurface

export const metadata = { title: 'Diagrams · Loom' };

export default function DiagramsPage() {
  return <DiagramsClient />;
}
