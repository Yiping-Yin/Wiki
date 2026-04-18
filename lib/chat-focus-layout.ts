export type ChatFocusPosition = {
  top: number;
  left: number;
  width: number;
};

export function computeChatFocusPosition(args: {
  blockBottom: number;
  proseLeft: number;
  proseWidth: number;
  proseMaxWidth?: string | number | null;
  scrollX: number;
  scrollY: number;
  gap?: number;
}): ChatFocusPosition {
  const {
    blockBottom,
    proseLeft,
    proseWidth,
    proseMaxWidth,
    scrollX,
    scrollY,
    gap = 16,
  } = args;

  const parsedMaxWidth =
    typeof proseMaxWidth === 'number'
      ? proseMaxWidth
      : Number.parseFloat(String(proseMaxWidth ?? ''));

  const desiredWidth = Number.isFinite(parsedMaxWidth) && parsedMaxWidth > 0
    ? Math.min(proseWidth, parsedMaxWidth)
    : proseWidth;

  return {
    top: blockBottom + scrollY + gap,
    left: proseLeft + scrollX + Math.max(0, (proseWidth - desiredWidth) / 2),
    width: desiredWidth,
  };
}
