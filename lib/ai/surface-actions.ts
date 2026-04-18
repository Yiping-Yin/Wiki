'use client';

export type LoomOverlayId = 'rehearsal' | 'examiner' | 'ingestion' | 'recursing';

type LoomOverlayDetail = {
  id: LoomOverlayId;
  seedDraft?: string;
  seedLabel?: string;
};

const OVERLAY_OPEN_EVENT = 'loom:overlay:open';
const OVERLAY_TOGGLE_EVENT = 'loom:overlay:toggle';
const REVIEW_SET_ACTIVE_EVENT = 'loom:review:set-active';
const REVIEW_FOCUS_THOUGHT_EVENT = 'loom:review:focus-thought';

function dispatch(eventName: string, detail: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

function nextFrame(fn: () => void) {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(fn);
}

export function closeLoomOverlays() {
  dispatch(OVERLAY_OPEN_EVENT, { id: '__none__' });
}

export function setLoomReviewActive(active: boolean) {
  dispatch(REVIEW_SET_ACTIVE_EVENT, { active });
}

export function focusLoomReviewThought(anchorId: string) {
  dispatch(REVIEW_FOCUS_THOUGHT_EVENT, { anchorId });
}

export function openLoomReview(anchorId?: string | null) {
  closeLoomOverlays();
  setLoomReviewActive(true);
  if (anchorId) {
    nextFrame(() => focusLoomReviewThought(anchorId));
  }
}

export function openLoomOverlay(detail: LoomOverlayDetail) {
  dispatch(OVERLAY_OPEN_EVENT, { id: detail.id });
  nextFrame(() => dispatch(OVERLAY_TOGGLE_EVENT, detail));
}

export function replaceLoomOverlay(detail: LoomOverlayDetail) {
  closeLoomOverlays();
  nextFrame(() => openLoomOverlay(detail));
}
