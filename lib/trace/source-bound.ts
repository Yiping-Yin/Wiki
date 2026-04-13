'use client';

import type { Trace, TraceEvent } from './types';
import { traceStore } from './store';

const CHANGE_EVENT = 'loom:trace:changed';

function emitChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export async function ensureReadingTrace(input: {
  docId: string;
  href: string;
  sourceTitle: string;
}): Promise<Trace> {
  const existing = (await traceStore.getByDoc(input.docId))
    .filter((t) => t.kind === 'reading' && !t.parentId)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.events.length - a.events.length || a.createdAt - b.createdAt);
  if (existing[0]) return existing[0];

  const created = await traceStore.create({
    kind: 'reading',
    title: input.sourceTitle,
    source: {
      docId: input.docId,
      href: input.href,
      sourceTitle: input.sourceTitle,
    },
    initialEvents: [],
  });
  emitChange();
  return created;
}

export async function appendEventForDoc(
  input: { docId: string; href: string; sourceTitle: string },
  event: TraceEvent,
): Promise<Trace | null> {
  const trace = await ensureReadingTrace(input);
  const updated = await traceStore.appendEvent(trace.id, event);
  emitChange();
  return updated;
}

export function latestVisitAt(trace: Trace): number {
  let at = 0;
  for (const e of trace.events) {
    if (e.kind === 'visit' && e.at > at) at = e.at;
  }
  return at || trace.updatedAt || trace.createdAt;
}

export function latestHighlights(trace: Trace) {
  return trace.events
    .filter((e): e is Extract<typeof e, { kind: 'highlight' }> => e.kind === 'highlight')
    .sort((a, b) => b.at - a.at);
}
