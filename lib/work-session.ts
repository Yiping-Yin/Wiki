'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { LearningTarget } from './learning-targets';
import {
  emitWorkSessionChange,
  WORK_SESSION_CHANGE_EVENT,
  type WorkSessionChangeDetail,
} from './work-session-events';

const STORAGE_KEY = 'loom:work-session:v1';
const LAST_COMPLETED_KEY = 'loom:last-work-session:v1';

export type WorkSessionResolutionKind =
  | 'handled'
  | 'reworked'
  | 'verified'
  | 'questioned'
  | 'strengthened';

export type WorkSessionOutcome = {
  handledAt: number;
  targetId: string;
  kind: LearningTarget['kind'];
  handledForTouchedAt: number;
  handledForChangeToken: string;
  revisionCount: number;
  openTensionCount: number;
  statusKey: string;
  resolvedLabel: string;
  resolutionKind: WorkSessionResolutionKind;
  targetSnapshot: LearningTarget;
};

export type CompletedWorkSession = {
  startedAt: number;
  endedAt: number;
  outcomes: WorkSessionOutcome[];
  recap: string | null;
};

export type WorkSession = {
  startedAt: number;
  targetIds: string[];
  outcomes: WorkSessionOutcome[];
  plannedResolutions?: Record<string, WorkSessionResolutionKind>;
};

export type ResolvedWorkSession = {
  active: boolean;
  finished: boolean;
  totalCount: number;
  completedCount: number;
  currentTarget: LearningTarget | null;
  nextTarget: LearningTarget | null;
  remainingTargets: LearningTarget[];
  outcomes: WorkSessionOutcome[];
  recap: string | null;
};

const EMPTY_WORK_SESSION: WorkSession | null = null;
const EMPTY_COMPLETED_WORK_SESSION: CompletedWorkSession | null = null;

function readSession(): WorkSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkSession;
    if (!parsed || !Array.isArray(parsed.targetIds)) return null;
    return {
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now(),
      targetIds: parsed.targetIds.filter(Boolean),
      outcomes: Array.isArray(parsed.outcomes)
        ? parsed.outcomes.filter((item) => item && typeof item.targetId === 'string' && typeof item.kind === 'string' && item.targetSnapshot)
        : [],
      plannedResolutions: parsed.plannedResolutions && typeof parsed.plannedResolutions === 'object'
        ? parsed.plannedResolutions
        : {},
    };
  } catch {
    return null;
  }
}

function writeSession(session: WorkSession | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!session || session.targetIds.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

function buildRecap(outcomes: WorkSessionOutcome[]) {
  if (outcomes.length === 0) return null;
  const panelCount = outcomes.filter((item) => item.kind === 'panel').length;
  const weaveCount = outcomes.filter((item) => item.kind === 'weave').length;
  const parts: string[] = [];
  if (panelCount > 0) parts.push(`${panelCount} panel${panelCount === 1 ? '' : 's'} handled`);
  if (weaveCount > 0) parts.push(`${weaveCount} relation${weaveCount === 1 ? '' : 's'} handled`);
  return parts.join(' · ');
}

export function resolutionKindLabel(kind: WorkSessionResolutionKind) {
  switch (kind) {
    case 'reworked': return 'reworked';
    case 'verified': return 'verified';
    case 'questioned': return 'questioned';
    case 'strengthened': return 'strengthened';
    default: return 'handled';
  }
}

export function describeOutcomeChange(
  target: LearningTarget,
  outcome: WorkSessionOutcome,
) {
  if (target.kind === 'panel') {
    if (target.revisionCount > outcome.revisionCount) {
      const diff = target.revisionCount - outcome.revisionCount;
      return `${diff} new panel revision${diff === 1 ? '' : 's'}`;
    }
    if (outcome.statusKey !== 'contested' && target.statusKey === 'contested') {
      return 'Panel reopened in revision';
    }
    if (target.openTensionCount > outcome.openTensionCount) {
      const diff = target.openTensionCount - outcome.openTensionCount;
      return diff === 1 ? 'Panel surfaced a new tension' : `${diff} new panel tensions`;
    }
    return 'Changed since last session';
  }

  if (target.openTensionCount > outcome.openTensionCount && outcome.openTensionCount === 0) {
    return 'Relation reopened with a new tension';
  }
  if (target.openTensionCount > outcome.openTensionCount) {
    const diff = target.openTensionCount - outcome.openTensionCount;
    return diff === 1 ? 'Relation gained a new tension' : `${diff} new relation tensions`;
  }
  if (target.revisionCount > outcome.revisionCount) {
    const diff = target.revisionCount - outcome.revisionCount;
    return `${diff} new relation revision${diff === 1 ? '' : 's'}`;
  }
  if (outcome.statusKey !== target.statusKey) {
    return 'Relation status changed';
  }
  return 'Changed since last session';
}

function readLastCompletedSession(): CompletedWorkSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_COMPLETED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CompletedWorkSession;
    if (!parsed || !Array.isArray(parsed.outcomes)) return null;
    return {
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : Date.now(),
      endedAt: typeof parsed.endedAt === 'number' ? parsed.endedAt : Date.now(),
      outcomes: parsed.outcomes.filter((item) => item && typeof item.targetId === 'string'),
      recap: typeof parsed.recap === 'string' ? parsed.recap : buildRecap(parsed.outcomes ?? []),
    };
  } catch {
    return null;
  }
}

