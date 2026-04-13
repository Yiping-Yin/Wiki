export const OVERLAY_RESUME_KEY = 'loom:overlay:resume';

export type OverlayResumePayload = {
  href: string;
  overlay: 'rehearsal' | 'examiner';
};
