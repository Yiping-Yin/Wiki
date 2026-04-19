export type ChatFocusStage = 'spark' | 'blocked' | 'clarify' | 'accumulate';

export function resolveChatFocusStage(args: {
  turnCount: number;
  streaming: boolean;
  committing: boolean;
  canSend: boolean;
  hasNotice: boolean;
}): ChatFocusStage {
  if (args.turnCount >= 2) return 'accumulate';
  if (args.turnCount >= 1 || args.streaming || args.committing) return 'clarify';
  if (!args.canSend || args.hasNotice) return 'blocked';
  return 'spark';
}
