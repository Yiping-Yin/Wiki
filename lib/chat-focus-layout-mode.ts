import type { ChatFocusStage } from './chat-focus-stage';

export type ChatFocusLayoutMode = 'stacked' | 'split';

export function resolveChatFocusLayoutMode(args: {
  smallScreen: boolean;
  stage: ChatFocusStage;
}): ChatFocusLayoutMode {
  if (args.smallScreen) return 'stacked';
  return args.stage === 'accumulate' ? 'split' : 'stacked';
}
