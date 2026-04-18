'use client';

import { emitBroadcastEvent, ensureBroadcastSubscription } from './shared/event-bus';

export const LEARNING_TARGET_STATE_CHANGE_EVENT = 'loom:learning-target-state:changed';
const LEARNING_TARGET_STATE_CHANNEL = 'loom:learning-target-state:changed:bc';

export type LearningTargetStateChangeDetail = {
  targetId?: string;
  reason?: 'not-now' | 'hide-today' | 'done' | 'toggle-pinned' | 'restore' | 'clear';
};

export function emitLearningTargetStateChange(detail?: LearningTargetStateChangeDetail) {
  emitBroadcastEvent(
    {
      channelName: LEARNING_TARGET_STATE_CHANNEL,
      eventName: LEARNING_TARGET_STATE_CHANGE_EVENT,
    },
    detail,
  );
}

ensureBroadcastSubscription<LearningTargetStateChangeDetail>({
  channelName: LEARNING_TARGET_STATE_CHANNEL,
  eventName: LEARNING_TARGET_STATE_CHANGE_EVENT,
});
