'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LearningTargetStateBadge } from '../../components/LearningTargetStateBadge';
import { LearningTargetStateControls } from '../../components/LearningTargetStateControls';
import { QuietGuideCard } from '../../components/QuietGuideCard';
import { StageShell } from '../../components/StageShell';
import { WorkSessionHandoff } from '../../components/WorkSessionHandoff';
import { buildLearningTargets, buildPanelLearningTarget, buildWeaveLearningTarget, type LearningTarget } from '../../lib/learning-targets';
import type { LearningNextAction } from '../../lib/learning-status';
import {
  applyLearningTargetState,
  describeLearningTargetState,
  isLearningTargetInWorkQueue,
  learningTargetReturnLabel,
  learningTargetStateRank,
  useLearningTargetState,
} from '../../lib/learning-target-state';
import { buildRevisionActionSeed } from '../../lib/panel/revision-actions';
import { continuePanelLifecycle, openPanelReview, setOverlayResume } from '../../lib/panel-resume';
import {
  isRenderablePanel,
  panelFamilyLabel,
  panelRevisionCount,
  panelRevisionLabel,
  revisionChanges,
  sortedPanelRevisions,
  useAllPanels,
  type Panel as StoredPanel,
} from '../../lib/panel';
import {
  buildWeavePreview,
  buildWeaveRevisionActionSeed,
  setWeaveStatus,
  sortedWeaveRevisions,
  updateWeaveContract,
  useAllWeaves,
  weaveRevisionChanges,
  weaveRevisionCount,
  weaveRevisionLabel,
  type WeavePreviewItem,
} from '../../lib/weave';
import { useSmallScreen } from '../../lib/use-small-screen';
import { isTargetChangeResolved, resolveWorkSession, useWorkSession } from '../../lib/work-session';
import 'reactflow/dist/style.css';

const ReactFlow = dynamic(() => import('reactflow').then((m) => m.default), { ssr: false });
const Background = dynamic(() => import('reactflow').then((m) => m.Background), { ssr: false });

type PanelNode = StoredPanel & {
  family: string;
};

type RelatedPanel = WeavePreviewItem<PanelNode>;

type DirectedRelatedPanel = RelatedPanel & {
  direction: 'incoming' | 'outgoing';
};

function primaryActionLabel(nextAction: LearningNextAction) {
  if (nextAction === 'refresh') return 'Refresh';
  if (nextAction === 'rehearse') return 'Rehearsal';
  if (nextAction === 'examine') return 'Examiner';
  return 'Review';
}

function panelStateLabel(panel: PanelNode) {
  if (panel.status === 'contested') return 'contested';
  if (panelRevisionLabel(panel)) return `revised · ${panelRevisionCount(panel)}`;
  return null;
}

type ScopeFilter = 'all' | 'nearby' | 'incoming' | 'outgoing';
type GraphLens = 'all' | 'work';
type RelationAction = 'strengthen' | 'question' | 'review';

function syncGraphParams({
  docId,
  relationId,
  relationAction,
  lens,
  query,
  family,
  scope,
}: {
  docId: string | null;
  relationId?: string | null;
  relationAction?: RelationAction | null;
  lens: GraphLens;
  query: string;
  family: string;
  scope: ScopeFilter;
}) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (docId) url.searchParams.set('focus', docId);
  else url.searchParams.delete('focus');
  if (relationId) url.searchParams.set('relation', relationId);
  else url.searchParams.delete('relation');
  if (relationAction) url.searchParams.set('relationAction', relationAction);
  else url.searchParams.delete('relationAction');
  if (query.trim()) url.searchParams.set('q', query.trim());
  else url.searchParams.delete('q');
  if (lens !== 'all') url.searchParams.set('lens', lens);
  else url.searchParams.delete('lens');
  if (family !== 'all') url.searchParams.set('family', family);
  else url.searchParams.delete('family');
  if (scope !== 'all') url.searchParams.set('scope', scope);
  else url.searchParams.delete('scope');
  window.history.replaceState({}, '', url.toString());
}

