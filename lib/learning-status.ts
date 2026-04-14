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
export type LearningQuality = 'untested' | 'fragile' | 'developing' | 'solid';

export type LearningStatusSummary = {
  stage: LearningStage;
  opened: boolean;
  captureCount: number;
  rehearsalCount: number;
  examinerCount: number;
  passCount: number;
  retryCount: number;
  crystallized: boolean;
  verified: boolean;
  quality: LearningQuality;
  weakSpot: boolean;
  recency: LearningRecency;
  daysSinceTouch: number;
  nextAction: LearningNextAction;
};

export type LearningSurfaceSummary = LearningStatusSummary & {
  touchedAt: number;
  latestSummary: string;
  latestQuote?: string;
  latestAnchorId: string | null;
  anchorCount: number;
  finished: boolean;
};

function asTraceList(traces: Trace | Trace[] | null | undefined): Trace[] {
  if (!traces) return [];
  return Array.isArray(traces) ? traces : [traces];
}

function examinerVerdictFromContent(content: string): 'pass' | 'retry' | null {
  const lower = content.toLowerCase();
  if (lower.includes('**verdict**: pass')) return 'pass';
  if (lower.includes('**verdict**: retry')) return 'retry';
  return null;
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
  let passCount = 0;
  let retryCount = 0;
  let crystallized = false;

  for (const trace of traceList) {
    for (const event of trace.events) {
      if (event.kind === 'thought-anchor') {
        if (event.anchorBlockId === 'loom-rehearsal-root') {
          rehearsalCount += 1;
        } else if (event.anchorBlockId === 'loom-examiner-root') {
          examinerCount += 1;
          const verdict = examinerVerdictFromContent(event.content);
          if (verdict === 'pass') passCount += 1;
          if (verdict === 'retry') retryCount += 1;
        } else {
          captureCount += 1;
        }
      }
    }
    if (trace.crystallizedAt) crystallized = true;
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
  const quality: LearningQuality =
    passCount === 0 && retryCount === 0
      ? 'untested'
      : retryCount > passCount || (retryCount >= 2 && passCount === 0)
        ? 'fragile'
        : retryCount > 0 || (passCount > 0 && !crystallized)
          ? 'developing'
          : 'solid';
  const weakSpot = quality === 'fragile';

  return {
    stage,
    opened,
    captureCount,
    rehearsalCount,
    examinerCount,
    passCount,
    retryCount,
    crystallized,
    verified,
    quality,
    weakSpot,
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
  let latestAnchorId: string | null = null;
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
          latestAnchorId = event.anchorId;
        }
      }
    }
    if (trace.crystallizedAt) finished = true;
  }

  return {
    ...summarizeLearningStatus(traceList, viewedAt),
    touchedAt,
    latestSummary,
    latestQuote: latestQuote || undefined,
    latestAnchorId,
    anchorCount,
    finished,
  };
}
