export function computeDesktopChatFocusSpacer(args: {
  overlayHeight: number;
  gap?: number;
  active: boolean;
  smallScreen: boolean;
}): number {
  if (!args.active || args.smallScreen) return 0;
  return Math.max(0, Math.ceil(args.overlayHeight + (args.gap ?? 16)));
}