export default function GraphPage() {
  const router = useRouter();
  const { panels: storedPanels, loading } = useAllPanels();
  const { weaves, loading: weavesLoading } = useAllWeaves();
  const targetState = useLearningTargetState();
  const workSession = useWorkSession();
  const [focusDocId, setFocusDocId] = useState<string | null>(null);
  const [focusWeaveId, setFocusWeaveId] = useState<string | null>(null);
  const [focusWeaveAction, setFocusWeaveAction] = useState<RelationAction | null>(null);
  const [query, setQuery] = useState('');
  const [lens, setLens] = useState<GraphLens>('all');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingWeaveId, setEditingWeaveId] = useState<string | null>(null);
  const [editClaim, setEditClaim] = useState('');
  const [editWhyItHolds, setEditWhyItHolds] = useState('');
  const [editTensions, setEditTensions] = useState('');
  const compactGraph = useSmallScreen(1180);

  useEffect(() => {
    document.title = 'Graph · Loom';
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setFocusDocId(params.get('focus'));
      setFocusWeaveId(params.get('relation'));
      const relationAction = params.get('relationAction');
      setFocusWeaveAction(
        relationAction === 'strengthen' || relationAction === 'question' || relationAction === 'review'
          ? relationAction
          : null,
      );
      setQuery(params.get('q') ?? '');
      setLens(params.get('lens') === 'work' ? 'work' : 'all');
      setFamilyFilter(params.get('family') ?? 'all');
      const requestedScope = params.get('scope');
      setScopeFilter(
        requestedScope === 'nearby' || requestedScope === 'incoming' || requestedScope === 'outgoing'
          ? requestedScope
          : params.get('focus')
            ? 'nearby'
            : 'all',
      );
    } catch {
      setFocusDocId(null);
      setFocusWeaveId(null);
      setFocusWeaveAction(null);
      setQuery('');
      setLens('all');
      setFamilyFilter('all');
      setScopeFilter('all');
    }
  }, []);

  const { nodes, edges, panelCount, relationCount, panels, relationPreview } = useMemo(() => {
    const basePanels = storedPanels.filter(isRenderablePanel);
    const panels = basePanels.map((panel) => ({
      ...panel,
      family: panelFamilyLabel(panel.href),
    }));
    const panelByDocId = new Map(panels.map((panel) => [panel.docId, panel] as const));

    const grouped = new Map<string, PanelNode[]>();
    for (const panel of panels) {
      const existing = grouped.get(panel.family) ?? [];
      existing.push(panel);
      grouped.set(panel.family, existing);
    }

    const families = Array.from(grouped.keys()).sort();
    const flowNodes = families.flatMap((family, familyIndex) => {
      const items = grouped.get(family) ?? [];
      return items.map((panel, index) => ({
        id: panel.docId,
        data: {
          label: panel.title,
          family,
          summary: panel.summary,
          next: panel.learning.nextAction,
        },
        position: {
          x: familyIndex * 330,
          y: index * 150,
        },
        style: {
          width: 250,
          padding: 14,
          border: panel.docId === focusDocId
            ? '0.5px solid color-mix(in srgb, var(--accent) 38%, var(--mat-border))'
            : '0.5px solid var(--mat-border)',
          borderRadius: 14,
          background: panel.docId === focusDocId
            ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))'
            : 'color-mix(in srgb, var(--bg-elevated) 92%, white)',
          color: 'var(--fg)',
          boxShadow: panel.docId === focusDocId ? 'var(--shadow-2)' : 'var(--shadow-1)',
        },
      }));
    });

    const flowEdges: Array<{
      id: string;
      source: string;
      target: string;
      animated: boolean;
      style: { stroke: string; strokeWidth: number };
    }> = [];
    const orderedPreview = buildWeavePreview(panels, weaves);
    for (const weave of weaves) {
      if (weave.status === 'rejected') continue;
      if (!panelByDocId.has(weave.fromPanelId) || !panelByDocId.has(weave.toPanelId)) continue;
      flowEdges.push({
        id: weave.id,
        source: weave.fromPanelId,
        target: weave.toPanelId,
        animated: false,
        style: { stroke: 'var(--accent)', strokeWidth: 0.9 + Math.min(weave.evidence.length || 1, 4) * 0.3 },
      });
    }

    return {
      nodes: flowNodes,
      edges: flowEdges,
      panelCount: panels.length,
      relationCount: flowEdges.length,
      panels,
      relationPreview: orderedPreview,
    };
  }, [storedPanels, focusDocId, weaves]);

  const panelByDocId = useMemo(
    () => new Map(panels.map((panel) => [panel.docId, panel] as const)),
    [panels],
  );
  const rawTargets = useMemo(
    () => buildLearningTargets({ panels, weaves }),
    [panels, weaves],
  );
  const visibleTargets = useMemo(
    () => applyLearningTargetState(rawTargets, targetState.state),
    [rawTargets, targetState.state],
  );
  const resolvedSession = useMemo(
    () => resolveWorkSession(workSession.session, visibleTargets),
    [visibleTargets, workSession.session],
  );
  const familyOptions = useMemo(
    () => ['all', ...Array.from(new Set(panels.map((panel) => panel.family))).sort()],
    [panels],
  );
  const focusPanel = focusDocId ? panelByDocId.get(focusDocId) ?? null : null;
  const focusRelated = focusPanel
    ? relationPreview.get(focusPanel.docId) ?? { incoming: [], outgoing: [] }
    : { incoming: [], outgoing: [] };
  const scopeCounts = {
    nearby: focusRelated.incoming.length + focusRelated.outgoing.length,
    incoming: focusRelated.incoming.length,
    outgoing: focusRelated.outgoing.length,
  };
  const focusInsights = useMemo(() => {
    if (!focusPanel) return null;
    const nearby: DirectedRelatedPanel[] = [
      ...focusRelated.incoming.map((item) => ({ ...item, direction: 'incoming' as const })),
      ...focusRelated.outgoing.map((item) => ({ ...item, direction: 'outgoing' as const })),
    ];
    if (nearby.length === 0) return null;
    const sameFamilyCount = nearby.filter((item) => item.panel.family === focusPanel.family).length;
    const strongest = [...nearby].sort(
      (a, b) => b.weight - a.weight || a.panel.title.localeCompare(b.panel.title),
    )[0];
    return {
      nearbyCount: nearby.length,
      sameFamilyCount,
      strongest,
    };
  }, [focusPanel, focusRelated.incoming, focusRelated.outgoing]);
  const focusRelation = useMemo<DirectedRelatedPanel | null>(() => {
    if (!focusPanel) return null;
    const nearby: DirectedRelatedPanel[] = [
      ...focusRelated.incoming.map((item) => ({ ...item, direction: 'incoming' as const })),
      ...focusRelated.outgoing.map((item) => ({ ...item, direction: 'outgoing' as const })),
    ];
    if (focusWeaveId) {
      return nearby.find((item) => item.id === focusWeaveId) ?? null;
    }
    return nearby.sort((a, b) => b.weight - a.weight || a.panel.title.localeCompare(b.panel.title))[0] ?? null;
  }, [focusPanel, focusRelated.incoming, focusRelated.outgoing, focusWeaveId]);
  const focusRevisions = useMemo(
    () => (focusPanel ? sortedPanelRevisions(focusPanel) : []),
    [focusPanel],
  );
  const focusCurrentRevision = focusRevisions[0] ?? null;
  const focusPreviousRevision = focusRevisions[1] ?? null;
  const focusRevisionDelta = focusCurrentRevision && focusPreviousRevision
    ? revisionChanges(focusCurrentRevision, focusPreviousRevision)
    : null;
  const focusRevisionSeed = focusPanel ? buildRevisionActionSeed(focusPanel) : null;
  const focusPanelTarget = useMemo(
    () => (focusPanel ? buildPanelLearningTarget(focusPanel) : null),
    [focusPanel],
  );
  const focusPanelState = useMemo(
    () => (focusPanelTarget ? describeLearningTargetState(focusPanelTarget, targetState.state) : null),
    [focusPanelTarget, targetState.state],
  );
  const focusPanelResolved = useMemo(
    () => (focusPanelTarget ? isTargetChangeResolved(focusPanelTarget, workSession.lastCompletedSession) : false),
    [focusPanelTarget, workSession.lastCompletedSession],
  );
  const focusPanelReturnLabel = useMemo(
    () => (focusPanelTarget ? learningTargetReturnLabel(focusPanelTarget, targetState.state) : null),
    [focusPanelTarget, targetState.state],
  );
  const strongestRelationRevisions = focusRelation ? sortedWeaveRevisions(focusRelation) : [];
  const strongestRelationCurrentRevision = strongestRelationRevisions[0] ?? null;
  const strongestRelationPreviousRevision = strongestRelationRevisions[1] ?? null;
  const strongestRelationDelta = strongestRelationCurrentRevision && strongestRelationPreviousRevision
    ? weaveRevisionChanges(strongestRelationCurrentRevision, strongestRelationPreviousRevision)
    : null;
  const strongestRelationSeed = focusRelation ? buildWeaveRevisionActionSeed(focusRelation) : null;
  const focusWeaveRecord = useMemo(
    () => (focusRelation ? weaves.find((weave) => weave.id === focusRelation.id) ?? null : null),
    [focusRelation, weaves],
  );
  const focusWeaveTarget = useMemo(
    () => (focusWeaveRecord ? buildWeaveLearningTarget(focusWeaveRecord, panels) : null),
    [focusWeaveRecord, panels],
  );
  const currentSessionTarget = resolvedSession.currentTarget;
  const nextSessionTarget = resolvedSession.nextTarget;
  const focusPanelSessionMatch = Boolean(focusPanelTarget && currentSessionTarget && focusPanelTarget.id === currentSessionTarget.id);
  const focusWeaveSessionMatch = Boolean(focusWeaveTarget && currentSessionTarget && focusWeaveTarget.id === currentSessionTarget.id);
  const focusWeaveState = useMemo(
    () => (focusWeaveTarget ? describeLearningTargetState(focusWeaveTarget, targetState.state) : null),
    [focusWeaveTarget, targetState.state],
  );
  const focusWeaveResolved = useMemo(
    () => (focusWeaveTarget ? isTargetChangeResolved(focusWeaveTarget, workSession.lastCompletedSession) : false),
    [focusWeaveTarget, workSession.lastCompletedSession],
  );
  const focusWeaveReturnLabel = useMemo(
    () => (focusWeaveTarget ? learningTargetReturnLabel(focusWeaveTarget, targetState.state) : null),
    [focusWeaveTarget, targetState.state],
  );

  useEffect(() => {
    if (!focusRelation || editingWeaveId === focusRelation.id) return;
    setEditingWeaveId(null);
    setEditClaim('');
    setEditWhyItHolds('');
    setEditTensions('');
  }, [editingWeaveId, focusRelation]);

  useEffect(() => {
    if (!focusRelation || !focusWeaveAction) return;
    if (focusWeaveAction === 'review') return;
    if (editingWeaveId === focusRelation.id) return;
    startEditingWeave(focusRelation);
    if (focusWeaveAction === 'question') {
      setEditTensions((current) => current.trim().length > 0
        ? `${current}\nQuestion whether this link truly holds as stated.`
        : 'Question whether this link truly holds as stated.');
    }
  }, [editingWeaveId, focusRelation, focusWeaveAction]);

  const visibleDocIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = new Set<string>();
    const workDocIds = new Set<string>();
    if (lens === 'work') {
      for (const panel of panels) {
        if (isLearningTargetInWorkQueue(buildPanelLearningTarget(panel), targetState.state)) {
          workDocIds.add(panel.docId);
        }
      }
      for (const weave of weaves) {
        const target = buildWeaveLearningTarget(weave, panels);
        if (target && isLearningTargetInWorkQueue(target, targetState.state)) {
          workDocIds.add(weave.fromPanelId);
          workDocIds.add(weave.toPanelId);
        }
      }
    }
    const matchesBaseFilters = (panel: PanelNode) => {
      const matchesLens = lens === 'all' || workDocIds.has(panel.docId);
      const matchesFamily = familyFilter === 'all' || panel.family === familyFilter;
      const matchesQuery = !q
        || panel.title.toLowerCase().includes(q)
        || panel.summary.toLowerCase().includes(q)
        || panel.family.toLowerCase().includes(q);
      return matchesLens && matchesFamily && matchesQuery;
    };

    if (scopeFilter === 'all' || !focusPanel) {
      for (const panel of panels) {
        if (matchesBaseFilters(panel)) ids.add(panel.docId);
      }
    } else {
      ids.add(focusPanel.docId);
      const related =
        scopeFilter === 'incoming'
          ? focusRelated.incoming
          : scopeFilter === 'outgoing'
            ? focusRelated.outgoing
            : [...focusRelated.incoming, ...focusRelated.outgoing];
      for (const item of related) {
        if (matchesBaseFilters(item.panel)) ids.add(item.panel.docId);
      }
    }

    if (focusPanel) ids.add(focusPanel.docId);
    return ids;
  }, [familyFilter, focusPanel, focusRelated.incoming, focusRelated.outgoing, lens, panels, query, scopeFilter, targetState.state, weaves]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => visibleDocIds.has(node.id)),
    [nodes, visibleDocIds],
  );
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleDocIds.has(edge.source) && visibleDocIds.has(edge.target)),
    [edges, visibleDocIds],
  );

  useEffect(() => {
    syncGraphParams({
      docId: focusDocId,
      relationId: focusWeaveId,
      relationAction: focusWeaveAction,
      lens,
      query,
      family: familyFilter,
      scope: scopeFilter,
    });
  }, [familyFilter, focusDocId, focusWeaveAction, focusWeaveId, lens, query, scopeFilter]);

  const focusPanelNode = (panel: PanelNode) => {
    setFocusDocId(panel.docId);
    setFocusWeaveId(null);
    setFocusWeaveAction(null);
    setScopeFilter((prev) => (prev === 'all' ? 'nearby' : prev));
  };

  const markWeave = async (id: string, status: 'confirmed' | 'rejected') => {
    await setWeaveStatus(id, status);
  };

  const startEditingWeave = (weave: RelatedPanel) => {
    setEditingWeaveId(weave.id);
    setEditClaim(weave.claim);
    setEditWhyItHolds(weave.whyItHolds);
    setEditTensions(weave.openTensions.join('\n'));
  };

  const questionWeave = (weave: RelatedPanel) => {
    setEditingWeaveId(weave.id);
    setEditClaim(weave.claim);
    setEditWhyItHolds(weave.whyItHolds);
    setEditTensions(
      [...weave.openTensions, 'Question whether this link truly holds as stated.']
        .filter(Boolean)
        .join('\n'),
    );
  };

  const saveWeaveContract = async () => {
    if (!editingWeaveId) return;
    await updateWeaveContract(editingWeaveId, {
      claim: editClaim.trim(),
      whyItHolds: editWhyItHolds.trim(),
      openTensions: editTensions.split('\n').map((line) => line.trim()).filter(Boolean),
    });
    setEditingWeaveId(null);
  };

  const clearFocus = () => {
    setFocusDocId(null);
    setFocusWeaveId(null);
    setFocusWeaveAction(null);
    setScopeFilter('all');
  };

  const copyView = async () => {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const openReview = (panel: PanelNode, anchorId?: string | null) => {
    openPanelReview(router, {
      href: panel.href,
      anchorId: anchorId ?? panel.latestAnchorId,
    });
  };

  const openRefresh = (panel: PanelNode) => {
    continuePanelLifecycle(router, {
      href: panel.href,
      nextAction: 'refresh',
      latestAnchorId: panel.latestAnchorId,
      refreshSource: 'graph',
    });
  };

  const openPrimaryAction = (panel: PanelNode) => {
    if (panel.learning.nextAction === 'revisit') return openReview(panel);
    continuePanelLifecycle(router, {
      href: panel.href,
      nextAction: panel.learning.nextAction,
      latestAnchorId: panel.latestAnchorId,
      refreshSource: 'graph',
    });
  };

  const openRelationEvidence = (
    direction: 'incoming' | 'outgoing',
    related: RelatedPanel,
  ) => {
    const evidenceAnchorId = related.evidence[0]?.anchorId ?? null;
    if (!evidenceAnchorId) {
      return openReview(direction === 'incoming' ? related.panel : (focusPanel ?? related.panel));
    }
    if (direction === 'incoming') {
      return openReview(related.panel, evidenceAnchorId);
    }
    if (focusPanel) {
      return openReview(focusPanel, evidenceAnchorId);
    }
    return openReview(related.panel, evidenceAnchorId);
  };

  if (loading || weavesLoading) {
    return (
      <StageShell
        variant="map"
        contentVariant="map"
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          paddingTop: '4rem',
          paddingBottom: '2rem',
        }}
      >
        <GraphQuietState
          eyebrow="Relations"
          title="Preparing the relation surface"
          summary="Graph is reading the current pattern and weave layer. This should load in a moment."
        />
      </StageShell>
    );
  }
  if (panelCount === 0) {
    return (
      <StageShell
        variant="map"
        contentVariant="map"
        style={{
          minHeight: '100vh',
          background: 'var(--bg)',
          paddingTop: '4rem',
          paddingBottom: '2rem',
        }}
      >
        <GraphQuietState
          eyebrow="Relations"
          title="No relations yet"
          summary="Graph becomes meaningful after you crystallize a few patterns and add references between them. Start from Atlas, read a source, and crystallize the first pattern."
          actions={[
            { label: 'Open Atlas', onClick: () => router.push('/atlas'), primary: true },
            { label: 'Open Patterns', onClick: () => router.push('/patterns') },
          ]}
        />
      </StageShell>
    );
  }

  return (
    <StageShell
      variant="map"
      contentVariant="map"
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        paddingTop: '1rem',
        paddingBottom: '1rem',
      }}
      innerStyle={{
        minHeight: 'calc(100vh - 2rem)',
      }}
    >
      <div
        style={{
          width: '100%',
          minHeight: 'calc(100vh - 2rem)',
          display: 'flex',
          flexDirection: 'column',
          background: 'color-mix(in srgb, var(--bg-elevated) 94%, white)',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-1)',
          overflow: 'hidden',
        }}
      >
      <div style={{ padding: '1rem 1.5rem 0.9rem', borderBottom: '0.5px solid var(--mat-border)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
          Relations
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0.25rem 0 0.65rem',
            marginTop: 14,
            borderTop: '0.5px solid var(--mat-border)',
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a panel…"
            aria-label="Find a panel"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 'none',
              background: 'transparent',
              color: 'var(--fg)',
              fontFamily: 'var(--display)',
              fontSize: '0.92rem',
              letterSpacing: '-0.01em',
            }}
          />
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            style={focusLinkStyle}
          >
            {showFilters ? 'Hide lenses' : 'Show lenses'}
          </button>
        </div>
        <div
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            marginTop: 10,
            letterSpacing: '0.04em',
          }}
        >
          {panelCount} panels · {relationCount} relations · {lens === 'all' ? 'all work' : 'work queue'}
          {familyFilter !== 'all' ? ` · ${familyFilter}` : ''}
          {focusPanel && scopeFilter !== 'all' ? ` · ${scopeFilter}` : ''}
        </div>
        {showFilters && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              {([
                ['all', 'All'],
                ['work', 'Work queue'],
              ] as const).map(([value, label]) => {
                const active = lens === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLens(value)}
                    style={{
                      appearance: 'none',
                      border: 0,
                      borderBottom: `0.5px solid ${active ? 'var(--accent)' : 'var(--mat-border)'}`,
                      background: 'transparent',
                      color: active ? 'var(--accent)' : 'var(--fg-secondary)',
                      padding: '0.28rem 0',
                      fontSize: '0.76rem',
                      fontWeight: active ? 700 : 600,
                      letterSpacing: '0.02em',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              {familyOptions.map((family) => {
                const active = familyFilter === family;
                return (
                  <button
                    key={family}
                    type="button"
                    onClick={() => setFamilyFilter(family)}
                    style={{
                      appearance: 'none',
                      border: 0,
                      borderBottom: `0.5px solid ${active ? 'var(--accent)' : 'var(--mat-border)'}`,
                      background: 'transparent',
                      color: active ? 'var(--accent)' : 'var(--fg-secondary)',
                      padding: '0.28rem 0',
                      fontSize: '0.76rem',
                      fontWeight: active ? 700 : 600,
                      letterSpacing: '0.02em',
                      cursor: 'pointer',
                    }}
                  >
                    {family === 'all' ? 'All' : family}
                  </button>
                );
              })}
            </div>
            {focusPanel && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                {([
                  ['all', 'All'],
                  ['nearby', 'Nearby'],
                  ['incoming', 'Incoming'],
                  ['outgoing', 'Outgoing'],
                ] as const).map(([value, label]) => {
                  const active = scopeFilter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setScopeFilter(value)}
                      style={{
                        appearance: 'none',
                        border: 0,
                        borderBottom: `0.5px solid ${active ? 'var(--accent)' : 'var(--mat-border)'}`,
                        background: 'transparent',
                        color: active ? 'var(--accent)' : 'var(--fg-secondary)',
                        padding: '0.28rem 0',
                        fontSize: '0.76rem',
                        fontWeight: active ? 700 : 600,
                        letterSpacing: '0.02em',
                        cursor: 'pointer',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {focusPanel && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '0.5px solid var(--mat-border)',
            }}
          >
            <div style={{ display: 'flex', flexDirection: compactGraph ? 'column' : 'row', alignItems: 'flex-start', gap: 16, flexWrap: 'nowrap' }}>
              <div
                style={{
                  flex: compactGraph ? '1 1 auto' : '1 1 var(--map-focus-width)',
                  minWidth: 0,
                  maxWidth: compactGraph ? '100%' : 'var(--map-focus-width)',
                  width: compactGraph ? '100%' : 'auto',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--display)',
                    fontSize: '1rem',
                    fontWeight: 600,
                    letterSpacing: '-0.016em',
                    lineHeight: 1.35,
                    marginBottom: 6,
                  }}
                >
                  {focusPanel.title}
                </div>
                <div
                  className="t-caption2"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    color: 'var(--muted)',
                    letterSpacing: '0.04em',
                    marginBottom: 8,
                  }}
                >
                  <span>{focusPanel.family}</span>
                  <span aria-hidden>·</span>
                  <span>{new Date(focusPanel.crystallizedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  {panelStateLabel(focusPanel) && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{panelStateLabel(focusPanel)}</span>
                    </>
                  )}
                  {focusPanelState && <LearningTargetStateBadge label={focusPanelState.label} />}
                </div>
                {focusPanelReturnLabel && (
                  <div className="t-caption2" style={{ color: 'var(--muted)', marginBottom: 8 }}>
                    Returned · {focusPanelReturnLabel}
                  </div>
                )}
                <div
                  style={{
                    color: 'var(--fg-secondary)',
                    fontSize: '0.84rem',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {focusPanel.summary || 'This panel is woven, and its threads are visible here.'}
                </div>
                {focusRevisionDelta && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '0.7rem 0.8rem',
                      borderRadius: 10,
                      border: '0.5px solid var(--mat-border)',
                      background: focusPanel.status === 'contested'
                        ? 'color-mix(in srgb, var(--tint-orange) 8%, var(--bg-elevated))'
                        : 'color-mix(in srgb, var(--accent) 5%, var(--bg-elevated))',
                    }}
                  >
                    <div
                      className="t-caption2"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                        color: focusPanel.status === 'contested' ? 'var(--tint-orange)' : 'var(--accent)',
                        letterSpacing: '0.06em',
                        fontWeight: 700,
                        marginBottom: 6,
                      }}
                    >
                      <span>{focusPanel.status === 'contested' ? 'Relation view sees a panel in revision' : 'Changed since last settling'}</span>
                      {focusPanelResolved && (
                        <>
                          <span aria-hidden>·</span>
                          <span>Resolved for this change</span>
                        </>
                      )}
                    </div>
                    {focusRevisionDelta.summaryChanged && focusCurrentRevision?.summary && (
                      <div style={{ color: 'var(--fg)', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: 6 }}>
                        <strong>Now:</strong> {focusCurrentRevision.summary}
                      </div>
                    )}
                    {focusRevisionDelta.centralClaimChanged && focusCurrentRevision?.centralClaim && focusCurrentRevision.centralClaim !== focusCurrentRevision.summary && (
                      <div style={{ color: 'var(--fg-secondary)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 6 }}>
                        <strong style={{ color: 'var(--fg)' }}>Claim:</strong> {focusCurrentRevision.centralClaim}
                      </div>
                    )}
                    <RevisionDeltaInline label="Added distinctions" items={focusRevisionDelta.addedDistinctions} tone="accent" />
                    <RevisionDeltaInline label="Opened tensions" items={focusRevisionDelta.addedTensions} tone="warning" />
                    <RevisionDeltaInline label="Closed tensions" items={focusRevisionDelta.removedTensions} tone="muted" />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      {focusRevisionSeed && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!focusPanel) return;
                            if (focusPanelTarget) workSession.setResolutionKind(focusPanelTarget, 'reworked');
                            setOverlayResume({
                              href: focusPanel.href,
                              overlay: 'rehearsal',
                              seedDraft: focusRevisionSeed.seedDraft,
                              seedLabel: focusRevisionSeed.seedLabel,
                            });
                            router.push(focusPanel.href);
                          }}
                          style={focusLinkStyle}
                        >
                          Rework this change
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (!focusPanel) return;
                          if (focusPanelTarget) workSession.setResolutionKind(focusPanelTarget, 'verified');
                          continuePanelLifecycle(router, {
                            href: focusPanel.href,
                            nextAction: 'examine',
                            latestAnchorId: focusPanel.latestAnchorId,
                            refreshSource: 'graph',
                          });
                        }}
                        style={focusLinkStyle}
                      >
                        Verify this revision
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!focusPanel) return;
                          openReview(focusPanel);
                        }}
                        style={focusLinkStyle}
                      >
                        Re-read source
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  flex: compactGraph ? '1 1 auto' : '1 1 var(--map-related-width)',
                  minWidth: 0,
                  maxWidth: compactGraph ? '100%' : 'var(--map-related-width)',
                  width: compactGraph ? '100%' : 'auto',
                }}
              >
                {focusRelation && (
                  <div
                    style={{
                      padding: '0.7rem 0.8rem',
                      borderRadius: 10,
                      border: '0.5px solid var(--mat-border)',
                      background: 'color-mix(in srgb, var(--accent) 5%, var(--bg-elevated))',
                    }}
                  >
                    <div className="t-caption2" style={{ color: 'var(--accent)', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 6 }}>
                      {focusWeaveId ? 'Focused relation' : 'Strongest current relation'}
                    </div>
                    {focusWeaveState && (
                      <div className="t-caption2" style={{ color: 'var(--muted)', marginBottom: 6 }}>
                        {focusWeaveState.label}
                        {focusWeaveReturnLabel ? ` · Returned · ${focusWeaveReturnLabel}` : ''}
                      </div>
                    )}
                    {focusWeaveResolved && (
                      <div className="t-caption2" style={{ color: 'var(--muted)', marginBottom: 6 }}>
                        Resolved for this change
                      </div>
                    )}
                    {editingWeaveId === focusRelation.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea
                          value={editClaim}
                          onChange={(e) => setEditClaim(e.target.value)}
                          placeholder="Relation claim"
                          aria-label="Relation claim"
                          style={weaveEditorStyle}
                        />
                        <textarea
                          value={editWhyItHolds}
                          onChange={(e) => setEditWhyItHolds(e.target.value)}
                          placeholder="Why this relation holds"
                          aria-label="Why this relation holds"
                          style={weaveEditorStyle}
                        />
                        <textarea
                          value={editTensions}
                          onChange={(e) => setEditTensions(e.target.value)}
                          placeholder="One open tension per line"
                          aria-label="Open tensions, one per line"
                          style={{ ...weaveEditorStyle, minHeight: 72 }}
                        />
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          <button type="button" onClick={() => void saveWeaveContract()} style={focusLinkStyle}>
                            Save relation
                          </button>
                          <button type="button" onClick={() => setEditingWeaveId(null)} style={focusLinkStyle}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ color: 'var(--fg)', fontSize: '0.82rem', lineHeight: 1.5, marginBottom: 4 }}>
                          {focusRelation.claim}
                        </div>
                        <div style={{ color: 'var(--fg-secondary)', fontSize: '0.78rem', lineHeight: 1.45 }}>
                          {focusRelation.whyItHolds}
                        </div>
                        {focusRelation.openTensions.length > 0 && (
                          <div style={{ color: 'var(--tint-orange)', fontSize: '0.74rem', lineHeight: 1.45, marginTop: 6 }}>
                            {focusRelation.openTensions[0]}
                          </div>
                        )}
                        {strongestRelationDelta && (
                          <div style={{ marginTop: 8 }}>
                            <div className="t-caption2" style={{ color: 'var(--muted)', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 4 }}>
                              {weaveRevisionLabel(focusRelation)} · {weaveRevisionCount(focusRelation)}
                            </div>
                            {strongestRelationDelta.claimChanged && strongestRelationCurrentRevision?.claim && (
                              <div style={{ color: 'var(--fg)', fontSize: '0.76rem', lineHeight: 1.45, marginBottom: 4 }}>
                                <strong>Now:</strong> {strongestRelationCurrentRevision.claim}
                              </div>
                            )}
                            {strongestRelationDelta.whyChanged && strongestRelationCurrentRevision?.whyItHolds && (
                              <div style={{ color: 'var(--fg-secondary)', fontSize: '0.74rem', lineHeight: 1.45, marginBottom: 4 }}>
                                <strong style={{ color: 'var(--fg)' }}>Why:</strong> {strongestRelationCurrentRevision.whyItHolds}
                              </div>
                            )}
                            <RevisionDeltaInline label="Opened tensions" items={strongestRelationDelta.addedTensions} tone="warning" />
                            <RevisionDeltaInline label="Closed tensions" items={strongestRelationDelta.removedTensions} tone="muted" />
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                          <button
                            type="button"
                            onClick={() => startEditingWeave(focusRelation)}
                            style={focusLinkStyle}
                          >
                            Refine relation
                          </button>
                          {strongestRelationSeed && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!focusPanel) return;
                                if (focusWeaveTarget) workSession.setResolutionKind(focusWeaveTarget, 'strengthened');
                                setOverlayResume({
                                  href: focusPanel.href,
                                  overlay: 'rehearsal',
                                  seedDraft: strongestRelationSeed.seedDraft,
                                  seedLabel: strongestRelationSeed.seedLabel,
                                });
                                router.push(focusPanel.href);
                              }}
                              style={focusLinkStyle}
                            >
                              Strengthen this relation
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (focusWeaveTarget) workSession.setResolutionKind(focusWeaveTarget, 'questioned');
                              questionWeave(focusRelation);
                            }}
                            style={focusLinkStyle}
                          >
                            Question this link
                          </button>
                          <button
                            type="button"
                            onClick={() => openRelationEvidence(focusRelation.direction, focusRelation)}
                            style={focusLinkStyle}
                          >
                            Re-read source evidence
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!focusPanel) return;
                              if (focusWeaveTarget) workSession.setResolutionKind(focusWeaveTarget, 'verified');
                              continuePanelLifecycle(router, {
                                href: focusPanel.href,
                                nextAction: 'examine',
                                latestAnchorId: focusPanel.latestAnchorId,
                                refreshSource: 'graph',
                              });
                            }}
                            style={focusLinkStyle}
                          >
                            Verify this connection
                          </button>
                        </div>
                        {focusWeaveTarget && (
                          <LearningTargetStateControls
                            target={focusWeaveTarget}
                            buttonStyle={focusLinkStyle}
                          />
                        )}
                        {focusWeaveSessionMatch && (
                          <WorkSessionHandoff
                            currentTarget={currentSessionTarget}
                            nextTarget={nextSessionTarget}
                            buttonStyle={focusLinkStyle}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}
                {(focusRelated.incoming.length > 0 || focusRelated.outgoing.length > 0) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {focusRelated.incoming.length > 0 && (
                      <RelatedList
                        label="Referenced by"
                        direction="incoming"
                        items={focusRelated.incoming}
                        panels={panels}
                        targetState={targetState.state}
                        weaves={weaves}
                        lens={lens}
                        onSelect={focusPanelNode}
                        onOpenEvidence={openRelationEvidence}
                        onConfirm={markWeave}
                        onReject={markWeave}
                      />
                    )}
                    {focusRelated.outgoing.length > 0 && (
                      <RelatedList
                        label="Points to"
                        direction="outgoing"
                        items={focusRelated.outgoing}
                        panels={panels}
                        targetState={targetState.state}
                        weaves={weaves}
                        lens={lens}
                        onSelect={focusPanelNode}
                        onOpenEvidence={openRelationEvidence}
                        onConfirm={markWeave}
                        onReject={markWeave}
                      />
                    )}
                  </div>
                )}
              </div>
              <div
                className="t-caption2"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 4,
                  flexBasis: '100%',
                  width: '100%',
                }}
              >
                <button type="button" onClick={() => router.push(focusPanel.href)} style={focusLinkStyle}>
                  Open this source
                </button>
                <button type="button" onClick={() => openPrimaryAction(focusPanel)} style={focusLinkStyle}>
                  {primaryActionLabel(focusPanel.learning.nextAction)}
                </button>
                <button type="button" onClick={clearFocus} style={focusLinkStyle}>
                  Clear focus
                </button>
              </div>
              {focusPanelTarget && (
                <LearningTargetStateControls
                  target={focusPanelTarget}
                  buttonStyle={focusLinkStyle}
                />
              )}
              {focusPanelSessionMatch && !focusWeaveSessionMatch && (
                <WorkSessionHandoff
                  currentTarget={currentSessionTarget}
                  nextTarget={nextSessionTarget}
                  buttonStyle={focusLinkStyle}
                />
              )}
            </div>
          </div>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 480 }}>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          fitView
          minZoom={0.35}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            const panel = panelByDocId.get(node.id);
            if (panel) focusPanelNode(panel);
          }}
          onPaneClick={clearFocus}
        >
          <Background color="var(--mat-border)" gap={24} size={0.8} />
        </ReactFlow>
      </div>
    </div>
    </StageShell>
  );
}

