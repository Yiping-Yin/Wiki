'use client';

import { emitBroadcastEvent, ensureBroadcastSubscription } from '../shared/event-bus';

export const PANEL_CHANGE_EVENT = 'loom:panel:changed';
const PANEL_CHANGE_CHANNEL = 'loom:panel:changed:bc';

export type PanelChangeDetail = {
  docIds?: string[];
  reason?: string;
};

export function emitPanelChange(detail?: PanelChangeDetail) {
  emitBroadcastEvent({ channelName: PANEL_CHANGE_CHANNEL, eventName: PANEL_CHANGE_EVENT }, detail);
}

ensureBroadcastSubscription<PanelChangeDetail>({
  channelName: PANEL_CHANGE_CHANNEL,
  eventName: PANEL_CHANGE_EVENT,
});
