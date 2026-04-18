'use client';

import type { Panel } from './types';

function uniqueLines(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function buildRevisionActionSeed(panel: Panel): { seedDraft: string; seedLabel: string } | null {
  const revisions = [...panel.revisions].sort((a, b) => b.at - a.at);
  const current = revisions[0];
  const previous = revisions[1];
  if (!current || !previous) return null;

  const previousDistinctions = new Set(uniqueLines(previous.keyDistinctions));
  const currentDistinctions = new Set(uniqueLines(current.keyDistinctions));
  const previousTensions = new Set(uniqueLines(previous.openTensions));
  const currentTensions = new Set(uniqueLines(current.openTensions));

  const addedDistinctions = Array.from(currentDistinctions).filter((item) => !previousDistinctions.has(item));
  const addedTensions = Array.from(currentTensions).filter((item) => !previousTensions.has(item));

  const lines = [
    'Work the change directly, not the whole panel again.',
    '',
    `Current summary: ${current.summary}`,
  ];

  if (current.centralClaim && current.centralClaim !== current.summary) {
    lines.push('', `Current claim: ${current.centralClaim}`);
  }
  if (addedDistinctions.length > 0) {
    lines.push('', 'New distinctions to hold:');
    for (const item of addedDistinctions) lines.push(`- ${item}`);
  }
  if (addedTensions.length > 0) {
    lines.push('', 'Open tensions to work through:');
    for (const item of addedTensions) lines.push(`- ${item}`);
  }
  lines.push('', 'Rewrite or deepen this changed edge in your own words:');

  return {
    seedDraft: lines.join('\n'),
    seedLabel: addedTensions.length > 0 ? 'Work the changed tension' : 'Rework the revised claim',
  };
}
