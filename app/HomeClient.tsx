'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { QuietScene, QuietSceneColumn } from '../components/QuietScene';
import { QuietSceneIntro } from '../components/QuietSceneIntro';
import { StageShell } from '../components/StageShell';
import {
  type HomeForegroundContent,
  HomeForegroundObject,
  HomeQueueStateList,
  HomeRecentThreadsList,
  HomeResolvedList,
  HomeSupportSection,
} from '../components/home/HomeWorkbenchSections';
import {
  buildHomeForegroundActions,
  buildHomeForegroundDraft,
  buildHomeGuideMeta,
  buildHomeRecentThreads,
} from '../components/home/homeWorkbenchModel';
import { useHomeWorkbenchData } from '../components/home/useHomeWorkbenchData';
import { useHistory } from '../lib/use-history';
import {
  applyLearningTargetState,
  collectLearningTargetQueue,
  learningTargetReturnLabel,
  useLearningTargetState,
} from '../lib/learning-target-state';
import {
  buildLearningTargets,
  learningTargetActionLabel,
  learningTargetSecondaryLabel,
  learningTargetWhyNow,
  openLearningTarget,
  openLearningTargetSource,
} from '../lib/learning-targets';
import { isRenderablePanel, useAllPanels } from '../lib/panel';
import { openShuttle } from '../lib/shuttle';
import { useAllWeaves } from '../lib/weave';
import {
  applyLastCompletedSessionSignal,
  resolvedOutcomesForDisplay,
  useWorkSession,
} from '../lib/work-session';

export function HomeClient() {
  const router = useRouter();
  const [history] = useHistory();
  const { docsById } = useHomeWorkbenchData();
  const { panels } = useAllPanels();
  const { weaves } = useAllWeaves();
  const targetState = useLearningTargetState();
  const workSession = useWorkSession();

  const baseTargets = useMemo(
    () => buildLearningTargets({ panels: panels.filter(isRenderablePanel), weaves }),
    [panels, weaves],
  );
  const rawTargets = useMemo(
    () => applyLastCompletedSessionSignal(baseTargets, workSession.lastCompletedSession),
    [baseTargets, workSession.lastCompletedSession],
  );
  const visibleTargets = useMemo(
    () => applyLearningTargetState(rawTargets, targetState.state),
    [rawTargets, targetState.state],
  );
  const focusTarget = visibleTargets[0] ?? null;
  const queue = useMemo(
    () => collectLearningTargetQueue(
      rawTargets,
      targetState.state,
      focusTarget ? { excludeIds: new Set([focusTarget.id]) } : undefined,
    ),
    [focusTarget, rawTargets, targetState.state],
  );
  const resolvedOutcomes = useMemo(
    () => resolvedOutcomesForDisplay(workSession.lastCompletedSession).slice(0, 3),
    [workSession.lastCompletedSession],
  );

  const recentThreads = useMemo(() => buildHomeRecentThreads(history, docsById, 4), [docsById, history]);

  const queueCount =
    queue.pinned.length
    + queue.snoozed.length
    + queue.hiddenToday.length
    + queue.done.length;
  const hasQueue = queueCount > 0;
  const hasResolved = resolvedOutcomes.length > 0;
  const hasRecentThreads = recentThreads.length > 0;

  const guideMeta = useMemo(() => buildHomeGuideMeta({
    recentCount: recentThreads.length,
    resolvedCount: resolvedOutcomes.length,
    queueCount,
  }), [queueCount, recentThreads.length, resolvedOutcomes.length]);

  const foregroundActions = useMemo(() => buildHomeForegroundActions({
    hasFocusTarget: Boolean(focusTarget),
    primaryLabel: focusTarget ? learningTargetActionLabel(focusTarget.action) : null,
    secondaryLabel: focusTarget ? learningTargetSecondaryLabel(focusTarget) : null,
  }), [focusTarget]);

  const foreground = useMemo<HomeForegroundContent>(() => {
    const draft = buildHomeForegroundDraft({
      guideMeta,
      focusTitle: focusTarget?.title ?? null,
      focusSummary: focusTarget ? (focusTarget.preview || focusTarget.reason) : null,
      whyNowDetail: focusTarget
        ? `Why now · ${[learningTargetReturnLabel(focusTarget, targetState.state), learningTargetWhyNow(focusTarget)].filter(Boolean).join(' · ')}`
        : null,
    });

    return {
      eyebrow: draft.eyebrow,
      title: draft.title,
      meta: <span>{guideMeta}</span>,
      summary: draft.summary,
      detail: (
        <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 6 }}>
          {draft.detail}
        </div>
      ),
      actions: foregroundActions.map((action) => {
        switch (action.kind) {
          case 'focus-primary':
            return {
              label: action.label,
              onClick: () => openLearningTarget(router, focusTarget!),
              primary: true,
            };
          case 'focus-secondary':
            return {
              label: action.label,
              onClick: () => openLearningTargetSource(router, focusTarget!),
            };
          case 'open-atlas':
            return { label: action.label, href: '/knowledge' };
          case 'open-today':
            return { label: action.label, href: '/today' };
          case 'open-shuttle':
          default:
            return {
              label: action.label,
              onClick: () => openShuttle(),
              primary: action.primary,
            };
        }
      }),
    };
  }, [focusTarget, foregroundActions, guideMeta, router, targetState.state]);

  return (
    <StageShell
      variant="working"
      contentVariant="working"
      innerStyle={{ minHeight: '100vh', paddingTop: '4.9rem', paddingBottom: '2.4rem' }}
    >
      <QuietScene tone="home">
        <QuietSceneColumn className="loom-home-workbench__column">
          <QuietSceneIntro
            eyebrow="Observation deck"
            title="One foreground object. The rest stays quiet."
            summary="Sidebar holds the Atlas. Shuttle moves anywhere. This desk keeps the next quiet move legible."
          />
        </QuietSceneColumn>

        <QuietSceneColumn className="loom-home-workbench__column">
          <HomeForegroundObject {...foreground} />
        </QuietSceneColumn>

        <QuietSceneColumn className="loom-home-workbench__column">
          <div className="loom-home-support-stack">
            {hasResolved ? (
              <HomeSupportSection
                eyebrow="Resolved recently"
                title="Completed moves stay nearby, but quiet."
              >
                <HomeResolvedList items={resolvedOutcomes} />
              </HomeSupportSection>
            ) : null}

            {hasQueue ? (
              <HomeSupportSection
                eyebrow="Queue state"
                title="Deferred work stays below the foreground object."
              >
                <HomeQueueStateList
                  queue={queue}
                  onRestore={(target) => targetState.restore(target)}
                  onTogglePinned={(target) => targetState.togglePinned(target)}
                />
              </HomeSupportSection>
            ) : null}

            {hasRecentThreads ? (
              <HomeSupportSection
                eyebrow="Recent threads"
                title="Return paths stay visible after the work settles."
                aside="Quiet resume threads, not a second navigation layer."
              >
                <HomeRecentThreadsList items={recentThreads} />
              </HomeSupportSection>
            ) : null}
          </div>
        </QuietSceneColumn>
      </QuietScene>
    </StageShell>
  );
}
