'use client';

import type { Panel } from './types';
import type { Trace } from '../trace/types';

function stableParts(parts: string[]) {
  return parts.sort().join('|');
}

export function panelTraceSignature(traces: Trace[]): string {
  const relevant = traces
    .filter((trace) => trace.kind === 'reading' && !trace.parentId && trace.source?.docId)
    .map((trace) => `${trace.id}:${trace.updatedAt}:${trace.events.length}:${trace.crystallizedAt ?? 0}`);
  return stableParts(relevant);
}

export function panelRecordSignature(panel: Panel | null | undefined): string {
  if (!panel) return 'none';
  return [
    panel.id,
    panel.docId,
    panel.status,
    String(panel.updatedAt),
    String(panel.contractUpdatedAt),
    String(panel.crystallizedAt),
    String(panel.sections.length),
    String(panel.revisions.length),
    panel.summary,
  ].join(':');
}
