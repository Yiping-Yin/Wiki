'use client';

import { emitWeaveChange } from './events';
import { weaveStore } from './store';
import { newWeaveId, type Weave, type WeaveEvidence, type WeaveKind } from './types';

type CreateManualWeaveInput = {
  fromPanelId: string;   // docId of source panel
  toPanelId: string;     // docId of target panel
  fromTitle?: string;
  toTitle?: string;
  kind: WeaveKind;
  evidence?: WeaveEvidence[];
  claim?: string;
  whyItHolds?: string;
};

export async function createManualWeave(input: CreateManualWeaveInput): Promise<Weave | null> {
  if (!input.fromPanelId || !input.toPanelId) return null;
  if (input.fromPanelId === input.toPanelId) return null;

  const now = Date.now();
  const id = newWeaveId(input.fromPanelId, input.toPanelId, input.kind);

  const existing = await weaveStore.get(id);
  const fromTitle = input.fromTitle ?? input.fromPanelId;
  const toTitle = input.toTitle ?? input.toPanelId;
  const claim = input.claim ?? `${fromTitle} ${kindVerb(input.kind)} ${toTitle}.`;
  const whyItHolds =
    input.whyItHolds ??
    input.evidence?.[0]?.snippet ??
    `User manually declared this relation as ${input.kind}.`;

  const baseEvidence: WeaveEvidence[] = input.evidence ?? [];

  if (existing) {
    const merged: Weave = {
      ...existing,
      kind: input.kind,
      status: 'confirmed',
      evidence: [...existing.evidence, ...baseEvidence],
      claim,
      whyItHolds,
      contractSource: 'manual',
      contractUpdatedAt: now,
      updatedAt: now,
      revisions: [
        ...existing.revisions,
        { at: now, claim, whyItHolds, openTensions: [] },
      ],
    };
    await weaveStore.put(merged);
    emitWeaveChange({
      docIds: [merged.fromPanelId, merged.toPanelId],
      weaveIds: [merged.id],
      reason: 'manual-create',
    });
    return merged;
  }

  const weave: Weave = {
    id,
    fromPanelId: input.fromPanelId,
    toPanelId: input.toPanelId,
    kind: input.kind,
    status: 'confirmed',
    evidence: baseEvidence,
    claim,
    whyItHolds,
    openTensions: [],
    contractSource: 'manual',
    contractUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
    revisions: [
      { at: now, claim, whyItHolds, openTensions: [] },
    ],
  };

  await weaveStore.put(weave);
  emitWeaveChange({
    docIds: [weave.fromPanelId, weave.toPanelId],
    weaveIds: [weave.id],
    reason: 'manual-create',
  });
  return weave;
}

function kindVerb(kind: WeaveKind): string {
  switch (kind) {
    case 'supports': return 'supports';
    case 'refines': return 'refines';
    case 'contradicts': return 'contradicts';
    case 'depends-on': return 'depends on';
    case 'references':
    default: return 'references';
  }
}
