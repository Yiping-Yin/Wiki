'use client';

import type { ThoughtType } from '../trace/types';
import { initialSrsState } from './srs';
import type { Panel, PanelRevision } from './types';

type PanelContractInput = {
  title: string;
  latestArtifact?: string;
  sections: Array<{
    summary?: string;
    quote?: string;
    thoughtType?: ThoughtType;
  }>;
};

function deriveSummary(text: string): string {
  const first = text
    .split('\n')
    .find((line) => line.trim().length > 0)
    ?.trim() ?? '';
  return first.length > 140 ? `${first.slice(0, 140)}…` : first;
}

export function buildPanelContract(input: PanelContractInput) {
  const fallbackSummary =
    input.sections.find((section) => section.summary?.trim())?.summary
    ?? input.sections.find((section) => section.quote?.trim())?.quote
    ?? input.latestArtifact
    ?? input.title;

  const summary = deriveSummary(fallbackSummary || '');
  const distinctionCandidates = input.sections
    .map((section) => section.summary?.trim() ?? '')
    .filter(Boolean)
    .filter((line) => line !== summary);
  const keyDistinctions = Array.from(new Set(distinctionCandidates)).slice(0, 3);
  const openTensions = Array.from(
    new Set(
      input.sections
        .filter((section) => section.thoughtType === 'question' || section.thoughtType === 'objection' || section.thoughtType === 'hypothesis')
        .map((section) => section.summary?.trim() || section.quote?.trim() || '')
        .filter(Boolean),
    ),
  ).slice(0, 3);

  return {
    summary,
    centralClaim: summary,
    keyDistinctions,
    openTensions,
  };
}

function sameRevision(a: PanelRevision, b: PanelRevision) {
  return a.summary === b.summary
    && a.centralClaim === b.centralClaim
    && JSON.stringify(a.keyDistinctions) === JSON.stringify(b.keyDistinctions)
    && JSON.stringify(a.openTensions) === JSON.stringify(b.openTensions);
}

export function applyCrystallizedContract(
  panel: Panel,
  contract: ReturnType<typeof buildPanelContract>,
  at: number,
): Panel {
  const nextRevision: PanelRevision = {
    at,
    summary: contract.summary,
    centralClaim: contract.centralClaim,
    keyDistinctions: contract.keyDistinctions,
    openTensions: contract.openTensions,
  };
  const revisions = [...(panel.revisions ?? [])];
  const lastRevision = revisions.at(-1);
  if (!lastRevision || !sameRevision(lastRevision, nextRevision)) {
    revisions.push(nextRevision);
  }
  return {
    ...panel,
    ...contract,
    contractSource: 'crystallized',
    contractUpdatedAt: at,
    revisions,
    srs: panel.srs ?? initialSrsState(at),
  };
}
