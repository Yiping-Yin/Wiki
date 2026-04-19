'use client';

import type { LearningNextAction, LearningRecency } from '../learning-status';
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

export type PanelRevision = {
  at: number;
  summary: string;
  centralClaim: string;
  keyDistinctions: string[];
  openTensions: string[];
};

export type PanelSrsState = {
  /** Simplified SM-2 ease factor. Initialized to 2.5. Range [1.3, 3.0]. */
  ease: number;
  /** Days until next review. Starts at 1 after first crystallize. */
  intervalDays: number;
  /** Count of successful reviews so far. */
  reviewCount: number;
  /** Timestamp of the most recent review attempt. */
  lastReviewedAt?: number;
  /** Last recall accuracy, 0..1. */
  lastAccuracy?: number;
  /** Timestamp when this Panel is next due. */
  nextReviewAt?: number;
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
  contractSource: 'derived' | 'crystallized';
  contractUpdatedAt: number;
  revisions: PanelRevision[];
  learning: {
    nextAction: LearningNextAction;
    recency: LearningRecency;
    touchedAt: number;
    anchorCount: number;
  };
  status: PanelStatus;
  createdAt: number;
  updatedAt: number;
  crystallizedAt: number;
  sections: PanelSection[];
  /** Spaced-repetition schedule. Initialized at first crystallize. Only
   *  touched when the panel status is 'settled' and the user has completed
   *  a blind recall. */
  srs?: PanelSrsState;
};

export type PanelSnapshotInput = {
  docId: string;
  traces: Trace[];
  existing?: Panel | null;
};

export function newPanelId(docId: string): string {
  return `pl_${docId.replace(/[^\w-]+/g, '_')}`;
}
