'use client';

export type WeaveKind = 'references';
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
