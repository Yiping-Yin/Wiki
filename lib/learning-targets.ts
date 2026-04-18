'use client';

import type { Weave } from './weave';
import type { Panel } from './panel';
import type { LearningNextAction } from './learning-status';
import { panelRevisionCount } from './panel';
import { weaveRevisionCount, weaveRevisionLabel } from './weave';
import { continuePanelLifecycle, openPanelReview, setOverlayResume } from './panel-resume';

type RouterLike = { push: (href: string) => void };

export type LearningTargetKind = 'panel' | 'weave';
export type LearningTargetAction =
  | 'capture'
  | 'rehearse'
  | 'examine'
  | 'revisit'
  | 'refresh'
  | 'strengthen-relation'
  | 'question-relation'
  | 'review-relation';

export type LearningTarget = {
  id: string;
  kind: LearningTargetKind;
  title: string;
  preview: string;
  touchedAt: number;
  action: LearningTargetAction;
  priority: number;
  priorityReasons: string[];
  href: string;
  sourceHref: string;
  latestAnchorId?: string | null;
  docId: string;
  relationId?: string;
  relationAction?: 'strengthen' | 'question' | 'review';
  reentryHint?: 'panel-review' | 'panel-revision-diff' | 'weave-focused-review' | 'weave-focused-question';
  reason: string;
  changeToken: string;
  revisionCount: number;
  openTensionCount: number;
  statusKey: string;
};

function signatureForLines(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean).sort().join('|');
}

function weaveTouchedAt(weave: Weave) {
  return Math.max(
    weave.updatedAt,
    weave.contractUpdatedAt,
    ...weave.evidence.map((item) => item.at),
  );
}

function weavePreview(weave: Weave) {
  return weave.claim || weave.whyItHolds || weave.evidence[0]?.snippet || '';
}

export function buildPanelLearningTarget(panel: Panel): LearningTarget {
  const action = panel.status === 'contested'
    ? 'revisit'
    : panel.learning.nextAction;
  const priorityReasons: string[] = [];
  let priority = 0;
  if (panel.status === 'contested') {
    priority += 100;
    priorityReasons.push('Panel is contested');
  } else if (panel.learning.nextAction === 'rehearse') {
    priority += 80;
    priorityReasons.push('Needs another written pass');
  } else if (panel.learning.nextAction === 'examine') {
    priority += 70;
    priorityReasons.push('Ready to verify');
  } else if (panel.learning.nextAction === 'refresh') {
    priority += 60;
    priorityReasons.push('Panel has gone cold');
  } else if (panel.learning.nextAction === 'revisit') {
    priority += 50;
    priorityReasons.push('Panel should be reviewed');
  } else {
    priority += 30;
    priorityReasons.push('Panel remains open');
  }
  if (panel.learning.recency === 'stale') priorityReasons.push('Stale recency');
  if (panel.revisions.length > 1) {
    priorityReasons.push(`Has ${panel.revisions.length - 1} revision${panel.revisions.length - 1 === 1 ? '' : 's'}`);
  }

  return {
    id: `panel:${panel.docId}`,
    kind: 'panel',
    title: panel.title,
    preview: panel.summary,
    touchedAt: panel.learning.touchedAt,
    action,
    priority,
    priorityReasons,
    href: panel.href,
    sourceHref: panel.href,
    latestAnchorId: panel.latestAnchorId,
    docId: panel.docId,
    reason: panel.status === 'contested'
      ? 'Panel is in revision'
      : panel.learning.nextAction === 'refresh'
        ? 'Panel has gone cold'
        : panel.learning.nextAction === 'rehearse'
          ? 'Panel needs another written pass'
          : panel.learning.nextAction === 'examine'
          ? 'Panel is ready to verify'
            : 'Panel is ready to review',
    changeToken: `panel:${panel.docId}:${panel.status}:${panel.revisions.reduce((max, item) => Math.max(max, item.at), 0)}:${signatureForLines(panel.openTensions)}`,
    reentryHint: panel.status === 'contested' ? 'panel-review' : undefined,
    revisionCount: panelRevisionCount({ revisions: panel.revisions }),
    openTensionCount: panel.openTensions.length,
    statusKey: panel.status,
  };
}

