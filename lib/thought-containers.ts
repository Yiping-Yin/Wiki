import { passagePositionKey } from './passage-locator';
import type { TraceEvent } from './trace/types';

export type ThoughtContainerPosition = {
  anchorId?: string;
  anchorBlockId?: string;
  anchorBlockText?: string;
  anchorCharStart?: number | null;
  anchorCharEnd?: number | null;
  target?: string | null;
};

export function thoughtPositionKey(position: ThoughtContainerPosition): string {
  return passagePositionKey({
    anchorId: position.anchorId,
    blockId: position.anchorBlockId,
    blockText: position.anchorBlockText,
    charStart: position.anchorCharStart,
    charEnd: position.anchorCharEnd,
    target: position.target,
  });
}

export function matchesThoughtPositionEvent(
  event: TraceEvent,
  position: ThoughtContainerPosition,
): boolean {
  if (event.kind !== 'thought-anchor') return false;
  return thoughtPositionKey({
    anchorId: event.anchorId,
    anchorBlockId: event.anchorBlockId,
    anchorBlockText: event.anchorBlockText,
    anchorCharStart: event.anchorCharStart,
    anchorCharEnd: event.anchorCharEnd,
    target: position.target,
  }) === thoughtPositionKey(position);
}

function isThoughtAnchorEvent(
  event: TraceEvent,
): event is Extract<TraceEvent, { kind: 'thought-anchor' }> {
  return event.kind === 'thought-anchor';
}

export function collectThoughtContainerAnchorIds(
  events: TraceEvent[],
  position: ThoughtContainerPosition,
): Set<string> {
  const anchorIds = new Set<string>();
  for (const event of events) {
    if (!isThoughtAnchorEvent(event) || !matchesThoughtPositionEvent(event, position)) continue;
    anchorIds.add(event.anchorId);
  }
  return anchorIds;
}

export function matchesThoughtContainerCrystallizeEvent(
  event: TraceEvent,
  anchorIds: Iterable<string>,
): boolean {
  if (event.kind !== 'crystallize' || !event.anchorId) return false;
  for (const anchorId of anchorIds) {
    if (event.anchorId === anchorId) return true;
  }
  return false;
}

export function isThoughtPositionCrystallized(
  events: TraceEvent[],
  position: ThoughtContainerPosition,
): boolean {
  const anchorIds = collectThoughtContainerAnchorIds(events, position);
  if (anchorIds.size === 0) return false;
  return events.some((event) => matchesThoughtContainerCrystallizeEvent(event, anchorIds));
}
