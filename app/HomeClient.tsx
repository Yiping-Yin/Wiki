'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LearningTargetQueueState } from '../components/LearningTargetQueueState';
import { QuietScene, QuietSceneColumn } from '../components/QuietScene';
import { QuietSceneIntro } from '../components/QuietSceneIntro';
import { StageShell } from '../components/StageShell';
import {
  HomeForegroundObject,
  HomeRecentThreadsList,
  HomeResolvedList,
  HomeSupportSection,
} from '../components/home/HomeWorkbenchSections';
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

type IndexDoc = { id: string; title: string; href: string; category: string };
type ResumeItem = { id: string; title: string; href: string; viewedAt: number; category: string };

let indexCache: IndexDoc[] | null = null;

async function loadDocs(): Promise<IndexDoc[]> {
  if (indexCache) return indexCache;
  try {
    const response = await fetch('/api/search-index');
    if (!response.ok) return [];
    const payload = await response.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const docs: IndexDoc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      docs.push({
        id: String(docIds[internal] ?? internal),
        title: fields.title,
        href: fields.href,
        category: fields.category ?? '',
      });
    }
    indexCache = docs;
    return docs;
  } catch {
    return [];
  }
}

export function HomeClient() {
  const router = useRouter();
  const [history] = useHistory();
  const [docs, setDocs] = useState<IndexDoc[]>([]);
  const { panels } = useAllPanels();
  const { weaves } = useAllWeaves();
  const targetState = useLearningTargetState();
  const workSession = useWorkSession();

  useEffect(() => {
    loadDocs().then(setDocs);
  }, []);

  const docsById = useMemo(() => {
    const map = new Map<string, IndexDoc>();
    for (const doc of docs) map.set(doc.id, doc);
    return map;
  }, [docs]);

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

  const recentThreads = useMemo(() => {
    const seen = new Set<string>();
    const items: ResumeItem[] = [];
    for (const entry of history) {
      if (seen.has(entry.id) || items.length >= 4) continue;
      seen.add(entry.id);
      const meta = docsById.get(entry.id);
      items.push({
        id: entry.id,
        title: meta?.title ?? entry.title,
        href: meta?.href ?? entry.href,
        viewedAt: entry.viewedAt,
        category: meta?.category ?? '',
      });
    }
    return items;
  }, [docsById, history]);

  const queueCount =
    queue.pinned.length
    + queue.snoozed.length
    + queue.hiddenToday.length
    + queue.done.length;
  const hasQueue = queueCount > 0;
  const hasResolved = resolvedOutcomes.length > 0;
  const hasRecentThreads = recentThreads.length > 0;

  const guideMeta = [
    hasRecentThreads ? `${recentThreads.length} recent thread${recentThreads.length === 1 ? '' : 's'}` : 'Desk is quiet',
    hasResolved ? `${resolvedOutcomes.length} resolved` : null,
    hasQueue ? `${queueCount} in queue` : null,
  ].filter(Boolean).join(' · ');

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
          <HomeForegroundObject
            eyebrow={focusTarget ? 'Current return' : 'Quiet surface'}
            title={focusTarget ? focusTarget.title : 'Nothing urgent is asking for attention.'}
            meta={<span>{guideMeta}</span>}
            summary={
              focusTarget
                ? focusTarget.preview || focusTarget.reason
                : 'Open the Shuttle to move anywhere, or enter the Atlas from the Sidebar. Once a source changes, the return appears here.'
            }
            detail={
              <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 6 }}>
                {focusTarget
                  ? `Why now · ${[learningTargetReturnLabel(focusTarget, targetState.state), learningTargetWhyNow(focusTarget)].filter(Boolean).join(' · ')}`
                  : 'The empty state is still a desk: enough structure to begin, without pretending work already exists.'}
              </div>
            }
            actions={
              focusTarget
                ? [
                    {
                      label: learningTargetActionLabel(focusTarget.action),
                      onClick: () => openLearningTarget(router, focusTarget),
                      primary: true,
                    },
                    {
                      label: learningTargetSecondaryLabel(focusTarget),
                      onClick: () => openLearningTargetSource(router, focusTarget),
                    },
                    { label: 'Open Shuttle', onClick: () => openShuttle() },
                  ]
                : [
                    { label: 'Open Shuttle', onClick: () => openShuttle(), primary: true },
                    { label: 'Open Atlas', href: '/knowledge' },
                    { label: 'Open Today', href: '/today' },
                  ]
            }
          />
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
                <LearningTargetQueueState
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
