'use client';

import type { ThoughtType, Trace } from '../trace/types';

export type PanelStatus = 'settled' | 'provisional' | 'contested' | 'superseded';

export type PanelSection = {
  key: string;
  anchorId: string;
  summary: string;
  quote?: string;
  thoughtType?: ThoughtType;
  at: number;
};

export type Panel = {
  id: string;
  docId: string;
  href: string;
  title: string;
  sourceDocIds: string[];
  traceIds: string[];
  anchorIds: string[];
  latestAnchorId: string | null;
  summary: string;
  centralClaim: string;
  keyDistinctions: string[];
  openTensions: string[];
  status: PanelStatus;
  createdAt: number;
  updatedAt: number;
  crystallizedAt: number;
  sections: PanelSection[];
};

export type PanelSnapshotInput = {
  docId: string;
  traces: Trace[];
};

export function newPanelId(docId: string): string {
  return `pl_${docId.replace(/[^\w-]+/g, '_')}`;
}
