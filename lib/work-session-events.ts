'use client';

import { emitBroadcastEvent, ensureBroadcastSubscription } from './shared/event-bus';

export const WORK_SESSION_CHANGE_EVENT = 'loom:work-session:changed';
const WORK_SESSION_CHANNEL = 'loom:work-session:changed:bc';

export type WorkSessionChangeDetail = {
  reason?:
    | 'start'
    | 'set-resolution'
    | 'record-outcome'
    | 'clear'
    | 'last-completed';
  targetId?: string;
};

export function emitWorkSessionChange(detail?: WorkSessionChangeDetail) {
  emitBroadcastEvent(
    {
      channelName: WORK_SESSION_CHANNEL,
      eventName: WORK_SESSION_CHANGE_EVENT,
    },
    detail,
  );
}

ensureBroadcastSubscription<WorkSessionChangeDetail>({
  channelName: WORK_SESSION_CHANNEL,
  eventName: WORK_SESSION_CHANGE_EVENT,
});
