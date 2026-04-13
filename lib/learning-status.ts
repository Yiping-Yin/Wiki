import type { Trace } from './trace';
import { latestVisitAt } from './trace/source-bound';

export type LearningStage =
  | 'new'
  | 'opened'
  | 'captured'
  | 'rehearsed'
  | 'examined'
  | 'crystallized';

export type LearningRecency = 'fresh' | 'cooling' | 'stale';
export type LearningNextAction = 'capture' | 'rehearse' | 'examine' | 'revisit' | 'refresh';

export type LearningStatusSummary = {
  stage: LearningStage;
  opened: boolean;
  captureCount: number;
  rehearsalCount: number;
  examinerCount: number;
  crystallized: boolean;
  verified: boolean;
  recency: LearningRecency;
  daysSinceTouch: number;
  nextAction: LearningNextAction;
};

export type LearningSurfaceSummary = LearningStatusSummary & {
  touchedAt: number;
  latestSummary: string;
  latestQuote?: string;
  anchorCount: number;
  finished: boolean;
};

function asTraceList(traces: Trace | Trace[] | null | undefined): Trace[] {
  if (!traces) return [];
  return Array.isArray(traces) ? traces : [traces];
}

function inferTouchedAt(traces: Trace[], viewedAt: number) {
  let touchedAt = viewedAt;
  for (const trace of traces) {
    touchedAt = Math.max(
      touchedAt,
      latestVisitAt(trace),
      trace.updatedAt,
      trace.crystallizedAt ?? 0,
      trace.createdAt,
    );
  }
  return touchedAt;
}

function recencyFromTouchedAt(touchedAt: number, opened: boolean): {
  recency: LearningRecency;
  daysSinceTouch: number;
} {
  if (!opened || !touchedAt) {
    return { recency: 'fresh', daysSinceTouch: 0 };
  }
  const daysSinceTouch = Math.max(0, (Date.now() - touchedAt) / 86_400_000);
  if (daysSinceTouch <= 2) return { recency: 'fresh', daysSinceTouch };
  if (daysSinceTouch <= 10) return { recency: 'cooling', daysSinceTouch };
  return { recency: 'stale', daysSinceTouch };
}

export function summarizeLearningStatus(
  traces: Trace | Trace[] | null | undefined,
  viewedAt = 0,
): LearningStatusSummary {
  const traceList = asTraceList(traces);
  let captureCount = 0;
  let rehearsalCount = 0;
  let examinerCount = 0;
  let crystallized = false;

  for (const trace of traceList) {
    for (const event of trace.events) {
      if (event.kind === 'thought-anchor') {
        if (event.anchorBlockId === 'loom-rehearsal-root') {
          rehearsalCount += 1;
        } else if (event.anchorBlockId === 'loom-examiner-root') {
          examinerCount += 1;
        } else {
          captureCount += 1;
        }
      } else if (event.kind === 'crystallize' && !event.anchorId) {
        crystallized = true;
      }
    }
  }

  const opened = Boolean(viewedAt || traceList.length > 0);
  const stage: LearningStage = crystallized
    ? 'crystallized'
    : examinerCount > 0
      ? 'examined'
      : rehearsalCount > 0
        ? 'rehearsed'
        : captureCount > 0
          ? 'captured'
          : opened
            ? 'opened'
            : 'new';
  const verified = crystallized || examinerCount > 0;
  const touchedAt = inferTouchedAt(traceList, viewedAt);
  const { recency, daysSinceTouch } = recencyFromTouchedAt(touchedAt, opened);
  const nextAction: LearningNextAction =
    stage === 'new' || stage === 'opened'
      ? 'capture'
      : stage === 'captured'
        ? 'rehearse'
        : stage === 'rehearsed'
          ? 'examine'
          : recency === 'stale'
            ? 'refresh'
            : 'revisit';

  return {
    stage,
    opened,
    captureCount,
    rehearsalCount,
    examinerCount,
    crystallized,
    verified,
    recency,
    daysSinceTouch,
    nextAction,
  };
}

export function summarizeLearningSurface(
  traces: Trace | Trace[] | null | undefined,
  viewedAt = 0,
): LearningSurfaceSummary {
  let latestSummary = '';
  let latestQuote = '';
  let latestAnchorAt = 0;
  let anchorCount = 0;
  let finished = false;
  const traceList = asTraceList(traces);
  const touchedAt = inferTouchedAt(traceList, viewedAt);

  for (const trace of traceList) {
    for (const event of trace.events) {
      if (event.kind === 'thought-anchor') {
        anchorCount += 1;
        if (event.at >= latestAnchorAt) {
          latestAnchorAt = event.at;
          latestSummary = event.summary;
          latestQuote = event.quote ?? '';
        }
      } else if (event.kind === 'crystallize' && !event.anchorId) {
        finished = true;
      }
    }
  }

  return {
    ...summarizeLearningStatus(traceList, viewedAt),
    touchedAt,
    latestSummary,
    latestQuote: latestQuote || undefined,
    anchorCount,
    finished,
  };
}
