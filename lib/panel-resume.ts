import { OVERLAY_RESUME_KEY, type OverlayResumePayload } from './overlay-resume';
import { REFRESH_RESUME_KEY, type RefreshResumePayload } from './refresh-resume';
import { REVIEW_RESUME_KEY, type ReviewResumePayload } from './review-resume';
import type { LearningSurfaceSummary } from './learning-status';

type RouterLike = {
  push: (href: string) => void;
};

export function setReviewResume(payload: ReviewResumePayload) {
  try {
    sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(payload));
  } catch {}
}

export function setRefreshResume(review: ReviewResumePayload, refresh: RefreshResumePayload) {
  try {
    sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(review));
    sessionStorage.setItem(REFRESH_RESUME_KEY, JSON.stringify(refresh));
  } catch {}
}

export function setOverlayResume(payload: OverlayResumePayload) {
  try {
    sessionStorage.setItem(OVERLAY_RESUME_KEY, JSON.stringify(payload));
  } catch {}
}

export function continuePanelLifecycle(
  router: RouterLike,
  {
    href,
    nextAction,
    latestAnchorId,
    refreshSource,
  }: {
    href: string;
    nextAction: LearningSurfaceSummary['nextAction'];
    latestAnchorId?: string | null;
    refreshSource: RefreshResumePayload['source'];
  },
) {
  if (nextAction === 'refresh') {
    setRefreshResume(
      { href, anchorId: latestAnchorId ?? null },
      { href, source: refreshSource },
    );
    router.push(href);
    return;
  }

  if (nextAction === 'rehearse' || nextAction === 'examine') {
    setOverlayResume({
      href,
      overlay: nextAction === 'rehearse' ? 'rehearsal' : 'examiner',
    });
    router.push(href);
    return;
  }

  if (nextAction === 'revisit') {
    setReviewResume({ href, anchorId: latestAnchorId ?? null });
    router.push(href);
    return;
  }

  router.push(href);
}
