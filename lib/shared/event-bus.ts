'use client';

type EventBusConfig<TDetail> = {
  channelName: string;
  eventName: string;
};

const subscribedChannels = new Set<string>();

export function emitBroadcastEvent<TDetail>(
  config: EventBusConfig<TDetail>,
  detail?: TDetail,
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(config.eventName, { detail }));
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(config.channelName);
  channel.postMessage(detail ?? null);
  channel.close();
}

export function ensureBroadcastSubscription<TDetail>(
  config: EventBusConfig<TDetail>,
) {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  if (subscribedChannels.has(config.channelName)) return;
  subscribedChannels.add(config.channelName);
  const channel = new BroadcastChannel(config.channelName);
  channel.addEventListener('message', (event) => {
    window.dispatchEvent(new CustomEvent(config.eventName, { detail: event.data ?? undefined }));
  });
}