export function buildWeaveLearningTarget(
  weave: Weave,
  panels: Panel[],
): LearningTarget | null {
  if (weave.status === 'rejected') return null;
  const panelById = new Map(panels.map((panel) => [panel.docId, panel] as const));
  const fromPanel = panelById.get(weave.fromPanelId);
  const toPanel = panelById.get(weave.toPanelId);
  if (!fromPanel || !toPanel) return null;

  let action: LearningTargetAction | null = null;
  let relationAction: LearningTarget['relationAction'] | undefined;
  let reason = '';
  const priorityReasons: string[] = [];
  let priority = 0;

  if (weave.status === 'suggested') {
    action = 'question-relation';
    relationAction = 'question';
    reason = 'Suggested relation still needs judgment';
    priority = 110;
    priorityReasons.push('Suggested relation needs judgment');
  } else if (weave.openTensions.length > 0) {
    action = 'strengthen-relation';
    relationAction = 'strengthen';
    reason = 'Relation still carries an open tension';
    priority = 95;
    priorityReasons.push('Open relation tension');
  } else if (weaveRevisionLabel(weave)) {
    action = 'review-relation';
    relationAction = 'review';
    reason = 'Relation has changed and should be reviewed';
    priority = 75;
    priorityReasons.push(`Relation has ${weave.revisions.length - 1} revision${weave.revisions.length - 1 === 1 ? '' : 's'}`);
  }

  if (!action || !relationAction) return null;
  if (fromPanel.status === 'contested' || toPanel.status === 'contested') {
    priority += 10;
    priorityReasons.push('Touches a contested panel');
  }
  if (weave.evidence.length <= 1) {
    priorityReasons.push('Single evidence thread');
  }

  return {
    id: `weave:${weave.id}`,
    kind: 'weave',
    title: `${fromPanel.title} -> ${toPanel.title}`,
    preview: weavePreview(weave),
    touchedAt: weaveTouchedAt(weave),
    action,
    priority,
    priorityReasons,
    href: `/graph?focus=${encodeURIComponent(fromPanel.docId)}&relation=${encodeURIComponent(weave.id)}&relationAction=${relationAction}`,
    sourceHref: fromPanel.href,
    latestAnchorId: fromPanel.latestAnchorId,
    docId: fromPanel.docId,
    relationId: weave.id,
    relationAction,
    reentryHint: relationAction === 'question' ? 'weave-focused-question' : relationAction === 'review' ? 'weave-focused-review' : undefined,
    reason,
    changeToken: `weave:${weave.id}:${weave.status}:${weave.revisions.reduce((max, item) => Math.max(max, item.at), 0)}:${signatureForLines(weave.openTensions)}`,
    revisionCount: weaveRevisionCount({ revisions: weave.revisions }),
    openTensionCount: weave.openTensions.length,
    statusKey: weave.status,
  };
}

export function buildLearningTargets({
  panels,
  weaves,
}: {
  panels: Panel[];
  weaves: Weave[];
}): LearningTarget[] {
  const targets: LearningTarget[] = [];

  for (const panel of panels) {
    targets.push(buildPanelLearningTarget(panel));
  }

  for (const weave of weaves) {
    const target = buildWeaveLearningTarget(weave, panels);
    if (target) targets.push(target);
  }

  return targets.sort((a, b) => b.priority - a.priority || b.touchedAt - a.touchedAt);
}

export function learningTargetActionLabel(action: LearningTargetAction) {
  switch (action) {
    case 'refresh': return 'Return';
    case 'rehearse': return 'Write';
    case 'examine': return 'Ask';
    case 'capture': return 'Open';
    case 'strengthen-relation': return 'Strengthen';
    case 'question-relation': return 'Question';
    case 'review-relation': return 'Review relation';
    default: return 'Review';
  }
}

export function learningTargetEyebrow(target: LearningTarget) {
  return target.kind === 'weave' ? 'Work this relation' : 'Keep this panel warm';
}

export function learningTargetSecondaryLabel(target: LearningTarget) {
  return target.kind === 'weave' ? 'Open graph' : 'Open source';
}

export function learningTargetWhyNow(target: LearningTarget, limit = 2) {
  const reasons = target.priorityReasons.filter(Boolean).slice(0, limit);
  if (reasons.length > 0) return reasons.join(' · ');
  return target.reason;
}

export function openLearningTarget(router: RouterLike, target: LearningTarget) {
  if (target.kind === 'weave') {
    if (target.reentryHint === 'weave-focused-question' && target.relationId) {
      router.push(`/graph?focus=${encodeURIComponent(target.docId)}&relation=${encodeURIComponent(target.relationId)}&relationAction=question`);
      return;
    }
    if (target.reentryHint === 'weave-focused-review' && target.relationId) {
      router.push(`/graph?focus=${encodeURIComponent(target.docId)}&relation=${encodeURIComponent(target.relationId)}&relationAction=review`);
      return;
    }
    router.push(target.href);
    return;
  }

  if (target.reentryHint === 'panel-review') {
    openPanelReview(router, { href: target.href, anchorId: target.latestAnchorId ?? null });
    return;
  }

  if (target.reentryHint === 'panel-revision-diff') {
    openPanelReview(router, {
      href: target.href,
      anchorId: target.latestAnchorId ?? null,
      focusRevisionDiff: true,
    });
    return;
  }

  if (target.action === 'revisit') {
    openPanelReview(router, { href: target.href, anchorId: target.latestAnchorId ?? null });
    return;
  }

  const nextAction = target.action as LearningNextAction;
  continuePanelLifecycle(router, {
    href: target.href,
    nextAction,
    latestAnchorId: target.latestAnchorId ?? null,
    refreshSource: 'today',
  });
}

export function openLearningTargetSource(router: RouterLike, target: LearningTarget) {
  if (target.kind === 'weave') {
    router.push(target.sourceHref);
    return;
  }
  router.push(target.href);
}
