import {
  learningTargetEyebrow,
  learningTargetWhyNow,
  type LearningTarget,
} from '../learning-targets';
import {
  learningTargetReturnLabel,
  type LearningTargetState,
} from '../learning-target-state';

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
