'use client';

import { emitBroadcastEvent, ensureBroadcastSubscription } from '../shared/event-bus';

export const WEAVE_CHANGE_EVENT = 'loom:weave:changed';
const WEAVE_CHANGE_CHANNEL = 'loom:weave:changed:bc';

export type WeaveChangeDetail = {
  docIds?: string[];
  weaveIds?: string[];
  reason?: string;
};

export function emitWeaveChange(detail?: WeaveChangeDetail) {
  emitBroadcastEvent({ channelName: WEAVE_CHANGE_CHANNEL, eventName: WEAVE_CHANGE_EVENT }, detail);
}

ensureBroadcastSubscription<WeaveChangeDetail>({
  channelName: WEAVE_CHANGE_CHANNEL,
  eventName: WEAVE_CHANGE_EVENT,
});
