'use client';

import { emitBroadcastEvent, ensureBroadcastSubscription } from '../shared/event-bus';

export const TRACE_CHANGE_EVENT = 'loom:trace:changed';
const TRACE_CHANGE_CHANNEL = 'loom:trace:changed:bc';

export type TraceChangeDetail = {
  docIds?: string[];
  traceIds?: string[];
  reason?: string;
};

export function emitTraceChange(detail?: TraceChangeDetail) {
  emitBroadcastEvent({ channelName: TRACE_CHANGE_CHANNEL, eventName: TRACE_CHANGE_EVENT }, detail);
}

ensureBroadcastSubscription<TraceChangeDetail>({
  channelName: TRACE_CHANGE_CHANNEL,
  eventName: TRACE_CHANGE_EVENT,
});
