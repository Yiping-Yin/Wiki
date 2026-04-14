'use client';

export type WeaveKind = 'references';
export type WeaveStatus = 'suggested' | 'confirmed' | 'rejected';

export type WeaveEvidence = {
  anchorId?: string;
  snippet: string;
  at: number;
};

export type Weave = {
  id: string;
  fromPanelId: string;
  toPanelId: string;
  kind: WeaveKind;
  status: WeaveStatus;
  evidence: WeaveEvidence[];
  createdAt: number;
  updatedAt: number;
};

export function newWeaveId(fromPanelId: string, toPanelId: string, kind: WeaveKind = 'references') {
  return `wv_${kind}_${fromPanelId.replace(/[^\w-]+/g, '_')}__${toPanelId.replace(/[^\w-]+/g, '_')}`;
}
