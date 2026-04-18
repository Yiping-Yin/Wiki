'use client';

import type { Weave, WeaveRevision } from './types';

function uniqueLines(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function weaveRevisionLabel(weave: { revisions: Array<unknown> }) {
  return weave.revisions.length > 1 ? 'revised' : null;
}

export function weaveRevisionCount(weave: { revisions: Array<unknown> }) {
  return Math.max(0, weave.revisions.length - 1);
}

export function sortedWeaveRevisions(weave: Pick<Weave, 'revisions'>) {
  return [...weave.revisions].sort((a, b) => b.at - a.at);
}

export function weaveRevisionChanges(current: WeaveRevision, previous?: WeaveRevision | null) {
  if (!previous) {
    return {
      claimChanged: true,
      whyChanged: true,
      addedTensions: uniqueLines(current.openTensions),
      removedTensions: [],
    };
  }

  const previousTensions = new Set(uniqueLines(previous.openTensions));
  const currentTensions = new Set(uniqueLines(current.openTensions));

  return {
    claimChanged: current.claim !== previous.claim,
    whyChanged: current.whyItHolds !== previous.whyItHolds,
    addedTensions: Array.from(currentTensions).filter((item) => !previousTensions.has(item)),
    removedTensions: Array.from(previousTensions).filter((item) => !currentTensions.has(item)),
  };
}

export function buildWeaveRevisionActionSeed(weave: Pick<Weave, 'revisions'>): { seedDraft: string; seedLabel: string } | null {
  const revisions = sortedWeaveRevisions(weave);
  const current = revisions[0];
  const previous = revisions[1];
  if (!current || !previous) return null;

  const changes = weaveRevisionChanges(current, previous);
  const lines = [
    'Work the relation directly, not just one panel around it.',
    '',
    `Current relation: ${current.claim}`,
    '',
    `Why it currently holds: ${current.whyItHolds}`,
  ];

  if (changes.addedTensions.length > 0) {
    lines.push('', 'Open tensions to work through:');
    for (const item of changes.addedTensions) lines.push(`- ${item}`);
  }

  lines.push('', 'Rewrite the relation so it becomes clearer, stronger, or more honest:');

  return {
    seedDraft: lines.join('\n'),
    seedLabel: changes.addedTensions.length > 0 ? 'Work the changed relation' : 'Strengthen the relation',
  };
}
