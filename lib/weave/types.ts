'use client';

export type WeaveKind =
  | 'references'      // A mentions B without a specific relation
  | 'supports'        // A backs up B's claim with evidence or reasoning
  | 'refines'         // A is a more precise or specific version of B
  | 'contradicts'     // A contests or refutes B
  | 'depends-on';     // A's claim presupposes or requires B

export const WEAVE_KINDS: WeaveKind[] = [
  'references',
  'supports',
  'refines',
  'contradicts',
  'depends-on',
];

export function weaveKindLabel(kind: WeaveKind): string {
  switch (kind) {
    case 'supports': return 'supports';
    case 'refines': return 'refines';
    case 'contradicts': return 'contradicts';
    case 'depends-on': return 'depends on';
    case 'references':
    default: return 'references';
  }
}

export type WeaveStatus = 'suggested' | 'confirmed' | 'rejected';
export type WeaveContractSource = 'derived' | 'confirmed' | 'manual';

export type WeaveEvidence = {
  anchorId?: string;
  snippet: string;
  at: number;
};

export type WeaveRevision = {
  at: number;
  claim: string;
  whyItHolds: string;
  openTensions: string[];
};

export type Weave = {
  id: string;
  fromPanelId: string;
  toPanelId: string;
  kind: WeaveKind;
  status: WeaveStatus;
  evidence: WeaveEvidence[];
  claim: string;
  whyItHolds: string;
  openTensions: string[];
  contractSource: WeaveContractSource;
  contractUpdatedAt: number;
  revisions: WeaveRevision[];
  createdAt: number;
  updatedAt: number;
};

export function newWeaveId(fromPanelId: string, toPanelId: string, kind: WeaveKind = 'references') {
  return `wv_${kind}_${fromPanelId.replace(/[^\w-]+/g, '_')}__${toPanelId.replace(/[^\w-]+/g, '_')}`;
}
