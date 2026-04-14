'use client';

import type { Trace } from './types';

export type TracePanelLifecycle = {
  crystallizedAt?: number;
  crystallizedSummary?: string;
  reopenedAt?: number;
  isSettled: boolean;
};

export function tracePanelLifecycle(trace: Trace): TracePanelLifecycle {
  let crystallizedAt: number | undefined;
  let crystallizedSummary: string | undefined;
  let reopenedAt: number | undefined;

  for (const event of trace.events) {
    if (event.kind === 'crystallize' && !event.anchorId) {
      if (!crystallizedAt || event.at >= crystallizedAt) {
        crystallizedAt = event.at;
        crystallizedSummary = event.summary;
      }
    } else if (event.kind === 'panel-reopen') {
      if (!reopenedAt || event.at >= reopenedAt) {
        reopenedAt = event.at;
      }
    }
  }

  const isSettled = Boolean(crystallizedAt && (!reopenedAt || crystallizedAt > reopenedAt));
  return {
    crystallizedAt: isSettled ? crystallizedAt : undefined,
    crystallizedSummary: isSettled ? crystallizedSummary : undefined,
    reopenedAt,
    isSettled,
  };
}
