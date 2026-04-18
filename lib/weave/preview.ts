'use client';

import type { Weave, WeaveEvidence } from './types';

export type WeavePreviewItem<TPanel> = {
  id: string;
  panel: TPanel;
  weight: number;
  evidence: WeaveEvidence[];
  status: Weave['status'];
  kind: Weave['kind'];
  claim: Weave['claim'];
  whyItHolds: Weave['whyItHolds'];
  openTensions: Weave['openTensions'];
  contractSource: Weave['contractSource'];
  contractUpdatedAt: Weave['contractUpdatedAt'];
  revisions: Weave['revisions'];
};

export type DirectedWeavePreview<TPanel> = {
  incoming: WeavePreviewItem<TPanel>[];
  outgoing: WeavePreviewItem<TPanel>[];
};

export function buildWeavePreview<TPanel extends { docId: string }>(
  panels: TPanel[],
  weaves: Weave[],
): Map<string, DirectedWeavePreview<TPanel>> {
  const panelById = new Map(panels.map((panel) => [panel.docId, panel] as const));
  const preview = new Map<string, DirectedWeavePreview<TPanel>>();

  for (const panel of panels) {
    preview.set(panel.docId, { incoming: [], outgoing: [] });
  }

  for (const weave of weaves) {
    if (weave.status === 'rejected') continue;
    const from = panelById.get(weave.fromPanelId);
    const to = panelById.get(weave.toPanelId);
    if (!from || !to) continue;
    preview.get(from.docId)?.outgoing.push({
      id: weave.id,
      panel: to,
      weight: Math.max(1, weave.evidence.length),
      evidence: weave.evidence,
      status: weave.status,
      kind: weave.kind,
      claim: weave.claim ?? `${from.docId} points to ${to.docId}.`,
      whyItHolds: weave.whyItHolds ?? weave.evidence[0]?.snippet ?? 'This relation is carried by the current evidence threads.',
      openTensions: weave.openTensions ?? [],
      contractSource: weave.contractSource ?? 'derived',
      contractUpdatedAt: weave.contractUpdatedAt ?? weave.updatedAt,
      revisions: weave.revisions ?? [],
    });
    preview.get(to.docId)?.incoming.push({
      id: weave.id,
      panel: from,
      weight: Math.max(1, weave.evidence.length),
      evidence: weave.evidence,
      status: weave.status,
      kind: weave.kind,
      claim: weave.claim ?? `${from.docId} points to ${to.docId}.`,
      whyItHolds: weave.whyItHolds ?? weave.evidence[0]?.snippet ?? 'This relation is carried by the current evidence threads.',
      openTensions: weave.openTensions ?? [],
      contractSource: weave.contractSource ?? 'derived',
      contractUpdatedAt: weave.contractUpdatedAt ?? weave.updatedAt,
      revisions: weave.revisions ?? [],
    });
  }

  for (const [docId, value] of preview) {
    const sortItems = (items: WeavePreviewItem<TPanel>[]) => (
      items.sort((a, b) => {
        const statusRank = (item: WeavePreviewItem<TPanel>) => (item.status === 'confirmed' ? 0 : 1);
        return statusRank(a) - statusRank(b) || b.weight - a.weight;
      })
    );
    preview.set(docId, {
      incoming: sortItems(value.incoming),
      outgoing: sortItems(value.outgoing),
    });
  }

  return preview;
}
