'use client';

import type { Panel } from '../panel/types';
import type { Trace } from '../trace/types';

function stableParts(parts: string[]) {
  return parts.sort().join('|');
}

export function weaveInputSignature({
  panels,
  tracesByDocId,
}: {
  panels: Panel[];
  tracesByDocId: Map<string, Trace[]>;
}): string {
  const panelPart = stableParts(
    panels.map((panel) => [
      panel.docId,
      panel.status,
      panel.updatedAt,
      panel.contractUpdatedAt,
      panel.revisions.length,
      panel.latestAnchorId ?? 'none',
      panel.summary,
    ].join(':')),
  );

  const tracePart = stableParts(
    Array.from(tracesByDocId.entries()).map(([docId, traces]) => (
      `${docId}:${stableParts(
        traces.map((trace) => `${trace.id}:${trace.updatedAt}:${trace.events.length}:${trace.crystallizedAt ?? 0}`),
      )}`
    )),
  );

  return `${panelPart}||${tracePart}`;
}
