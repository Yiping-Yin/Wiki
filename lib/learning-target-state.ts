'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { LearningTarget } from './learning-targets';
import {
  emitLearningTargetStateChange,
  LEARNING_TARGET_STATE_CHANGE_EVENT,
  type LearningTargetStateChangeDetail,
} from './learning-target-state-events';

const STORAGE_KEY = 'loom:learning-target-state:v1';
const NOT_NOW_MS = 3 * 60 * 60 * 1000;

export type LearningTargetStateEntry = {
  pinnedAt?: number;
  snoozedUntil?: number;
  snoozedForTouchedAt?: number;
  snoozedForChangeToken?: string;
  hiddenOnDay?: string;
  hiddenForTouchedAt?: number;
  hiddenForChangeToken?: string;
  doneAt?: number;
  doneForTouchedAt?: number;
  doneForChangeToken?: string;
};

export type LearningTargetState = Record<string, LearningTargetStateEntry>;
export type LearningTargetQueueKind = 'pinned' | 'snoozed' | 'hidden-today' | 'done';
export type LearningTargetQueueItem = {
  target: LearningTarget;
  kind: LearningTargetQueueKind;
  label: string;
};
export type LearningTargetQueue = {
  pinned: LearningTargetQueueItem[];
  snoozed: LearningTargetQueueItem[];
  hiddenToday: LearningTargetQueueItem[];
  done: LearningTargetQueueItem[];
};
export type LearningTargetResolvedState = {
  visible: boolean;
  bucket: 'pinned' | 'active' | 'snoozed' | 'hidden-today' | 'done';
  stateLabel?: string;
  returnLabel?: string;
};

const EMPTY_LEARNING_TARGET_STATE: LearningTargetState = {};

