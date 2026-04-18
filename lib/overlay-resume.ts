export const OVERLAY_RESUME_KEY = 'loom:overlay:resume';

export type OverlayResumePayload = {
  href: string;
  overlay: 'rehearsal' | 'examiner';
  seedDraft?: string;
  seedLabel?: string;
};

type StorageLike = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
};

export function consumeOverlayResume(
  storage: StorageLike,
  {
    href,
    overlay,
  }: {
    href: string;
    overlay: OverlayResumePayload['overlay'];
  },
): OverlayResumePayload | null {
  try {
    const raw = storage.getItem(OVERLAY_RESUME_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as OverlayResumePayload;
    if (payload.overlay !== overlay || payload.href !== href) return null;
    storage.removeItem(OVERLAY_RESUME_KEY);
    return payload;
  } catch {
    return null;
  }
}
