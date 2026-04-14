'use client';

import type { Weave } from './types';

export type WeavePreviewItem<TPanel> = {
  id: string;
  panel: TPanel;
  weight: number;
  snippets: string[];
  status: Weave['status'];
  kind: Weave['kind'];
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
      snippets: weave.evidence.map((item) => item.snippet).filter(Boolean),
      status: weave.status,
      kind: weave.kind,
    });
    preview.get(to.docId)?.incoming.push({
      id: weave.id,
      panel: from,
      weight: Math.max(1, weave.evidence.length),
      snippets: weave.evidence.map((item) => item.snippet).filter(Boolean),
      status: weave.status,
      kind: weave.kind,
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