function localDayKey(ts = Date.now()) {
  const day = new Date(ts);
  const year = day.getFullYear();
  const month = String(day.getMonth() + 1).padStart(2, '0');
  const date = String(day.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function readState(): LearningTargetState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LearningTargetState;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(next: LearningTargetState) {
  if (typeof window === 'undefined') return;
  try {
    const keys = Object.keys(next);
    if (keys.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

let stateCache: LearningTargetState | undefined;

function getStateSnapshot(): LearningTargetState {
  if (typeof window === 'undefined') return {};
  if (stateCache === undefined) {
    stateCache = readState();
  }
  return stateCache;
}

function setStateSnapshot(
  next: LearningTargetState,
  detail?: LearningTargetStateChangeDetail,
) {
  stateCache = next;
  writeState(next);
  emitLearningTargetStateChange(detail);
}

function refreshStateSnapshot() {
  stateCache = readState();
}

function subscribeState(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};

  const handleChange = () => {
    refreshStateSnapshot();
    onStoreChange();
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key && event.key !== STORAGE_KEY) return;
    handleChange();
  };

  window.addEventListener(LEARNING_TARGET_STATE_CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(LEARNING_TARGET_STATE_CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}

function suppressionStillApplies(
  target: LearningTarget,
  baselineTouchedAt: number | undefined,
  baselineChangeToken: string | undefined,
) {
  if (baselineChangeToken) return target.changeToken === baselineChangeToken;
  return typeof baselineTouchedAt === 'number' && target.touchedAt <= baselineTouchedAt;
}

function shouldHideTarget(
  target: LearningTarget,
  entry: LearningTargetStateEntry | undefined,
  now: number,
  todayKey: string,
) {
  if (!entry) return false;
  if (
    suppressionStillApplies(target, entry.doneForTouchedAt, entry.doneForChangeToken)
    && typeof entry.doneAt === 'number'
  ) {
    return true;
  }
  if (
    suppressionStillApplies(target, entry.hiddenForTouchedAt, entry.hiddenForChangeToken)
    && entry.hiddenOnDay === todayKey
  ) {
    return true;
  }
  if (
    suppressionStillApplies(target, entry.snoozedForTouchedAt, entry.snoozedForChangeToken)
    && typeof entry.snoozedUntil === 'number'
    && entry.snoozedUntil > now
  ) {
    return true;
  }
  return false;
}

export function resolveLearningTargetState(
  target: LearningTarget,
  state: LearningTargetState,
  now = Date.now(),
): LearningTargetResolvedState {
  const entry = state[target.id];
  const todayKey = localDayKey(now);

  if (!entry) {
    return { visible: true, bucket: 'active' };
  }

  if (
    suppressionStillApplies(target, entry.doneForTouchedAt, entry.doneForChangeToken)
    && typeof entry.doneAt === 'number'
  ) {
    return {
      visible: false,
      bucket: 'done',
      stateLabel: 'Done for current change',
    };
  }

  if (
    suppressionStillApplies(target, entry.hiddenForTouchedAt, entry.hiddenForChangeToken)
    && entry.hiddenOnDay === todayKey
  ) {
    return {
      visible: false,
      bucket: 'hidden-today',
      stateLabel: 'Hidden until later today',
    };
  }

  if (
    suppressionStillApplies(target, entry.snoozedForTouchedAt, entry.snoozedForChangeToken)
    && typeof entry.snoozedUntil === 'number'
    && entry.snoozedUntil > now
  ) {
    return {
      visible: false,
      bucket: 'snoozed',
      stateLabel: `Snoozed for ${formatRemaining(entry.snoozedUntil - now)}`,
    };
  }

  const pinned = typeof entry.pinnedAt === 'number';
  let returnLabel: string | undefined;
  if (
    (entry.doneForChangeToken && target.changeToken !== entry.doneForChangeToken)
    || (!entry.doneForChangeToken && typeof entry.doneForTouchedAt === 'number' && target.touchedAt > entry.doneForTouchedAt)
  ) {
    returnLabel = 'Returned after a new change appeared';
  } else if (
    (entry.hiddenForChangeToken && target.changeToken !== entry.hiddenForChangeToken)
    || (!entry.hiddenForChangeToken
      && typeof entry.hiddenForTouchedAt === 'number'
      && target.touchedAt > entry.hiddenForTouchedAt)
  ) {
    returnLabel = 'Returned after a new change appeared';
  } else if (
    (entry.snoozedForChangeToken && target.changeToken !== entry.snoozedForChangeToken)
    || (!entry.snoozedForChangeToken
      && typeof entry.snoozedForTouchedAt === 'number'
      && target.touchedAt > entry.snoozedForTouchedAt)
  ) {
    returnLabel = 'Returned after a new change appeared';
  } else if (
    typeof entry.snoozedUntil === 'number'
    && entry.snoozedUntil <= now
  ) {
    returnLabel = 'Returned after the snooze window ended';
  } else if (entry.hiddenOnDay && entry.hiddenOnDay !== todayKey) {
    returnLabel = 'Returned on a new day';
  }

  return {
    visible: true,
    bucket: pinned ? 'pinned' : 'active',
    stateLabel: pinned ? 'Pinned' : undefined,
    returnLabel,
  };
}

export function applyLearningTargetState(
  targets: LearningTarget[],
  state: LearningTargetState,
  now = Date.now(),
) {
  const visible = targets.filter((target) => resolveLearningTargetState(target, state, now).visible);
  return [...visible].sort((a, b) => {
    const aResolved = resolveLearningTargetState(a, state, now);
    const bResolved = resolveLearningTargetState(b, state, now);
    const aPinned = aResolved.bucket === 'pinned' ? 1 : 0;
    const bPinned = bResolved.bucket === 'pinned' ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return b.priority - a.priority || b.touchedAt - a.touchedAt;
  });
}

export function isLearningTargetPinned(
  target: LearningTarget,
  state: LearningTargetState,
) {
  return resolveLearningTargetState(target, state).bucket === 'pinned';
}

function formatRemaining(ms: number) {
  const clamped = Math.max(0, ms);
  const hours = Math.floor(clamped / (60 * 60 * 1000));
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.max(1, Math.ceil(clamped / (60 * 1000)));
  return `${minutes}m`;
}

export function describeLearningTargetState(
  target: LearningTarget,
  state: LearningTargetState,
  now = Date.now(),
): LearningTargetQueueItem | null {
  const resolved = resolveLearningTargetState(target, state, now);
  if (resolved.bucket === 'active') return null;
  return {
    target,
    kind: resolved.bucket,
    label: resolved.stateLabel ?? '',
  };
}

export function learningTargetReturnLabel(
  target: LearningTarget,
  state: LearningTargetState,
  now = Date.now(),
) {
  return resolveLearningTargetState(target, state, now).returnLabel ?? null;
}

export function learningTargetStateRank(
  target: LearningTarget,
  state: LearningTargetState,
  now = Date.now(),
) {
  const bucket = resolveLearningTargetState(target, state, now).bucket;
  if (bucket === 'pinned') return 0;
  if (bucket === 'active') return 1;
  return 2;
}

export function isLearningTargetInWorkQueue(
  target: LearningTarget,
  state: LearningTargetState,
  now = Date.now(),
) {
  const resolved = resolveLearningTargetState(target, state, now);
  if (!resolved.visible) return false;
  if (resolved.bucket === 'pinned') return true;
  if (resolved.returnLabel) return true;
  if (target.kind === 'weave') return true;
  return target.action !== 'capture';
}

export function collectLearningTargetQueue(
  targets: LearningTarget[],
  state: LearningTargetState,
  opts?: { excludeIds?: Set<string>; now?: number },
): LearningTargetQueue {
  const excludeIds = opts?.excludeIds ?? new Set<string>();
  const now = opts?.now ?? Date.now();
  const queue: LearningTargetQueue = {
    pinned: [],
    snoozed: [],
    hiddenToday: [],
    done: [],
  };

  for (const target of targets) {
    if (excludeIds.has(target.id)) continue;
    const described = describeLearningTargetState(target, state, now);
    if (!described) continue;
    if (described.kind === 'pinned') queue.pinned.push(described);
    else if (described.kind === 'snoozed') queue.snoozed.push(described);
    else if (described.kind === 'hidden-today') queue.hiddenToday.push(described);
    else queue.done.push(described);
  }

  return queue;
}

function updateEntry(
  current: LearningTargetState,
  target: LearningTarget,
  mutate: (entry: LearningTargetStateEntry) => LearningTargetStateEntry | null,
  detail?: LearningTargetStateChangeDetail,
) {
  const next = { ...current };
  const existing = next[target.id] ?? {};
  const updated = mutate(existing);
  if (!updated || Object.keys(updated).length === 0) {
    delete next[target.id];
  } else {
    next[target.id] = updated;
  }
  setStateSnapshot(next, detail);
  return next;
}

function notNowLearningTarget(target: LearningTarget) {
  const now = Date.now();
  updateEntry(getStateSnapshot(), target, (entry) => ({
    ...entry,
    snoozedUntil: now + NOT_NOW_MS,
    snoozedForTouchedAt: target.touchedAt,
    snoozedForChangeToken: target.changeToken,
    hiddenOnDay: undefined,
    hiddenForTouchedAt: undefined,
    hiddenForChangeToken: undefined,
  }), { reason: 'not-now', targetId: target.id });
}

function hideLearningTargetToday(target: LearningTarget) {
  const now = Date.now();
  updateEntry(getStateSnapshot(), target, (entry) => ({
    ...entry,
    hiddenOnDay: localDayKey(now),
    hiddenForTouchedAt: target.touchedAt,
    hiddenForChangeToken: target.changeToken,
    snoozedUntil: undefined,
    snoozedForTouchedAt: undefined,
    snoozedForChangeToken: undefined,
  }), { reason: 'hide-today', targetId: target.id });
}

function markLearningTargetDone(target: LearningTarget) {
  const now = Date.now();
  updateEntry(getStateSnapshot(), target, (entry) => ({
    ...entry,
    doneAt: now,
    doneForTouchedAt: target.touchedAt,
    doneForChangeToken: target.changeToken,
    snoozedUntil: undefined,
    snoozedForTouchedAt: undefined,
    snoozedForChangeToken: undefined,
    hiddenOnDay: undefined,
    hiddenForTouchedAt: undefined,
    hiddenForChangeToken: undefined,
  }), { reason: 'done', targetId: target.id });
}

function toggleLearningTargetPinned(target: LearningTarget) {
  const now = Date.now();
  updateEntry(getStateSnapshot(), target, (entry) => ({
    ...entry,
    pinnedAt: entry.pinnedAt ? undefined : now,
  }), { reason: 'toggle-pinned', targetId: target.id });
}

function restoreLearningTarget(target: LearningTarget) {
  updateEntry(getStateSnapshot(), target, (entry) => {
    const next: LearningTargetStateEntry = {
      pinnedAt: entry.pinnedAt,
    };
    return next.pinnedAt ? next : null;
  }, { reason: 'restore', targetId: target.id });
}

function clearLearningTarget(target: LearningTarget) {
  updateEntry(getStateSnapshot(), target, () => null, { reason: 'clear', targetId: target.id });
}

export const learningTargetStateStore = {
  getSnapshot: getStateSnapshot,
  subscribe: subscribeState,
  notNow: notNowLearningTarget,
  hideToday: hideLearningTargetToday,
  markDone: markLearningTargetDone,
  togglePinned: toggleLearningTargetPinned,
  restore: restoreLearningTarget,
  clearState: clearLearningTarget,
};

export function useLearningTargetState() {
  const state = useSyncExternalStore(
    learningTargetStateStore.subscribe,
    learningTargetStateStore.getSnapshot,
    () => EMPTY_LEARNING_TARGET_STATE,
  );

  const notNow = useCallback((target: LearningTarget) => {
    learningTargetStateStore.notNow(target);
  }, []);

  const hideToday = useCallback((target: LearningTarget) => {
    learningTargetStateStore.hideToday(target);
  }, []);

  const markDone = useCallback((target: LearningTarget) => {
    learningTargetStateStore.markDone(target);
  }, []);

  const togglePinned = useCallback((target: LearningTarget) => {
    learningTargetStateStore.togglePinned(target);
  }, []);

  const restore = useCallback((target: LearningTarget) => {
    learningTargetStateStore.restore(target);
  }, []);

  const clearState = useCallback((target: LearningTarget) => {
    learningTargetStateStore.clearState(target);
  }, []);

  return useMemo(() => ({
    state,
    notNow,
    hideToday,
    markDone,
    togglePinned,
    restore,
    clearState,
  }), [clearState, hideToday, markDone, notNow, restore, state, togglePinned]);
}
