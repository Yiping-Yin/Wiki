'use client';

import type { Panel } from '../panel/types';
import type { Weave, WeaveContractSource, WeaveEvidence, WeaveKind, WeaveRevision, WeaveStatus } from './types';

type WeaveContractInput = {
  fromPanel: Panel;
  toPanel: Panel;
  evidence: WeaveEvidence[];
  status: WeaveStatus;
  kind?: WeaveKind;
};

function kindVerbClause(kind: WeaveKind | undefined): { verb: string; suffix: string } {
  switch (kind) {
    case 'supports': return { verb: 'supports', suffix: 'with compatible evidence.' };
    case 'refines': return { verb: 'refines', suffix: 'as a more precise statement.' };
    case 'contradicts': return { verb: 'contradicts', suffix: 'on a core claim.' };
    case 'depends-on': return { verb: 'depends on', suffix: 'as a prerequisite.' };
    case 'references':
    default: return { verb: 'points to', suffix: 'as part of the same weave.' };
  }
}

const SUGGESTED_STATUS_TENSION = 'This relation is still only suggested.';

function uniqueLines(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

export function buildWeaveContract(input: WeaveContractInput) {
  const { fromPanel, toPanel, evidence, status, kind } = input;
  const primarySnippet = evidence[0]?.snippet ?? '';
  const { verb, suffix } = kindVerbClause(kind);
  const claim = `${fromPanel.title} ${verb} ${toPanel.title} ${suffix}`;

  const whyItHolds = primarySnippet
    ? primarySnippet
    : `${fromPanel.title} ${verb} ${toPanel.title}.`;

  const tensions = uniqueLines([
    status === 'suggested' ? SUGGESTED_STATUS_TENSION : '',
    evidence.length <= 1 ? 'Only one explicit evidence thread currently supports this relation.' : '',
    fromPanel.status === 'contested' ? `Source panel "${fromPanel.title}" is still contested.` : '',
    toPanel.status === 'contested' ? `Target panel "${toPanel.title}" is still contested.` : '',
  ]).slice(0, 3);

  return {
    claim,
    whyItHolds,
    openTensions: tensions,
  };
}

export function syncWeaveContractStatus(
  weave: Pick<Weave, 'claim' | 'whyItHolds' | 'openTensions'>,
  status: WeaveStatus,
) {
  const baseTensions = weave.openTensions.filter((item) => item !== SUGGESTED_STATUS_TENSION);
  const openTensions = status === 'suggested'
    ? uniqueLines([SUGGESTED_STATUS_TENSION, ...baseTensions])
    : uniqueLines(baseTensions);

  return {
    claim: weave.claim,
    whyItHolds: weave.whyItHolds,
    openTensions,
  };
}

function sameRevision(a: WeaveRevision, b: WeaveRevision) {
  return a.claim === b.claim
    && a.whyItHolds === b.whyItHolds
    && JSON.stringify(a.openTensions) === JSON.stringify(b.openTensions);
}

export function applyWeaveContract(
  weave: Omit<Weave, 'claim' | 'whyItHolds' | 'openTensions' | 'contractSource' | 'contractUpdatedAt' | 'revisions'> & Partial<Pick<Weave, 'contractSource' | 'contractUpdatedAt' | 'revisions'>>,
  contract: ReturnType<typeof buildWeaveContract>,
  at: number,
  contractSource: WeaveContractSource,
): Weave {
  const nextRevision: WeaveRevision = {
    at,
    claim: contract.claim,
    whyItHolds: contract.whyItHolds,
    openTensions: contract.openTensions,
  };
  const revisions = [...(weave.revisions ?? [])];
  const lastRevision = revisions.at(-1);
  if (!lastRevision || !sameRevision(lastRevision, nextRevision)) {
    revisions.push(nextRevision);
  }

  return {
    ...weave,
    ...contract,
    contractSource,
    contractUpdatedAt: at,
    revisions,
  };
}
