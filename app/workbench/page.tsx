import WorkbenchClient from '../WorkbenchClient';

export const metadata = { title: 'Workbench · Loom' };

/**
 * /workbench — Writing with the loom visible.
 *
 * The user types into a ruled paper surface; the loom (library, thought
 * map, AI) stays visible in the margin rather than vanishing behind a
 * modal. This simpler first version is a plain draft surface backed by
 * localStorage. Future ticks will wire it to LoomTraceWriter panels and
 * the ambient library pulls.
 */
export default function WorkbenchPage() {
  return <WorkbenchClient />;
}
