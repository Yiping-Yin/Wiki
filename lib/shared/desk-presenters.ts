import {
  learningTargetActionLabel,
  learningTargetEyebrow,
  learningTargetSecondaryLabel,
  learningTargetWhyNow,
  type LearningTarget,
} from '../learning-targets';
import {
  learningTargetReturnLabel,
  type LearningTargetState,
} from '../learning-target-state';
import {
  resolutionKindLabel,
  type WorkSessionOutcome,
} from '../work-session';

export type DeskFocusTargetPresenter = {
  eyebrow: string;
  title: string;
  meta: string;
  summary: string;
  detail: string | null;
};

export type DeskEmptyPresenter = {
  eyebrow: string;
  title: string;
  summary: string;
  detail: string | null;
};

export type DeskLearningTargetPresenter = {
  title: string;
  summary: string;
  whyNow: string | null;
  returnLabel: string | null;
  primaryActionLabel: string;
  secondaryActionLabel: string;
  pinLabel: string;
};

export type DeskResolvedOutcomePresenter = {
  title: string;
  meta: string;
  actionLabel: string;
};

export function buildDeskFocusTargetPresenter({
  target,
  learningTargetState,
  meta,
  eyebrow = learningTargetEyebrow(target),
  now,
}: {
  target: LearningTarget;
  learningTargetState: LearningTargetState;
  meta: string;
  eyebrow?: string;
  now?: number;
}): DeskFocusTargetPresenter {
  const summary = target.preview || target.reason;
  const whyNow = [learningTargetReturnLabel(target, learningTargetState, now), learningTargetWhyNow(target)]
    .filter(Boolean)
    .join(' · ');

  return {
    eyebrow,
    title: target.title,
    meta,
    summary,
    detail: summary ? `Why now · ${whyNow}` : null,
  };
}

export function buildDeskEmptyPresenter({
  eyebrow,
  title,
  summary,
  detail,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  detail?: string | null;
}): DeskEmptyPresenter {
  return {
    eyebrow,
    title,
    summary,
    detail: detail ?? null,
  };
}

export function buildDeskLearningTargetPresenter({
  target,
  learningTargetState,
  isPinned = false,
  now,
}: {
  target: LearningTarget;
  learningTargetState: LearningTargetState;
  isPinned?: boolean;
  now?: number;
}): DeskLearningTargetPresenter {
  const summary = target.preview || target.reason;
  const whyNow = learningTargetWhyNow(target);
  const returnLabel = learningTargetReturnLabel(target, learningTargetState, now);

  return {
    title: target.title,
    summary,
    whyNow: whyNow ? `Why now · ${whyNow}` : null,
    returnLabel: returnLabel ? `Returned · ${returnLabel}` : null,
    primaryActionLabel: learningTargetActionLabel(target.action),
    secondaryActionLabel: learningTargetSecondaryLabel(target),
    pinLabel: isPinned ? 'Unpin' : 'Pin',
  };
}

export function buildDeskResolvedOutcomePresenter(
  item: Pick<WorkSessionOutcome, 'resolvedLabel' | 'resolutionKind' | 'targetSnapshot'>,
): DeskResolvedOutcomePresenter {
  return {
    title: item.targetSnapshot.title,
    meta: `${item.resolvedLabel} · ${resolutionKindLabel(item.resolutionKind)} · Resolved for this change`,
    actionLabel: 'Reopen',
  };
}
