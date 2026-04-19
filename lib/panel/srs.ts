'use client';

import type { Panel, PanelSrsState } from './types';

const DAY_MS = 86_400_000;

/** Create initial SRS state when a Panel first crystallizes. */
export function initialSrsState(now: number = Date.now()): PanelSrsState {
  return {
    ease: 2.5,
    intervalDays: 1,
    reviewCount: 0,
    nextReviewAt: now + 1 * DAY_MS,
  };
}

/**
 * Simplified SM-2. Takes current SRS state and a recall accuracy (0..1)
 * and returns the next state.
 *
 * Policy (matches v0.2 plan):
 *   accuracy >= 0.75 → PASS: extend interval, grow ease
 *   0.40 <= accuracy < 0.75 → PARTIAL: hold interval
 *   accuracy < 0.40 → WEAK: reset to 1 day, shrink ease
 *
 * The interval ladder for first two reviews is fixed (3d, 7d) to avoid
 * SM-2's over-eager exponential growth from day 1.
 */
export function scheduleNextReview(
  accuracy: number,
  current: PanelSrsState,
  now: number = Date.now(),
): PanelSrsState {
  const q = Math.max(0, Math.min(1, accuracy));
  const reviewCount = current.reviewCount + 1;

  if (q < 0.4) {
    return {
      ease: Math.max(1.3, current.ease - 0.2),
      intervalDays: 1,
      reviewCount,
      lastReviewedAt: now,
      lastAccuracy: q,
      nextReviewAt: now + 1 * DAY_MS,
    };
  }

  if (q < 0.75) {
    return {
      ease: current.ease,
      intervalDays: current.intervalDays,
      reviewCount,
      lastReviewedAt: now,
      lastAccuracy: q,
      nextReviewAt: now + current.intervalDays * DAY_MS,
    };
  }

  // Pass
  const baseInterval =
    current.reviewCount === 0 ? 3
    : current.reviewCount === 1 ? 7
    : Math.round(current.intervalDays * current.ease);

  const newEase = Math.min(3.0, current.ease + 0.1);

  return {
    ease: newEase,
    intervalDays: baseInterval,
    reviewCount,
    lastReviewedAt: now,
    lastAccuracy: q,
    nextReviewAt: now + baseInterval * DAY_MS,
  };
}

/** Is this panel due for review at the given time? */
export function isDueForReview(panel: Panel, now: number = Date.now()): boolean {
  if (panel.status !== 'settled') return false;
  if (!panel.srs) return false;
  if (panel.srs.nextReviewAt == null) return false;
  return panel.srs.nextReviewAt <= now;
}

/** Pick up to `limit` panels that are currently due for review. */
export function selectDuePanels(panels: Panel[], limit: number, now: number = Date.now()): Panel[] {
  return panels
    .filter((p) => isDueForReview(p, now))
    .sort((a, b) => {
      const na = a.srs?.nextReviewAt ?? Infinity;
      const nb = b.srs?.nextReviewAt ?? Infinity;
      return na - nb;
    })
    .slice(0, limit);
}
