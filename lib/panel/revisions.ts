'use client';

import type { Panel, PanelRevision } from './types';

export function panelRevisionLabel(panel: { revisions: Array<unknown> }) {
  return panel.revisions.length > 1 ? 'revised' : null;
}

export function panelRevisionCount(panel: { revisions: Array<unknown> }) {
  return Math.max(0, panel.revisions.length - 1);
}

function uniqueLines(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function revisionChanges(current: PanelRevision, previous?: PanelRevision | null) {
  if (!previous) {
    return {
      summaryChanged: true,
      centralClaimChanged: true,
      addedDistinctions: uniqueLines(current.keyDistinctions),
      removedDistinctions: [],
      addedTensions: uniqueLines(current.openTensions),
      removedTensions: [],
    };
  }

  const previousDistinctions = new Set(uniqueLines(previous.keyDistinctions));
  const currentDistinctions = new Set(uniqueLines(current.keyDistinctions));
  const previousTensions = new Set(uniqueLines(previous.openTensions));
  const currentTensions = new Set(uniqueLines(current.openTensions));

  return {
    summaryChanged: current.summary !== previous.summary,
    centralClaimChanged: current.centralClaim !== previous.centralClaim,
    addedDistinctions: Array.from(currentDistinctions).filter((item) => !previousDistinctions.has(item)),
    removedDistinctions: Array.from(previousDistinctions).filter((item) => !currentDistinctions.has(item)),
    addedTensions: Array.from(currentTensions).filter((item) => !previousTensions.has(item)),
    removedTensions: Array.from(previousTensions).filter((item) => !currentTensions.has(item)),
  };
}

export function sortedPanelRevisions(panel: Pick<Panel, 'revisions'>) {
  return [...panel.revisions].sort((a, b) => b.at - a.at);
}
