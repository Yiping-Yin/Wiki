import type { Trace } from './trace';

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

export function summarizeLearningStatus(
  trace: Trace | null | undefined,
  viewedAt = 0,
): LearningStatusSummary {
  let captureCount = 0;
  let rehearsalCount = 0;
  let examinerCount = 0;
  let crystallized = false;

  if (trace) {
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

  const opened = Boolean(viewedAt || trace);
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
