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
  buildHomeGuideMeta,
  buildHomeRecentThreads,
} from '../components/home/homeWorkbenchModel';
import { useHomeWorkbenchData } from '../components/home/useHomeWorkbenchData';
import { useHistory } from '../lib/use-history';
import { useLearningTargetState } from '../lib/learning-target-state';
import {
  buildLearningTargets,
  learningTargetActionLabel,
  learningTargetSecondaryLabel,
  openLearningTarget,
  openLearningTargetSource,
} from '../lib/learning-targets';
import { isRenderablePanel, useAllPanels } from '../lib/panel';
import { openShuttle } from '../lib/shuttle';
import { useAllWeaves } from '../lib/weave';
import { useWorkSession } from '../lib/work-session';
import { assembleDeskFocusTargetActions } from '../lib/shared/desk-actions';
import {
  deriveDeskLearningState,
  deriveDeskQueue,
  deriveDeskResolvedOutcomeItems,
  hasDeskQueue,
} from '../lib/shared/desk-derive';
import { buildDeskEmptyPresenter, buildDeskFocusTargetPresenter } from '../lib/shared/desk-presenters';

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
  const deskState = useMemo(() => deriveDeskLearningState({
    baseTargets,
    learningTargetState: targetState.state,
    lastCompletedSession: workSession.lastCompletedSession,
    session: workSession.session,
  }), [baseTargets, targetState.state, workSession.lastCompletedSession, workSession.session]);
  const visibleTargets = deskState.visibleTargets;
  const focusTarget = visibleTargets[0] ?? null;
  const queue = useMemo(() => deriveDeskQueue({
    rawTargets: deskState.rawTargets,
    learningTargetState: targetState.state,
    excludeIds: focusTarget ? new Set([focusTarget.id]) : undefined,
  }), [deskState.rawTargets, focusTarget, targetState.state]);
  const resolvedOutcomes = useMemo(
    () => deriveDeskResolvedOutcomeItems(workSession.lastCompletedSession, 3),
    [workSession.lastCompletedSession],
  );

  const recentThreads = useMemo(() => buildHomeRecentThreads(history, docsById, 4), [docsById, history]);

  const queueCount =
    queue.pinned.length
    + queue.snoozed.length
    + queue.hiddenToday.length
    + queue.done.length;
  const hasQueue = hasDeskQueue(queue);
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
    const draft = focusTarget
      ? buildDeskFocusTargetPresenter({
          target: focusTarget,
          learningTargetState: targetState.state,
          meta: guideMeta,
          eyebrow: 'Current return',
        })
      : buildDeskEmptyPresenter({
          eyebrow: 'Quiet surface',
          title: 'Nothing urgent is asking for attention.',
          summary: 'Open the Shuttle to move anywhere, or enter the Atlas from the Sidebar. Once a source changes, the return appears here.',
          detail: 'The empty state is still a desk: enough structure to begin, without pretending work already exists.',
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
      actions: focusTarget
        ? [
            ...assembleDeskFocusTargetActions({
              primaryLabel: learningTargetActionLabel(focusTarget.action),
              onPrimary: () => openLearningTarget(router, focusTarget),
              secondaryLabel: learningTargetSecondaryLabel(focusTarget),
              onSecondary: () => openLearningTargetSource(router, focusTarget),
            }),
            { label: 'Open Shuttle', onClick: () => openShuttle() },
          ]
        : foregroundActions.map((action) => {
            switch (action.kind) {
              case 'open-atlas':
                return { label: action.label, href: '/knowledge' };
              case 'open-today':
                return { label: action.label, href: '/today' };
              case 'open-shuttle':
              default:
                return {
                  label: action.label,
                  onClick: () => openShuttle(),
                  primary: action.kind === 'open-shuttle' ? action.primary : undefined,
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
            eyebrow="Home"
            title="One foreground object at a time."
            summary="Sidebar holds the Atlas. Shuttle moves anywhere. This page shows the next action."
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
                title="Completed work, kept in reach."
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
                title="Return paths, after the work completes."
                aside="Resume points, not a navigation menu."
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
