import {
  applyLearningTargetState,
  collectLearningTargetQueue,
  isLearningTargetInWorkQueue,
  type LearningTargetQueue,
  type LearningTargetState,
} from '../learning-target-state';
import type { LearningTarget } from '../learning-targets';
import {
  applyLastCompletedSessionSignal,
  resolveWorkSession,
  resolvedOutcomesForDisplay,
  type CompletedWorkSession,
  type ResolvedWorkSession,
  type WorkSession,
  type WorkSessionOutcome,
} from '../work-session';

export type DeskLearningState = {
  rawTargets: LearningTarget[];
  visibleTargets: LearningTarget[];
  workTargets: LearningTarget[];
  resolvedSession: ResolvedWorkSession;
};

export function deriveDeskLearningState({
  baseTargets,
  learningTargetState,
  lastCompletedSession,
  session,
}: {
  baseTargets: LearningTarget[];
  learningTargetState: LearningTargetState;
  lastCompletedSession: CompletedWorkSession | null;
  session: WorkSession | null;
}): DeskLearningState {
  const rawTargets = applyLastCompletedSessionSignal(baseTargets, lastCompletedSession);
  const visibleTargets = applyLearningTargetState(rawTargets, learningTargetState);
  const workTargets = visibleTargets.filter((target) => isLearningTargetInWorkQueue(target, learningTargetState));
  const resolvedSession = resolveWorkSession(session, workTargets);

  return {
    rawTargets,
    visibleTargets,
    workTargets,
    resolvedSession,
  };
}

export function deriveDeskQueue({
  rawTargets,
  learningTargetState,
  excludeIds,
}: {
  rawTargets: LearningTarget[];
  learningTargetState: LearningTargetState;
  excludeIds?: Set<string>;
}): LearningTargetQueue {
  return collectLearningTargetQueue(
    rawTargets,
    learningTargetState,
    excludeIds ? { excludeIds } : undefined,
  );
}

export function hasDeskQueue(queue: LearningTargetQueue) {
  return (
    queue.pinned.length > 0
    || queue.snoozed.length > 0
    || queue.hiddenToday.length > 0
    || queue.done.length > 0
  );
}

export function deriveDeskResolvedOutcomeItems(
  lastCompletedSession: CompletedWorkSession | null,
  limit: number,
): WorkSessionOutcome[] {
  return resolvedOutcomesForDisplay(lastCompletedSession).slice(0, limit);
}