const focusLinkStyle = {
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

const weaveEditorStyle = {
  width: '100%',
  minHeight: 56,
  padding: '0.55rem 0.65rem',
  borderRadius: 10,
  border: '0.5px solid var(--mat-border)',
  background: 'color-mix(in srgb, var(--bg-elevated) 92%, white)',
  color: 'var(--fg)',
  fontFamily: 'var(--display)',
  fontSize: '0.78rem',
  lineHeight: 1.45,
  resize: 'vertical' as const,
};

function GraphQuietState({
  eyebrow,
  title,
  summary,
  actions,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  actions?: Array<{ label: string; onClick: () => void; primary?: boolean }>;
}) {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 8rem)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: 'min(760px, 100%)' }}>
        <QuietGuideCard
          eyebrow={eyebrow}
          title={title}
          summary={summary}
          actions={actions}
        />
      </div>
    </div>
  );
}

function RevisionDeltaInline({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: 'accent' | 'warning' | 'muted';
}) {
  if (items.length === 0) return null;
  const color = tone === 'accent'
    ? 'var(--accent)'
    : tone === 'warning'
      ? 'var(--tint-orange)'
      : 'var(--fg-secondary)';

  return (
    <div style={{ marginTop: 6 }}>
      <div className="t-caption2" style={{ color, letterSpacing: '0.04em', fontWeight: 700, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item) => (
          <div key={`${label}:${item}`} style={{ color: 'var(--fg-secondary)', fontSize: '0.78rem', lineHeight: 1.45 }}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatedList({
  label,
  direction,
  items,
  panels,
  targetState,
  weaves,
  lens,
  onSelect,
  onOpenEvidence,
  onConfirm,
  onReject,
}: {
  label: string;
  direction: 'incoming' | 'outgoing';
  items: RelatedPanel[];
  panels: PanelNode[];
  targetState: import('../../lib/learning-target-state').LearningTargetState;
  weaves: import('../../lib/weave').Weave[];
  lens: GraphLens;
  onSelect: (panel: PanelNode) => void;
  onOpenEvidence: (direction: 'incoming' | 'outgoing', related: RelatedPanel) => void;
  onConfirm: (id: string, status: 'confirmed' | 'rejected') => Promise<void>;
  onReject: (id: string, status: 'confirmed' | 'rejected') => Promise<void>;
}) {
  const orderedItems = [...items]
    .filter((item) => {
      if (lens !== 'work') return true;
      const panelTarget = buildPanelLearningTarget(item.panel);
      const panelInQueue = isLearningTargetInWorkQueue(panelTarget, targetState);
      const weaveRecord = weaves.find((weave) => weave.id === item.id) ?? null;
      const weaveTarget = weaveRecord ? buildWeaveLearningTarget(weaveRecord, panels) : null;
      const weaveInQueue = weaveTarget ? isLearningTargetInWorkQueue(weaveTarget, targetState) : false;
      return panelInQueue || weaveInQueue;
    })
    .sort((a, b) => {
    const aPanelTarget = buildPanelLearningTarget(a.panel);
    const bPanelTarget = buildPanelLearningTarget(b.panel);
    const aPanelRank = learningTargetStateRank(aPanelTarget, targetState);
    const bPanelRank = learningTargetStateRank(bPanelTarget, targetState);
    const aWeaveRecord = weaves.find((weave) => weave.id === a.id) ?? null;
    const bWeaveRecord = weaves.find((weave) => weave.id === b.id) ?? null;
    const aWeaveTarget = aWeaveRecord ? buildWeaveLearningTarget(aWeaveRecord, panels) : null;
    const bWeaveTarget = bWeaveRecord ? buildWeaveLearningTarget(bWeaveRecord, panels) : null;
    const aWeaveRank = aWeaveTarget ? learningTargetStateRank(aWeaveTarget, targetState) : 1;
    const bWeaveRank = bWeaveTarget ? learningTargetStateRank(bWeaveTarget, targetState) : 1;
    const aRank = Math.min(aPanelRank, aWeaveRank);
    const bRank = Math.min(bPanelRank, bWeaveRank);
      return aRank - bRank || b.weight - a.weight || a.panel.title.localeCompare(b.panel.title);
    });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        className="t-caption2"
        style={{
          color: 'var(--muted)',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {orderedItems.slice(0, 5).map((related) => {
          const panelTarget = buildPanelLearningTarget(related.panel);
          const panelState = describeLearningTargetState(panelTarget, targetState);
          const panelReturnLabel = learningTargetReturnLabel(panelTarget, targetState);
          const weaveRecord = weaves.find((weave) => weave.id === related.id) ?? null;
          const weaveTarget = weaveRecord ? buildWeaveLearningTarget(weaveRecord, panels) : null;
          const weaveState = weaveTarget ? describeLearningTargetState(weaveTarget, targetState) : null;
          const weaveReturnLabel = weaveTarget ? learningTargetReturnLabel(weaveTarget, targetState) : null;

          return (
            <div
              key={`${label}-${related.panel.docId}`}
              style={{
                padding: '0.38rem 0',
                borderTop: '0.5px solid var(--mat-border)',
              }}
            >
                <button
                  type="button"
                  onClick={() => onSelect(related.panel)}
                  style={{
                    appearance: 'none',
                    border: 0,
                    padding: 0,
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 6,
                      flexWrap: 'wrap',
                      fontSize: '0.76rem',
                      lineHeight: 1.35,
                    }}
                  >
                    <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                      {related.panel.title}
                    </span>
                    {panelStateLabel(related.panel) && (
                      <span style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>
                        · {panelStateLabel(related.panel)}
                      </span>
                    )}
                    {panelState && <LearningTargetStateBadge label={panelState.label} />}
                    {weaveState && <LearningTargetStateBadge label={weaveState.label} />}
                  </div>
                  <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 3 }}>
                    {related.contractSource === 'confirmed' ? 'Held relation' : 'Derived relation'}
                  </div>
                  {(panelReturnLabel || weaveReturnLabel) && (
                    <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 3 }}>
                      Returned · {[weaveReturnLabel, panelReturnLabel].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div
                    style={{
                      color: 'var(--fg)',
                      fontSize: '0.75rem',
                      lineHeight: 1.42,
                      marginTop: 4,
                    }}
                  >
                    {related.claim}
                  </div>
                  <div
                    style={{
                      color: 'var(--fg-secondary)',
                      fontSize: '0.73rem',
                      lineHeight: 1.42,
                      marginTop: 2,
                    }}
                  >
                    {related.whyItHolds}
                  </div>
                  {related.evidence[0]?.snippet ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenEvidence(direction, related);
                      }}
                      style={{
                        appearance: 'none',
                        border: 0,
                        padding: 0,
                        background: 'transparent',
                        textAlign: 'left',
                        cursor: 'pointer',
                        color: 'var(--fg-secondary)',
                        fontSize: '0.73rem',
                        lineHeight: 1.42,
                        marginTop: 2,
                      }}
                    >
                      {related.evidence[0].snippet}
                    </button>
                  ) : null}
                  {related.openTensions.length > 0 && (
                    <div style={{ color: 'var(--tint-orange)', fontSize: '0.72rem', lineHeight: 1.4, marginTop: 4 }}>
                      {related.openTensions[0]}
                    </div>
                  )}
                </button>
                <div
                  className="t-caption2"
                  style={{
                    marginTop: 5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    color: 'var(--muted)',
                  }}
                  onClick={(event) => event.stopPropagation()}
                >
                  {related.status === 'suggested' ? (
                    <>
                      <button type="button" onClick={() => void onConfirm(related.id, 'confirmed')} style={focusLinkStyle}>
                        Confirm
                      </button>
                      <button type="button" onClick={() => void onReject(related.id, 'rejected')} style={focusLinkStyle}>
                        Reject
                      </button>
                    </>
                  ) : (
                    <span>{related.status === 'confirmed' ? 'Confirmed' : 'Rejected'}</span>
                  )}
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