function writeLastCompletedSession(session: CompletedWorkSession | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!session || session.outcomes.length === 0) {
      window.localStorage.removeItem(LAST_COMPLETED_KEY);
      return;
    }
    window.localStorage.setItem(LAST_COMPLETED_KEY, JSON.stringify(session));
  } catch {}
}

let sessionCache: WorkSession | null | undefined;
let lastCompletedSessionCache: CompletedWorkSession | null | undefined;

function getSessionSnapshot() {
  if (typeof window === 'undefined') return null;
  if (sessionCache === undefined) {
    sessionCache = readSession();
  }
  return sessionCache;
}

function getLastCompletedSessionSnapshot() {
  if (typeof window === 'undefined') return null;
  if (lastCompletedSessionCache === undefined) {
    lastCompletedSessionCache = readLastCompletedSession();
  }
  return lastCompletedSessionCache;
}

function setSessionSnapshot(
  next: WorkSession | null,
  detail?: WorkSessionChangeDetail,
) {
  sessionCache = next;
  writeSession(next);
  emitWorkSessionChange(detail);
}

function setLastCompletedSessionSnapshot(
  next: CompletedWorkSession | null,
  detail?: WorkSessionChangeDetail,
) {
  lastCompletedSessionCache = next;
  writeLastCompletedSession(next);
  emitWorkSessionChange(detail);
}

function refreshWorkSessionSnapshots() {
  sessionCache = readSession();
  lastCompletedSessionCache = readLastCompletedSession();
}

