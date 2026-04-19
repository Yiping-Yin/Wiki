export type SidebarMode = 'hidden' | 'pinned';

export const SIDEBAR_MODE_KEY = 'wiki:sidebar:mode';
export const LEGACY_SIDEBAR_PINNED_KEY = 'wiki:sidebar:pinned';
export const DESKTOP_SIDEBAR_DEFAULT_MIN_WIDTH = 900;

export function defaultSidebarModeForWidth(width: number): SidebarMode {
  return width > DESKTOP_SIDEBAR_DEFAULT_MIN_WIDTH ? 'pinned' : 'hidden';
}

export function resolveInitialSidebarMode(options: {
  storedMode: string | null;
  legacyPinned: string | null;
  viewportWidth: number;
}): SidebarMode {
  const { storedMode, legacyPinned, viewportWidth } = options;

  if (storedMode === 'pinned' || storedMode === 'hidden') {
    return storedMode;
  }

  if (legacyPinned === '1') {
    return 'pinned';
  }

  return defaultSidebarModeForWidth(viewportWidth);
}

export function shouldForcePinnedSidebarForPath(pathname: string | null | undefined): boolean {
  return false;
}
