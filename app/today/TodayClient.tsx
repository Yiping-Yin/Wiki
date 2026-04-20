'use client';
/**
 * /today — the daily free-thinking surface.
 *
 * §1, §6, §11 — Loom is not a productivity dashboard. The previous version
 * of this page mounted Apple-Fitness-style daily rings, fire-emoji streaks,
 * GitHub heatmaps, "weak spots" scoring, and three nested hero sections.
 * That entire framing — "close your rings, hit your goals" — is exactly
 * the gamified surveillance UX that §11 forbids and that ChatGPT-style
 * tools mistake for engagement.
 *
 * What /today actually IS: the entry point for *today's thinking*. The
 * GlobalLiveArtifact in <main> already shows the free-mode Live Note for
 * the current date. This page's only job is to surface (a) what you read
 * today, and (b) what you've pinned for later. Nothing else. If neither
 * exists, the page is empty and the artifact below takes the surface.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuietGuideCard } from '../../components/QuietGuideCard';
import { QuietScene, QuietSceneColumn } from '../../components/QuietScene';
import { QuietSceneIntro } from '../../components/QuietSceneIntro';
import { LearningTargetQueueState } from '../../components/LearningTargetQueueState';
import { StageShell } from '../../components/StageShell';
import { WorkEyebrow, WorkSurface } from '../../components/WorkSurface';
import {
  buildLearningTargets,
  learningTargetActionLabel,
  learningTargetSecondaryLabel,
  openLearningTarget,
  openLearningTargetSource,
  type LearningTarget,
} from '../../lib/learning-targets';
import {
  isLearningTargetPinned,
  useLearningTargetState,
} from '../../lib/learning-target-state';
import { useHistory } from '../../lib/use-history';
import { usePins } from '../../lib/use-pins';
import type { RefreshResumePayload } from '../../lib/refresh-resume';
import { openPanelReview, setOverlayResume, setRefreshResume } from '../../lib/panel-resume';
import { isRenderablePanel, useAllPanels } from '../../lib/panel';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../lib/learning-status';
import { useAllTraces, type Trace } from '../../lib/trace';
import { latestVisitAt } from '../../lib/trace/source-bound';
import { useAllWeaves } from '../../lib/weave';
import {
  countTargetsChangedSinceSession,
  resolveWorkSession,
  summarizeChangesSinceSession,
  useWorkSession,
} from '../../lib/work-session';
import {
  deriveDeskLearningState,
  deriveDeskQueue,
  deriveDeskResolvedOutcomeItems,
  hasDeskQueue,
} from '../../lib/shared/desk-derive';
import { assembleDeskFocusTargetActions } from '../../lib/shared/desk-actions';
import {
  buildDeskEmptyPresenter,
  buildDeskFocusTargetPresenter,
  buildDeskLearningTargetPresenter,
  buildDeskResolvedOutcomePresenter,
} from '../../lib/shared/desk-presenters';
import { DueForReview } from '../../components/unified/DueForReview';

type DocLite = {
  id: string;
  title: string;
  href: string;
  category: string;
  categorySlug: string;
  subcategory: string;
  subOrder: number;
  preview: string;
};

type StudySurface = {
  id: string;
  docId: string;
  title: string;
  href: string;
  pinned: boolean;
  viewedAt: number;
  touchedAt: number;
  kind: 'knowledge' | 'wiki' | 'upload' | 'other';
  learning: LearningSurfaceSummary;
  latestSummary: string;
  latestQuote?: string;
  preview: string;
};

export function TodayClient({
  totalDocs: _totalDocs,
  docsLite,
  daily: _daily,
}: {
  totalDocs: number;
  docsLite: DocLite[];
  daily: unknown;
}) {
  const router = useRouter();
  const [history] = useHistory();
  const { pins } = usePins();
  const { traces } = useAllTraces();
  const { panels } = useAllPanels();
  const { weaves } = useAllWeaves();
  const targetState = useLearningTargetState();
  const workSession = useWorkSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const docsById = useMemo(() => {
    const m = new Map<string, DocLite>();
    for (const d of docsLite) m.set(d.id, d);
    return m;
  }, [docsLite]);

  const viewedByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      map.set(entry.id, Math.max(map.get(entry.id) ?? 0, entry.viewedAt));
    }
    return map;
  }, [history]);

  const pinnedByDocId = useMemo(() => {
    const map = new Set<string>();
    for (const pin of pins) map.add(pin.id);
    return map;
  }, [pins]);

  const surfaces = useMemo(() => {
    const byDocId = new Map<string, StudySurface>();
    const tracesByDocId = new Map<string, Trace[]>();

    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const current = tracesByDocId.get(trace.source.docId) ?? [];
      current.push(trace);
      tracesByDocId.set(trace.source.docId, current);
    }

    for (const [docId, traceSet] of tracesByDocId) {
      const trace = traceSet.sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt)[0];
      if (!trace?.source?.docId) continue;
      const meta = docsById.get(trace.source.docId);
      const viewedAt = viewedByDocId.get(trace.source.docId) ?? 0;
      let latestSummary = '';
      let latestQuote = '';
      let latestAnchorAt = 0;

      for (const sourceTrace of traceSet) {
        for (const event of sourceTrace.events) {
          if (event.kind === 'thought-anchor') {
            if (event.at >= latestAnchorAt) {
              latestAnchorAt = event.at;
              latestSummary = event.summary;
              latestQuote = event.quote ?? '';
            }
          }
        }
      }

      const kind = trace.source.href.startsWith('/knowledge/')
        ? 'knowledge'
        : trace.source.href.startsWith('/wiki/')
          ? 'wiki'
          : trace.source.href.startsWith('/uploads/')
            ? 'upload'
            : 'other';

      byDocId.set(trace.source.docId, {
        id: trace.source.docId,
        docId: trace.source.docId,
        title: meta?.title ?? trace.source.sourceTitle ?? trace.title,
        href: meta?.href ?? trace.source.href,
        pinned: pinnedByDocId.has(trace.source.docId),
        viewedAt,
        touchedAt: Math.max(
          viewedAt,
          latestAnchorAt,
          ...traceSet.map((t) => Math.max(t.updatedAt, t.crystallizedAt ?? 0, t.createdAt)),
        ),
        kind,
        learning: summarizeLearningSurface(traceSet, viewedAt),
        latestSummary,
        latestQuote: latestQuote || undefined,
        preview: meta?.preview ?? '',
      });
    }

    for (const pin of pins) {
      if (byDocId.has(pin.id)) continue;
      const meta = docsById.get(pin.id);
      const kind = pin.href.startsWith('/knowledge/')
        ? 'knowledge'
        : pin.href.startsWith('/wiki/')
          ? 'wiki'
          : pin.href.startsWith('/uploads/')
            ? 'upload'
            : 'other';
      byDocId.set(pin.id, {
        id: pin.id,
        docId: pin.id,
        title: meta?.title ?? pin.title,
        href: meta?.href ?? pin.href,
        pinned: true,
        viewedAt: viewedByDocId.get(pin.id) ?? 0,
        touchedAt: pin.pinnedAt,
        kind,
        learning: summarizeLearningSurface([], viewedByDocId.get(pin.id) ?? 0),
        latestSummary: '',
        preview: meta?.preview ?? '',
      });
    }

    const recencyRank = { stale: 0, cooling: 1, fresh: 2 } as const;
    const nextRank = { capture: 0, rehearse: 1, examine: 2, refresh: 3, revisit: 4 } as const;

    return Array.from(byDocId.values()).sort((a, b) => {
      if (nextRank[a.learning.nextAction] !== nextRank[b.learning.nextAction]) {
        return nextRank[a.learning.nextAction] - nextRank[b.learning.nextAction];
      }
      if (recencyRank[a.learning.recency] !== recencyRank[b.learning.recency]) {
        return recencyRank[a.learning.recency] - recencyRank[b.learning.recency];
      }
      return Number(b.pinned) - Number(a.pinned) || b.touchedAt - a.touchedAt;
    });
  }, [docsById, pins, traces, viewedByDocId, pinnedByDocId]);

  const baseTargets = useMemo(() => buildLearningTargets({
    panels: panels.filter(isRenderablePanel),
    weaves,
  }), [panels, weaves]);
  const deskState = useMemo(() => deriveDeskLearningState({
    baseTargets,
    learningTargetState: targetState.state,
    lastCompletedSession: workSession.lastCompletedSession,
    session: workSession.session,
  }), [baseTargets, targetState.state, workSession.lastCompletedSession, workSession.session]);
  const targets = deskState.visibleTargets;
  const workTargets = deskState.workTargets;
  const resolvedSession = deskState.resolvedSession;
  const displayedTargets = targets.slice(0, 6);
  const targetQueue = useMemo(() => deriveDeskQueue({
    rawTargets: deskState.rawTargets,
    learningTargetState: targetState.state,
    excludeIds: new Set(displayedTargets.map((target) => target.id)),
  }), [deskState.rawTargets, displayedTargets, targetState.state]);

  const hasTargetQueue = hasDeskQueue(targetQueue);
  const changedSinceLastSession = useMemo(
    () => countTargetsChangedSinceSession(baseTargets, workSession.lastCompletedSession),
    [baseTargets, workSession.lastCompletedSession],
  );
  const changeSummarySinceLastSession = useMemo(
    () => summarizeChangesSinceSession(baseTargets, workSession.lastCompletedSession),
    [baseTargets, workSession.lastCompletedSession],
  );
  const resolvedOutcomeItems = useMemo(
    () => deriveDeskResolvedOutcomeItems(workSession.lastCompletedSession, 5),
    [workSession.lastCompletedSession],
  );

  if (!mounted) return null;
  if (surfaces.length === 0 && displayedTargets.length === 0 && !hasTargetQueue) {
    return (
      <StageShell
        variant="working"
        contentVariant="working"
        innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.5rem' }}
      >
        <QuietScene tone="today">
          <QuietSceneColumn>
            <TodayHeader />
            <QuietEmptyState
              eyebrow="Today"
              title="Nothing is asking for attention yet."
              summary="Enter a source from the Sidebar or open the Shuttle. Once you read, capture, or weave, today's items appear here."
              primaryLabel="Open Shuttle"
              onPrimary={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              secondaryLabel="Open Atlas"
              onSecondary={() => router.push('/knowledge')}
            />
          </QuietSceneColumn>
        </QuietScene>
      </StageShell>
    );
  }

  const focusTarget = resolvedSession.currentTarget ?? displayedTargets[0] ?? null;
  const remainingTargets = resolvedSession.active
    ? resolvedSession.remainingTargets.slice(1, 6)
    : displayedTargets.slice(1, 6);
  const focusSurface = !focusTarget ? surfaces[0] ?? null : null;
  const focusId = focusSurface?.id ?? null;
  const remainingSurfaces = focusSurface ? surfaces.filter((surface) => surface.id !== focusId) : [];

  const openNext = (surface: StudySurface, next: 'source' | 'rehearsal' | 'examiner' | 'review') => {
    if (next === 'source') {
      router.push(surface.href);
      return;
    }
    if (next === 'review') {
      openPanelReview(router, { href: surface.href, anchorId: surface.learning.latestAnchorId });
      return;
    }
    setOverlayResume({ href: surface.href, overlay: next });
    router.push(surface.href);
  };

  const openRefresh = (surface: StudySurface) => {
    const refreshPayload: RefreshResumePayload = { href: surface.href, source: 'today' };
    try {
      setRefreshResume(
        { href: surface.href, anchorId: surface.learning.latestAnchorId },
        refreshPayload,
      );
    } catch {}
    router.push(surface.href);
  };

  const openPrimaryAction = (surface: StudySurface) => {
    if (surface.learning.nextAction === 'refresh') {
      openRefresh(surface);
      return;
    }
    if (surface.learning.nextAction === 'rehearse') {
      openNext(surface, 'rehearsal');
      return;
    }
    if (surface.learning.nextAction === 'examine') {
      openNext(surface, 'examiner');
      return;
    }
    if (surface.learning.nextAction === 'capture') {
      openNext(surface, 'source');
      return;
    }
    openNext(surface, 'review');
  };

  return (
    <StageShell
      variant="working"
      contentVariant="working"
      innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.2rem' }}
    >
      <QuietScene tone="today">
        <QuietSceneColumn>
          <TodayHeader />
          <DueForReview />
          {focusTarget ? (
            <QuietGuideCard
              {...(() => {
                const presenter = buildDeskFocusTargetPresenter({
                  target: focusTarget,
                  learningTargetState: targetState.state,
                  meta: `${timeOfDay(focusTarget.touchedAt)}${workTargets.length > 0 ? ` · ${workTargets.length} ready` : ''}`,
                });

                return {
                  eyebrow: presenter.eyebrow,
                  title: presenter.title,
                  tone: 'primary' as const,
                  density: 'roomy' as const,
                  meta: <span>{presenter.meta}</span>,
                  summary: presenter.summary,
                  detail: presenter.detail ? (
                    <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 6 }}>
                      {presenter.detail}
                    </div>
                  ) : undefined,
                };
              })()}
              actions={assembleDeskFocusTargetActions({
                primaryLabel: learningTargetActionLabel(focusTarget.action),
                onPrimary: () => openLearningTarget(router, focusTarget),
                secondaryLabel: learningTargetSecondaryLabel(focusTarget),
                onSecondary: () => openLearningTargetSource(router, focusTarget),
                includeManagementActions: true,
                pinLabel: isLearningTargetPinned(focusTarget, targetState.state) ? 'Unpin' : 'Pin',
                onPinToggle: () => targetState.togglePinned(focusTarget),
                onNotNow: () => targetState.notNow(focusTarget),
                onHideToday: () => targetState.hideToday(focusTarget),
                onDone: () => targetState.markDone(focusTarget),
              })}
            />
          ) : focusSurface && (
            <QuietGuideCard
              eyebrow="Keep this active"
              title={focusSurface.title}
              tone="primary"
              density="roomy"
              meta={<span>{timeOfDay(focusSurface.touchedAt)}</span>}
              summary={focusSurface.latestSummary || focusSurface.latestQuote || focusSurface.preview}
              actions={[
                {
                  label: todayPrimaryActionLabel(focusSurface.learning.nextAction),
                  onClick: () => openPrimaryAction(focusSurface),
                  primary: true,
                },
                { label: 'Open source', onClick: () => router.push(focusSurface.href) },
              ]}
            />
          )}

          {(workTargets.length > 0 || resolvedSession.active) && (
            <SessionStatusStrip
              resolvedSession={resolvedSession}
              readyCount={workTargets.length}
              onStart={() => workSession.start(workTargets)}
              onOpenCurrent={() => {
                if (resolvedSession.currentTarget) openLearningTarget(router, resolvedSession.currentTarget);
              }}
              onEnd={() => workSession.clear()}
            />
          )}

          {focusTarget && remainingTargets.length > 0 ? (
            <TargetResumeList
              items={remainingTargets}
              learningTargetState={targetState.state}
              onOpenPrimary={(target) => openLearningTarget(router, target)}
              onOpenSecondary={(target) => openLearningTargetSource(router, target)}
              onPin={(target) => targetState.togglePinned(target)}
              onNotNow={(target) => targetState.notNow(target)}
              onHideToday={(target) => targetState.hideToday(target)}
              onDone={(target) => targetState.markDone(target)}
              isPinned={(target) => isLearningTargetPinned(target, targetState.state)}
            />
          ) : null}

          {hasTargetQueue && (
            <LearningTargetQueueState
              queue={targetQueue}
              onRestore={(target) => targetState.restore(target)}
              onTogglePinned={(target) => targetState.togglePinned(target)}
            />
          )}

          {!resolvedSession.active && workSession.lastCompletedSession && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: '1.2rem' }}>
              <QuietGuideCard
                eyebrow="Since last session"
                title={workSession.lastCompletedSession.recap ?? 'Recent work'}
                mode="inline"
                summary={changedSinceLastSession > 0
                  ? `${changedSinceLastSession} target${changedSinceLastSession === 1 ? '' : 's'} changed since that session.`
                  : 'Nothing new has changed since that session.'}
                detail={changedSinceLastSession > 0 && changeSummarySinceLastSession ? (
                  <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 6 }}>
                    {changeSummarySinceLastSession}
                  </div>
                ) : undefined}
              />
              {resolvedOutcomeItems.length > 0 && (
                <ResolvedOutcomeList
                  items={resolvedOutcomeItems}
                  onOpen={(target) => openLearningTarget(router, target)}
                />
              )}
            </div>
          )}

          {!focusTarget && remainingSurfaces.length > 0 && (
            <ResumeList
              items={remainingSurfaces}
              onOpenPrimary={openPrimaryAction}
              onOpenSource={(surface) => router.push(surface.href)}
            />
          )}

          {!focusTarget && !resolvedSession.active ? (
            <>
              <ReviewCards traces={traces} docsById={docsById} onOpenReview={openNext} />
              <DailyWeaveReflection traces={traces} history={history} />
            </>
          ) : null}
        </QuietSceneColumn>
      </QuietScene>
    </StageShell>
  );
}

function TodayHeader() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <WorkEyebrow subtle>Today</WorkEyebrow>
        <div
          style={{
            fontFamily: 'var(--display)',
            fontSize: '1.42rem',
            fontWeight: 600,
            letterSpacing: '-0.03em',
            lineHeight: 1.12,
            color: 'var(--fg)',
          }}
        >
          The next return should be obvious at a glance.
        </div>
      </div>
      <div className="t-caption2" style={{ color: 'var(--muted)', maxWidth: 420 }}>
        No rings, no scoreboards, no dashboard theater. Just the thread that changed and the work that belongs to it.
      </div>
    </header>
  );
}

function DailyWeaveReflection({ traces, history }: { traces: Trace[], history: any[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTs = today.getTime();

  const threadsWarmed = useMemo(() => {
    const uniqueDocs = new Set<string>();
    for (const entry of history) {
      if (entry.viewedAt >= todayTs) uniqueDocs.add(entry.id);
    }
    for (const t of traces) {
      if (t.updatedAt >= todayTs && t.source?.docId) uniqueDocs.add(t.source.docId);
    }
    return uniqueDocs.size;
  }, [history, traces, todayTs]);

  const weftsWoven = useMemo(() => {
    let count = 0;
    for (const t of traces) {
      for (const e of t.events) {
        if (e.kind === 'thought-anchor' && e.at >= todayTs) count++;
      }
    }
    return count;
  }, [traces, todayTs]);

  if (threadsWarmed === 0 && weftsWoven === 0) return null;

  return (
    <section style={{
      marginTop: '3.5rem',
    }}>
      <WorkSurface
        tone="quiet"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          animation: 'loom-overlay-fade-in 0.6s var(--ease) both',
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <svg width="160" height="40" viewBox="0 0 160 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            {Array.from({ length: 8 }).map((_, i) => (
              <line key={i} x1={20 + i * 18} y1="0" x2={20 + i * 18} y2="40" stroke="var(--mat-border)" strokeWidth="0.5" opacity="0.4" />
            ))}
            {Array.from({ length: Math.min(weftsWoven, 12) }).map((_, i) => {
              const y = 8 + (i * 24 / Math.min(weftsWoven, 12));
              return (
                <line
                  key={i}
                  x1="10" y1={y} x2="150" y2={y}
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  opacity={0.3 + (i * 0.5 / weftsWoven)}
                  style={{ animation: `lpFade 1s var(--ease) ${i * 0.1}s both` }}
                />
              );
            })}
            {Array.from({ length: Math.min(threadsWarmed, 8) }).map((_, i) => (
              <circle key={i} cx={20 + i * 18} cy="20" r="2" fill="var(--accent)" opacity="0.6" />
            ))}
          </svg>
        </div>
        <WorkEyebrow subtle style={{ marginBottom: 4 }}>Today&apos;s weave</WorkEyebrow>
        <div style={{ fontFamily: 'var(--display)', fontSize: '0.95rem', color: 'var(--fg)', fontWeight: 500 }}>
          {threadsWarmed} thread{threadsWarmed === 1 ? '' : 's'} warmed, {weftsWoven} new weft{weftsWoven === 1 ? '' : 's'} woven today.
        </div>
      </WorkSurface>
    </section>
  );
}

function QuietEmptyState({
  eyebrow,
  title,
  summary,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
}) {
  const presenter = buildDeskEmptyPresenter({
    eyebrow,
    title,
    summary,
    detail: 'Today shows nothing until a source changes.',
  });

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 14rem)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <QuietSceneIntro
        eyebrow={presenter.eyebrow}
        title={presenter.title}
        summary={
          <>
            {presenter.summary}
            {presenter.detail ? (
              <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 6 }}>
                {presenter.detail}
              </div>
            ) : null}
          </>
        }
        actions={[
          { label: primaryLabel, onClick: onPrimary, primary: true },
          { label: secondaryLabel, onClick: onSecondary },
        ]}
      />
    </div>
  );
}

function SessionStatusStrip({
  resolvedSession,
  readyCount,
  onStart,
  onOpenCurrent,
  onEnd,
}: {
  resolvedSession: ReturnType<typeof resolveWorkSession>;
  readyCount: number;
  onStart: () => void;
  onOpenCurrent: () => void;
  onEnd: () => void;
}) {
  if (!resolvedSession.active && readyCount === 0) return null;

  return (
    <WorkSurface tone="quiet" density="compact" style={{ marginTop: '0.35rem', marginBottom: '0.1rem' }}>
      <div
        className="t-caption2"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          color: 'var(--muted)',
          letterSpacing: '0.04em',
        }}
      >
        <WorkEyebrow subtle>Work session</WorkEyebrow>
        <span aria-hidden style={{ opacity: 0.35 }}>·</span>
        <span style={{ color: 'var(--fg)' }}>
          {resolvedSession.active
            ? (resolvedSession.finished
                ? 'Session complete'
                : `${resolvedSession.totalCount - resolvedSession.completedCount} remaining`)
            : `${readyCount} ready`}
        </span>
        {resolvedSession.active && !resolvedSession.finished && resolvedSession.nextTarget ? (
          <>
            <span aria-hidden style={{ opacity: 0.35 }}>·</span>
            <span>Next up · {resolvedSession.nextTarget.title}</span>
          </>
        ) : null}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {resolvedSession.finished ? (
            <button type="button" onClick={onEnd} style={sessionTextActionStyle(true)}>
              End session
            </button>
          ) : resolvedSession.active && resolvedSession.currentTarget ? (
            <>
              <button type="button" onClick={onOpenCurrent} style={sessionTextActionStyle(true)}>
                Open current
              </button>
              <button type="button" onClick={onEnd} style={sessionTextActionStyle(false)}>
                End session
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={onStart} style={sessionTextActionStyle(true)}>
                Start work session
              </button>
              {readyCount > 0 ? (
                <span className="t-caption2" style={{ color: 'var(--muted)' }}>
                  One quiet round at a time.
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </WorkSurface>
  );
}


function ResumeList({
  items,
  onOpenPrimary,
  onOpenSource,
}: {
  items: StudySurface[];
  onOpenPrimary: (surface: StudySurface) => void;
  onOpenSource: (surface: StudySurface) => void;
}) {
  return (
    <WorkSurface tone="quiet" density="compact" style={{ marginTop: '1.2rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <WorkEyebrow subtle>Warm threads</WorkEyebrow>
      {items.map((item, index) => (
        <div
          key={item.id}
          style={{
            color: 'var(--fg)',
            padding: '1.1rem',
            borderBottom: index < items.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
            transition: 'background 0.2s var(--ease)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.02)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontFamily: 'var(--display)',
                fontSize: '1rem',
                fontWeight: 550,
                letterSpacing: '-0.012em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.title}
            </span>
            <span
              suppressHydrationWarning
              className="t-caption"
              style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
            >
              {timeOfDay(item.touchedAt)}
            </span>
          </div>

          {(item.latestSummary || item.latestQuote || item.preview) && (
            <div
              style={{
                marginTop: 6,
                color: 'var(--fg-secondary)',
                fontSize: '0.9rem',
                lineHeight: 1.55,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {item.latestSummary || item.latestQuote || item.preview}
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onOpenPrimary(item)}
              style={resumeActionStyle(true)}
            >
              {todayPrimaryActionLabel(item.learning.nextAction)}
            </button>
            <button type="button" onClick={() => onOpenSource(item)} style={resumeTextActionStyle}>
              Source
            </button>
          </div>
        </div>
      ))}
      </div>
    </WorkSurface>
  );
}

function timeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function todayPrimaryActionLabel(nextAction: LearningSurfaceSummary['nextAction']) {
  switch (nextAction) {
    case 'refresh':
      return 'Return';
    case 'rehearse':
      return 'Write';
    case 'examine':
      return 'Ask';
    case 'capture':
      return 'Open';
    default:
      return 'Review';
  }
}

function resumeActionStyle(primary: boolean) {
  return {
    padding: '0.38rem 0.76rem',
    borderRadius: 999,
    border: primary ? '0.5px solid color-mix(in srgb, var(--accent) 22%, var(--mat-border))' : '0.5px solid var(--mat-border)',
    background: primary ? 'color-mix(in srgb, var(--accent-soft) 74%, transparent)' : 'transparent',
    color: primary ? 'var(--fg)' : 'var(--fg-secondary)',
    fontSize: '0.74rem',
    fontWeight: 700,
    letterSpacing: '0.025em',
    cursor: 'pointer',
    boxShadow: 'none',
    transition: 'all 0.2s var(--ease)',
  } as const;
}

const resumeTextActionStyle = {
  appearance: 'none' as const,
  border: 0,
  background: 'transparent',
  color: 'var(--fg-secondary)',
  fontSize: '0.71rem',
  fontWeight: 700,
  letterSpacing: '0.03em',
  padding: 0,
  cursor: 'pointer',
};

function sessionTextActionStyle(primary: boolean) {
  return {
    appearance: 'none' as const,
    border: 0,
    background: 'transparent',
    color: primary ? 'var(--fg)' : 'var(--fg-secondary)',
    fontSize: '0.71rem',
    fontWeight: 700,
    letterSpacing: '0.03em',
    padding: 0,
    cursor: 'pointer',
  };
}

function TargetResumeList({
  items,
  learningTargetState,
  onOpenPrimary,
  onOpenSecondary,
  onPin,
  onNotNow,
  onHideToday,
  onDone,
  isPinned,
}: {
  items: LearningTarget[];
  learningTargetState: import('../../lib/learning-target-state').LearningTargetState;
  onOpenPrimary: (target: LearningTarget) => void;
  onOpenSecondary: (target: LearningTarget) => void;
  onPin: (target: LearningTarget) => void;
  onNotNow: (target: LearningTarget) => void;
  onHideToday: (target: LearningTarget) => void;
  onDone: (target: LearningTarget) => void;
  isPinned: (target: LearningTarget) => boolean;
}) {
  return (
    <WorkSurface tone="quiet" density="compact" style={{ marginTop: '1.2rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <WorkEyebrow subtle>Remaining returns</WorkEyebrow>
        {items.map((item, index) => {
          const presenter = buildDeskLearningTargetPresenter({
            target: item,
            learningTargetState,
            isPinned: isPinned(item),
          });

          return (
            <div
              key={item.id}
              style={{
                color: 'var(--fg)',
                padding: '1.1rem',
                borderBottom: index < items.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
                transition: 'background 0.2s var(--ease)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.02)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: 'var(--display)',
                    fontSize: '1rem',
                    fontWeight: 550,
                    letterSpacing: '-0.012em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {presenter.title}
                </span>
                <span suppressHydrationWarning className="t-caption" style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {timeOfDay(item.touchedAt)}
                </span>
              </div>
              <div style={{ marginTop: 6, color: 'var(--fg-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>
                {presenter.summary}
              </div>
              {presenter.whyNow && (
                <div className="t-caption2" style={{ marginTop: 4, color: 'var(--muted)' }}>
                  {presenter.whyNow}
                </div>
              )}
              {presenter.returnLabel && (
                <div className="t-caption2" style={{ marginTop: 4, color: 'var(--muted)' }}>
                  {presenter.returnLabel}
                </div>
              )}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => onOpenPrimary(item)} style={resumeActionStyle(true)}>
                  {presenter.primaryActionLabel}
                </button>
                <button type="button" onClick={() => onOpenSecondary(item)} style={resumeTextActionStyle}>
                  {presenter.secondaryActionLabel}
                </button>
                <button type="button" onClick={() => onPin(item)} style={resumeTextActionStyle}>
                  {presenter.pinLabel}
                </button>
                <button type="button" onClick={() => onNotNow(item)} style={resumeTextActionStyle}>
                  Not now
                </button>
                <button type="button" onClick={() => onHideToday(item)} style={resumeTextActionStyle}>
                  Hide today
                </button>
                <button type="button" onClick={() => onDone(item)} style={resumeTextActionStyle}>
                  Done
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </WorkSurface>
  );
}

function ResolvedOutcomeList({
  items,
  onOpen,
}: {
  items: Array<{
    handledAt: number;
    resolvedLabel: string;
    resolutionKind: import('../../lib/work-session').WorkSessionResolutionKind;
    targetSnapshot: LearningTarget;
  }>;
  onOpen: (target: LearningTarget) => void;
}) {
  return (
    <WorkSurface tone="quiet" density="compact">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <WorkEyebrow subtle>Resolved in that session</WorkEyebrow>
        {items.map((item, index) => {
          const presenter = buildDeskResolvedOutcomePresenter(item);

          return (
            <div
              key={`${item.targetSnapshot.id}:${item.handledAt}`}
              style={{
                color: 'var(--fg)',
                padding: '0.9rem 1.1rem',
                borderBottom: index < items.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: 'var(--display)',
                    fontSize: '0.98rem',
                    fontWeight: 550,
                    letterSpacing: '-0.012em',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {presenter.title}
                </span>
                <span className="t-caption" style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {timeOfDay(item.handledAt)}
                </span>
              </div>
              <div className="t-caption2" style={{ marginTop: 4, color: 'var(--muted)' }}>
                {presenter.meta}
              </div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button type="button" onClick={() => onOpen(item.targetSnapshot)} style={resumeTextActionStyle}>
                  {presenter.actionLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </WorkSurface>
  );
}


/**
 * ReviewCards — flashcard-style review from recent anchored notes.
 *
 * Shows quotes from the last 3 days' anchored notes. Click to reveal
 * the summary (what you understood). Click the doc title to jump back.
 *
 * §1: only appears when there are notes to review.
 * §④: faster than flipping through a notebook.
 * No separate quiz page needed — review happens on /today.
 */