function subscribeWorkSession(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};

  const handleChange = () => {
    refreshWorkSessionSnapshots();
    onStoreChange();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== STORAGE_KEY && event.key !== LAST_COMPLETED_KEY) return;
    handleChange();
  };

  window.addEventListener(WORK_SESSION_CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(WORK_SESSION_CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export function resolveWorkSession(
  session: WorkSession | null,
  targets: LearningTarget[],
): ResolvedWorkSession {
  if (!session || session.targetIds.length === 0) {
    return {
      active: false,
      finished: false,
      totalCount: 0,
      completedCount: 0,
      currentTarget: null,
      nextTarget: null,
      remainingTargets: [],
      outcomes: [],
      recap: null,
    };
  }

  const handledIds = new Set(
    (session.outcomes ?? [])
      .map((outcome) => outcome.targetId)
      .filter((targetId) => session.targetIds.includes(targetId)),
  );
  const targetById = new Map(targets.map((target) => [target.id, target] as const));
  const remainingTargetIds = session.targetIds.filter((id) => !handledIds.has(id));
  const remainingTargets = remainingTargetIds
    .map((id) => targetById.get(id) ?? null)
    .filter((target): target is LearningTarget => Boolean(target));
  const completedCount = handledIds.size;

  return {
    active: true,
    finished: remainingTargetIds.length === 0,
    totalCount: session.targetIds.length,
    completedCount,
    currentTarget: remainingTargets[0] ?? null,
    nextTarget: remainingTargets[1] ?? null,
    remainingTargets,
    outcomes: session.outcomes ?? [],
    recap: buildRecap(session.outcomes ?? []),
  };
}

export function applyLastCompletedSessionSignal(
  targets: LearningTarget[],
  lastCompletedSession: CompletedWorkSession | null,
) {
  if (!lastCompletedSession || lastCompletedSession.outcomes.length === 0) return targets;
  const latestOutcomeByTargetId = new Map<string, WorkSessionOutcome>();
  for (const outcome of lastCompletedSession.outcomes) {
    const existing = latestOutcomeByTargetId.get(outcome.targetId);
    if (!existing || outcome.handledAt > existing.handledAt) {
      latestOutcomeByTargetId.set(outcome.targetId, outcome);
    }
  }

  return targets
    .map((target) => {
      const outcome = latestOutcomeByTargetId.get(target.id);
      if (!outcome) return target;
      if (target.changeToken === outcome.handledForChangeToken) return target;
      return {
        ...target,
        priority: target.priority + 12,
        priorityReasons: [describeOutcomeChange(target, outcome), ...target.priorityReasons],
        reentryHint: target.kind === 'panel'
          ? (
              target.revisionCount > outcome.revisionCount
                ? 'panel-revision-diff'
                : target.statusKey === 'contested'
                  ? 'panel-review'
                  : target.reentryHint
            )
          : (
              target.openTensionCount > outcome.openTensionCount
                ? 'weave-focused-question'
                : target.revisionCount > outcome.revisionCount
                  ? 'weave-focused-review'
                  : target.reentryHint
            ),
      };
    })
    .sort((a, b) => b.priority - a.priority || b.touchedAt - a.touchedAt);
}

export function countTargetsChangedSinceSession(
  targets: LearningTarget[],
  lastCompletedSession: CompletedWorkSession | null,
) {
  if (!lastCompletedSession || lastCompletedSession.outcomes.length === 0) return 0;
  const latestOutcomeByTargetId = new Map<string, WorkSessionOutcome>();
  for (const outcome of lastCompletedSession.outcomes) {
    const existing = latestOutcomeByTargetId.get(outcome.targetId);
    if (!existing || outcome.handledAt > existing.handledAt) {
      latestOutcomeByTargetId.set(outcome.targetId, outcome);
    }
  }
  let count = 0;
  for (const target of targets) {
    const outcome = latestOutcomeByTargetId.get(target.id);
    if (outcome && target.changeToken !== outcome.handledForChangeToken) count += 1;
  }
  return count;
}

export function summarizeChangesSinceSession(
  targets: LearningTarget[],
  lastCompletedSession: CompletedWorkSession | null,
) {
  if (!lastCompletedSession || lastCompletedSession.outcomes.length === 0) return null;
  const latestOutcomeByTargetId = new Map<string, WorkSessionOutcome>();
  for (const outcome of lastCompletedSession.outcomes) {
    const existing = latestOutcomeByTargetId.get(outcome.targetId);
    if (!existing || outcome.handledAt > existing.handledAt) {
      latestOutcomeByTargetId.set(outcome.targetId, outcome);
    }
  }
  const labels: string[] = [];
  for (const target of targets) {
    const outcome = latestOutcomeByTargetId.get(target.id);
    if (!outcome) continue;
    if (target.changeToken === outcome.handledForChangeToken) continue;
    labels.push(describeOutcomeChange(target, outcome));
  }
  if (labels.length === 0) return null;
  const unique = Array.from(new Set(labels));
  return unique.slice(0, 2).join(' · ');
}

function buildResolvedLabel(target: LearningTarget) {
  if (target.kind === 'panel') {
    if (target.reentryHint === 'panel-revision-diff') return 'Panel revision';
    if (target.reentryHint === 'panel-review') return 'Panel reopened in review';
    return 'Panel change';
  }
  if (target.reentryHint === 'weave-focused-question') return 'Relation tension';
  if (target.reentryHint === 'weave-focused-review') return 'Relation revision';
  return 'Relation change';
}

export function resolvedOutcomesForDisplay(
  lastCompletedSession: CompletedWorkSession | null,
) {
  if (!lastCompletedSession || lastCompletedSession.outcomes.length === 0) return [];
  const latestByTarget = new Map<string, WorkSessionOutcome>();
  for (const outcome of lastCompletedSession.outcomes) {
    const existing = latestByTarget.get(outcome.targetId);
    if (!existing || outcome.handledAt > existing.handledAt) {
      latestByTarget.set(outcome.targetId, outcome);
    }
  }
  return Array.from(latestByTarget.values()).sort((a, b) => b.handledAt - a.handledAt);
}

export function isTargetChangeResolved(
  target: LearningTarget,
  lastCompletedSession: CompletedWorkSession | null,
) {
  if (!lastCompletedSession || lastCompletedSession.outcomes.length === 0) return false;
  let latestOutcome: WorkSessionOutcome | null = null;
  for (const outcome of lastCompletedSession.outcomes) {
    if (outcome.targetId !== target.id) continue;
    if (!latestOutcome || outcome.handledAt > latestOutcome.handledAt) {
      latestOutcome = outcome;
    }
  }
  if (!latestOutcome) return false;
  return latestOutcome.handledForChangeToken === target.changeToken;
}

function startWorkSession(targets: LearningTarget[]) {
  const next: WorkSession = {
    startedAt: Date.now(),
    targetIds: Array.from(new Set(targets.map((target) => target.id).filter(Boolean))),
    outcomes: [],
    plannedResolutions: {},
  };
  setSessionSnapshot(next, { reason: 'start' });
}

function setWorkSessionResolutionKind(target: LearningTarget, resolutionKind: WorkSessionResolutionKind) {
  const current = getSessionSnapshot();
  if (!current) return;
  const next: WorkSession = {
    ...current,
    plannedResolutions: {
      ...(current.plannedResolutions ?? {}),
      [target.id]: resolutionKind,
    },
  };
  setSessionSnapshot(next, { reason: 'set-resolution', targetId: target.id });
}

function recordWorkSessionOutcome(target: LearningTarget) {
  const current = getSessionSnapshot();
  const base = current ?? {
    startedAt: Date.now(),
    targetIds: [target.id],
    outcomes: [],
    plannedResolutions: {},
  };
  const resolutionKind = base.plannedResolutions?.[target.id] ?? 'handled';
  const next: WorkSession = {
    ...base,
    outcomes: [
      ...base.outcomes,
      {
        handledAt: Date.now(),
        targetId: target.id,
        kind: target.kind,
        handledForTouchedAt: target.touchedAt,
        handledForChangeToken: target.changeToken,
        revisionCount: target.revisionCount,
        openTensionCount: target.openTensionCount,
        statusKey: target.statusKey,
        resolvedLabel: buildResolvedLabel(target),
        resolutionKind,
        targetSnapshot: target,
      },
    ],
    plannedResolutions: Object.fromEntries(
      Object.entries(base.plannedResolutions ?? {}).filter(([id]) => id !== target.id),
    ),
  };
  setSessionSnapshot(next, { reason: 'record-outcome', targetId: target.id });
}

function clearWorkSession() {
  const current = getSessionSnapshot();
  if (current && current.outcomes.length > 0) {
    const completed: CompletedWorkSession = {
      startedAt: current.startedAt,
      endedAt: Date.now(),
      outcomes: current.outcomes,
      recap: buildRecap(current.outcomes),
    };
    setLastCompletedSessionSnapshot(completed, { reason: 'last-completed' });
  }
  setSessionSnapshot(null, { reason: 'clear' });
}

export const workSessionStore = {
  getSessionSnapshot,
  getLastCompletedSessionSnapshot,
  subscribe: subscribeWorkSession,
  start: startWorkSession,
  setResolutionKind: setWorkSessionResolutionKind,
  recordOutcome: recordWorkSessionOutcome,
  clear: clearWorkSession,
};

export function useWorkSession() {
  const session = useSyncExternalStore(
    workSessionStore.subscribe,
    workSessionStore.getSessionSnapshot,
    () => EMPTY_WORK_SESSION,
  );
  const lastCompletedSession = useSyncExternalStore(
    workSessionStore.subscribe,
    workSessionStore.getLastCompletedSessionSnapshot,
    () => EMPTY_COMPLETED_WORK_SESSION,
  );

  const start = useCallback((targets: LearningTarget[]) => {
    workSessionStore.start(targets);
  }, []);

  const setResolutionKind = useCallback((target: LearningTarget, resolutionKind: WorkSessionResolutionKind) => {
    workSessionStore.setResolutionKind(target, resolutionKind);
  }, []);

  const recordOutcome = useCallback((target: LearningTarget) => {
    workSessionStore.recordOutcome(target);
  }, []);

  const clear = useCallback(() => {
    workSessionStore.clear();
  }, []);

  return useMemo(() => ({
    session,
    lastCompletedSession,
    start,
    setResolutionKind,
    recordOutcome,
    clear,
  }), [clear, lastCompletedSession, recordOutcome, session, setResolutionKind, start]);
}
