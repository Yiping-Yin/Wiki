type MirrorWindow = Window & {
  __loomNativeStore?: Record<string, unknown>;
  webkit?: { messageHandlers?: Record<string, unknown> };
};

function getMirrorWindow(): MirrorWindow | null {
  if (typeof window === 'undefined') return null;
  return window as MirrorWindow;
}

function hasNativeMessageHandlers(win: MirrorWindow): boolean {
  const handlers = win.webkit?.messageHandlers;
  return Boolean(handlers && Reflect.ownKeys(handlers).length > 0);
}

export function readLoomMirror<T>(
  storageKey: string,
  parse: (raw: unknown) => T,
  fallback: T,
): T {
  const win = getMirrorWindow();
  if (!win) return fallback;

  const nativeStore = win.__loomNativeStore;
  if (nativeStore && Object.prototype.hasOwnProperty.call(nativeStore, storageKey)) {
    try {
      return parse(nativeStore[storageKey]);
    } catch {
      return fallback;
    }
  }

  if (hasNativeMessageHandlers(win)) {
    return fallback;
  }

  try {
    const raw = win.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    return parse(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function subscribeLoomMirror(
  storageKey: string,
  eventName: string,
  refresh: () => void,
): () => void {
  const win = getMirrorWindow();
  if (!win) return () => {};

  const onStorage = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key === storageKey) refresh();
  };

  win.addEventListener(eventName, refresh);
  if (!hasNativeMessageHandlers(win)) {
    win.addEventListener('storage', onStorage);
  }

  return () => {
    win.removeEventListener(eventName, refresh);
    win.removeEventListener('storage', onStorage);
  };
}