function ReviewCards({
  traces,
  docsById,
  onOpenReview,
}: {
  traces: Trace[];
  docsById: Map<string, DocLite>;
  onOpenReview: (surface: StudySurface, next: 'source' | 'rehearsal' | 'examiner' | 'review') => void;
}) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const threeDaysAgo = Date.now() - 3 * 86400000;

  const cards = useMemo(() => {
    const out: Array<{
      quote: string;
      summary: string;
      content: string;
      docTitle: string;
      href: string;
      at: number;
      anchorId: string;
      surface: StudySurface;
    }> = [];
    for (const t of traces) {
      if (t.kind !== 'reading' || t.parentId || !t.source?.docId) continue;
      const meta = docsById.get(t.source.docId);
      const viewedAt = latestVisitAt(t);
      const learning = summarizeLearningSurface(t, viewedAt);
      const surface: StudySurface = {
        id: t.source.docId,
        docId: t.source.docId,
        title: meta?.title ?? t.source.sourceTitle ?? '',
        href: meta?.href ?? t.source.href,
        pinned: false,
        viewedAt,
        touchedAt: learning.touchedAt,
        kind: t.source.href.startsWith('/knowledge/')
          ? 'knowledge'
          : t.source.href.startsWith('/wiki/')
            ? 'wiki'
            : t.source.href.startsWith('/uploads/')
              ? 'upload'
              : 'other',
        learning,
        latestSummary: learning.latestSummary,
        latestQuote: learning.latestQuote,
        preview: meta?.preview ?? '',
      };
      for (const e of t.events) {
        if (e.kind !== 'thought-anchor') continue;
        if (e.at < threeDaysAgo) continue;
        if (!e.quote || !e.summary) continue;
        out.push({
          quote: e.quote,
          summary: e.summary,
          content: e.content,
          docTitle: meta?.title ?? t.source.sourceTitle ?? '',
          href: meta?.href ?? t.source.href,
          at: e.at,
          anchorId: e.anchorId,
          surface,
        });
      }
    }
    // Shuffle for variety
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, 5);
  }, [traces, docsById, threeDaysAgo]);

  if (cards.length === 0) return null;

  const toggle = (i: number) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  return (
    <section style={{ marginTop: '2.5rem' }}>
      <div className="t-caption2" style={{ color: 'var(--accent)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 12 }}>
        Review recent thoughts
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {cards.map((card, i) => (
          <div
            key={i}
            onClick={() => toggle(i)}
            style={{
              padding: '1.1rem 1.25rem',
              borderRadius: 'var(--r-3)',
              border: '0.5px solid var(--mat-border)',
              background: revealed.has(i) ? 'var(--mat-thick-bg)' : 'var(--mat-thin-bg)',
              backdropFilter: 'var(--mat-blur)',
              WebkitBackdropFilter: 'var(--mat-blur)',
              boxShadow: revealed.has(i) ? 'var(--shadow-2)' : 'var(--shadow-1)',
              cursor: 'pointer',
              transition: 'all 0.3s var(--ease-spring)',
              transform: revealed.has(i) ? 'scale(1.01)' : 'scale(1)',
            }}
          >
            <div style={{
              fontSize: '0.94rem', lineHeight: 1.6,
              color: 'var(--fg)',
              fontStyle: 'italic',
              opacity: revealed.has(i) ? 0.6 : 1,
              transition: 'opacity 0.3s var(--ease)',
            }}>
              &ldquo;{card.quote.length > 150 ? card.quote.slice(0, 147) + '…' : card.quote}&rdquo;
            </div>
            {revealed.has(i) && (
              <div style={{ marginTop: 12, animation: 'loom-overlay-fade-in 0.3s var(--ease) both' }}>
                <div style={{
                  fontSize: '1rem', lineHeight: 1.5,
                  color: 'var(--fg)', fontWeight: 600,
                  marginBottom: 8,
                  letterSpacing: '-0.01em',
                }}>
                  {card.summary}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openPanelReview(router, { href: card.href, anchorId: card.anchorId });
                      onOpenReview(card.surface, 'review');
                    }}
                    style={{
                      appearance: 'none',
                      border: '0.5px solid var(--mat-border)',
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      borderRadius: 999,
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      cursor: 'pointer',
                      transition: 'all 0.2s var(--ease)',
                    }}
                  >
                    Deep Review
                  </button>
                  <Link
                    href={card.href}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      fontSize: '0.75rem', color: 'var(--muted)',
                      textDecoration: 'none',
                      fontWeight: 500,
                    }}
                  >
                    from {card.docTitle}
                  </Link>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
