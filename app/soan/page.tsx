import SoanClient from '../SoanClient';

export const metadata = { title: 'Sōan · Loom' };

/**
 * /soan — Sōan 草庵 · the thinking draft.
 *
 * A single ruled sheet where cards of every register live at pixel
 * positions, and lines of reasoning draw between them. Unlike Workbench
 * (a single column of prose), Sōan is freeform: a thesis in the middle,
 * instances clustered beneath, counters leaning in, fogs allowed to stay
 * fog, a weft tallying echoes from the library.
 *
 * Cards and edges hydrate from `loom://native/soan.json` in the macOS
 * shell, with browser-preview fallback only. The editing model is still
 * intentionally narrow, but the page no longer depends on a static
 * placeholder board to look alive.
 */
export default function SoanPage() {
  return <SoanClient />;
}
