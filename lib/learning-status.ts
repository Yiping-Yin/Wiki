import type { Trace } from './trace';
import { latestVisitAt } from './trace/source-bound';

export type LearningStage =
  | 'new'
  | 'opened'
  | 'captured'
  | 'rehearsed'
  | 'examined'
  | 'crystallized';

export type LearningStatusSummary = {
  stage: LearningStage;
  opened: boolean;
  captureCount: number;
  rehearsalCount: number;
  examinerCount: number;
  crystallized: boolean;
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

export function summarizeLearningStatus(
  traces: Trace | Trace[] | null | undefined,
  viewedAt = 0,
): LearningStatusSummary {
  let captureCount = 0;
  let rehearsalCount = 0;
  let examinerCount = 0;
  let crystallized = false;

  for (const trace of asTraceList(traces)) {
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

  const opened = Boolean(viewedAt || asTraceList(traces).length > 0);
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

  return {
    stage,
    opened,
    captureCount,
    rehearsalCount,
    examinerCount,
    crystallized,
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
  let touchedAt = viewedAt;

  const traceList = asTraceList(traces);

  for (const trace of traceList) {
    touchedAt = Math.max(
      touchedAt,
      latestVisitAt(trace),
      trace.updatedAt,
      trace.crystallizedAt ?? 0,
      trace.createdAt,
    );

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
