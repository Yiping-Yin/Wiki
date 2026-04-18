'use client';

import type { Panel, PanelSection } from './types';

export type KnowledgeCategoryMeta = {
  slug: string;
  label: string;
};

export function isRenderablePanel(panel: Panel): boolean {
  return panel.status !== 'provisional' && panel.status !== 'superseded';
}

function comparePanels(a: Panel, b: Panel): number {
  return b.updatedAt - a.updatedAt
    || b.contractUpdatedAt - a.contractUpdatedAt
    || b.createdAt - a.createdAt
    || b.sections.length - a.sections.length;
}

export function canonicalizePanels(panels: Panel[]): Panel[] {
  const byDocId = new Map<string, Panel>();
  for (const panel of panels) {
    const current = byDocId.get(panel.docId);
    if (!current || comparePanels(current, panel) > 0) {
      byDocId.set(panel.docId, panel);
    }
  }
  return Array.from(byDocId.values()).sort(comparePanels);
}

export function panelPersistedEqual(a: Panel | null | undefined, b: Panel | null | undefined): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function panelDisplaySummary(summary: string, sections: PanelSection[]): string {
  if (summary.trim()) return summary;
  const first = sections.find((section) => section.summary.trim());
  if (first) return first.summary;
  const quote = sections.find((section) => section.quote?.trim())?.quote?.trim();
  if (quote) return quote.length > 180 ? `${quote.slice(0, 180)}…` : quote;
  return '';
}

export function panelFamilyLabel(
  href: string,
  knowledgeCategories: KnowledgeCategoryMeta[] = [],
): string {
  if (href.startsWith('/wiki/')) return 'LLM Reference';
  const match = href.match(/^\/knowledge\/([^/]+)/);
  if (match) {
    const category = knowledgeCategories.find((item) => item.slug === match[1]);
    if (!category) return match[1];
    const top = category.label.match(/^([^·]+?)\s*·/);
    return top ? top[1].trim() : category.label;
  }
  if (href.startsWith('/uploads/')) return 'Intake';
  return 'Other';
}

export function panelSourceMeta(
  href: string,
  knowledgeCategories: KnowledgeCategoryMeta[] = [],
) {
  if (href.startsWith('/wiki/')) {
    return {
      sourceType: 'wiki' as const,
      collectionLabel: 'LLM Reference',
      collectionHref: '/browse',
    };
  }

  const match = href.match(/^\/knowledge\/([^/]+)/);
  if (match) {
    const category = knowledgeCategories.find((item) => item.slug === match[1]);
    return {
      sourceType: 'knowledge' as const,
      collectionLabel: category?.label ?? 'Knowledge',
      collectionHref: `/knowledge/${match[1]}`,
    };
  }

  if (href.startsWith('/uploads/')) {
    return {
      sourceType: 'upload' as const,
      collectionLabel: 'Intake',
      collectionHref: '/uploads',
    };
  }

  return {
    sourceType: 'other' as const,
    collectionLabel: 'Other',
    collectionHref: undefined,
  };
}
