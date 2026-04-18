'use client';
/**
 * /dev/traces — Trace inspector and debug surface.
 *
 * - Live list of all Traces in IndexedDB
 * - Stats by kind
 * - Click a trace to see its full event log
 * - Buttons: create test trace, append test event, delete, reset migration, clear all
 *
 * Not linked from the main nav. Reach it by typing /dev/traces in the URL bar.
 */
import { useState } from 'react';
import {
  useAllTraces,
  useTraceStats,
  useCreateTrace,
  useAppendEvent,
  useDeleteTrace,
  traceStore,
  resetMigrationFlag,
  isMigrated,
  buildEmbeddingIndex,
  getEmbeddingPipelineState,
  getAllCachedEmbeddings,
  clearAllEmbeddings,
  onIndexProgress,
  type Trace,
} from '../../../lib/trace';
import { panelStore, emitPanelChange, useAllPanels } from '../../../lib/panel';
import { weaveStore, emitWeaveChange, useAllWeaves } from '../../../lib/weave';
import { emitWorkSessionChange } from '../../../lib/work-session-events';
import { emitLearningTargetStateChange } from '../../../lib/learning-target-state-events';
import { toast, ToastHost } from '../../../components/Toast';
import { useEffect } from 'react';

export default function TraceInspectorPage() {
  const { traces, loading } = useAllTraces();
  const { panels } = useAllPanels();
  const { weaves } = useAllWeaves();
  const stats = useTraceStats();
  const create = useCreateTrace();
  const append = useAppendEvent();
  const del = useDeleteTrace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [embeddingCount, setEmbeddingCount] = useState(0);
  const [pipelineState, setPipelineState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [indexProgress, setIndexProgress] = useState<{ done: number; total: number } | null>(null);

  // Refresh embedding count + pipeline state
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const embs = await getAllCachedEmbeddings();
      if (!cancelled) setEmbeddingCount(embs.length);
      const s = getEmbeddingPipelineState();
      if (!cancelled) setPipelineState(s.state);
    };
    refresh();
    const i = window.setInterval(refresh, 1500);
    const off = onIndexProgress((p) => {
      setIndexProgress(p);
      if (p.done >= p.total) setTimeout(() => setIndexProgress(null), 800);
    });
    return () => {
      cancelled = true;
      clearInterval(i);
      off();
    };
  }, []);

  const runIndexer = async () => {
    if (traces.length === 0) { toast('No traces to embed', { kind: 'warn' }); return; }
    toast(`Embedding ${traces.length} trace(s)…`);
    setIndexProgress({ done: 0, total: traces.length });
    try {
      const r = await buildEmbeddingIndex(traces);
      toast(`✓ Embedded ${r.embedded} new`);
    } catch (e: any) {
      toast(`Failed: ${e.message}`, { kind: 'error' });
    }
  };

  const wipeEmbeddings = async () => {
    if (!confirm('Wipe all cached embeddings?')) return;
    await clearAllEmbeddings();
    setEmbeddingCount(0);
    toast('Cleared embeddings');
  };

  const selected = traces.find((t) => t.id === selectedId) ?? null;

  const createTest = async () => {
    const t = await create({
      kind: 'reading',
      title: `Test trace · ${new Date().toLocaleTimeString()}`,
      source: {
        docId: 'wiki/test',
        href: '/wiki/test',
        sourceTitle: 'Test source',
      },
      initialEvents: [
        { kind: 'visit', at: Date.now(), durationMs: 60000 },
        { kind: 'message', role: 'user', content: 'What is a Trace in Loom?', at: Date.now() },
        { kind: 'message', role: 'assistant', content: 'A Trace is one unit of learning interaction — a bounded panel of dialogue, highlights, and notes around a single topic.', at: Date.now() + 1000 },
      ],
    });
    setSelectedId(t.id);
    toast(`Created ${t.id}`);
  };

  const seedWorkFixture = async () => {
    const now = Date.now();
    const alphaPanel = {
      id: 'pl_doc_alpha',
      docId: 'doc:alpha',
      href: '/about',
      title: 'Alpha Source',
      sourceDocIds: ['doc:alpha'],
      traceIds: ['t_alpha'],
      anchorIds: ['anchor-alpha'],
      latestAnchorId: 'anchor-alpha',
      summary: 'Alpha links outward to Beta.',
      centralClaim: 'Alpha is still unsettled.',
      keyDistinctions: ['Alpha vs beta'],
      openTensions: ['Clarify whether alpha should be merged into beta.'],
      contractSource: 'derived' as const,
      contractUpdatedAt: now - 1000,
      revisions: [
        {
          at: now - 1000,
          summary: 'Alpha links outward to Beta.',
          centralClaim: 'Alpha is still unsettled.',
          keyDistinctions: ['Alpha vs beta'],
          openTensions: ['Clarify whether alpha should be merged into beta.'],
        },
      ],
      learning: {
        nextAction: 'revisit' as const,
        recency: 'fresh' as const,
        touchedAt: now - 1000,
        anchorCount: 1,
      },
      status: 'contested' as const,
      createdAt: now - 9000,
      updatedAt: now - 1000,
      crystallizedAt: now - 4000,
      sections: [
        {
          key: 'alpha-1',
          anchorId: 'anchor-alpha',
          summary: 'Alpha links outward to Beta.',
          quote: 'Alpha quote',
          thoughtType: 'question' as const,
          at: now - 1500,
        },
      ],
    };
    const betaPanel = {
      id: 'pl_doc_beta',
      docId: 'doc:beta',
      href: '/help',
      title: 'Beta Source',
      sourceDocIds: ['doc:beta'],
      traceIds: ['t_beta'],
      anchorIds: ['anchor-beta'],
      latestAnchorId: 'anchor-beta',
      summary: 'Beta stands alone.',
      centralClaim: 'Beta needs refresh.',
      keyDistinctions: ['Beta stands apart'],
      openTensions: [],
      contractSource: 'derived' as const,
      contractUpdatedAt: now - 2000,
      revisions: [],
      learning: {
        nextAction: 'refresh' as const,
        recency: 'stale' as const,
        touchedAt: now - 15 * 24 * 60 * 60 * 1000,
        anchorCount: 1,
      },
      status: 'settled' as const,
      createdAt: now - 20 * 24 * 60 * 60 * 1000,
      updatedAt: now - 15 * 24 * 60 * 60 * 1000,
      crystallizedAt: now - 18 * 24 * 60 * 60 * 1000,
      sections: [
        {
          key: 'beta-1',
          anchorId: 'anchor-beta',
          summary: 'Beta stands alone.',
          quote: 'Beta quote',
          thoughtType: 'explanation' as const,
          at: now - 15 * 24 * 60 * 60 * 1000,
        },
      ],
    };
    const alphaBetaWeave = {
      id: 'wv_references_doc_alpha__doc_beta',
      fromPanelId: 'doc:alpha',
      toPanelId: 'doc:beta',
      kind: 'references' as const,
      status: 'suggested' as const,
      evidence: [
        {
          anchorId: 'anchor-alpha',
          snippet: 'Alpha note with relation to Beta.',
          at: now - 1500,
        },
      ],
      claim: 'Alpha should probably connect to Beta.',
      whyItHolds: 'Alpha explicitly links to Beta.',
      openTensions: ['Decide whether this relation should be confirmed.'],
      contractSource: 'derived' as const,
      contractUpdatedAt: now - 1000,
      revisions: [],
      createdAt: now - 1600,
      updatedAt: now - 1000,
    };
    const existingPanels = await panelStore.getAll();
    if (existingPanels.length > 0) {
      await panelStore.deleteMany(existingPanels.map((panel) => panel.id));
    }
    const existingWeaves = await weaveStore.getAll();
    if (existingWeaves.length > 0) {
      await weaveStore.deleteMany(existingWeaves.map((weave) => weave.id));
    }
    await traceStore.clear();

    const alpha = await create({
      kind: 'reading',
      title: 'Alpha trace',
      source: {
        docId: 'doc:alpha',
        href: '/about',
        sourceTitle: 'Alpha Source',
      },
      initialEvents: [
        { kind: 'visit', at: now - 8_000, durationMs: 120_000 },
        {
          kind: 'thought-anchor',
          anchorType: 'paragraph',
          anchorId: 'anchor-alpha',
          anchorBlockId: 'anchor-alpha',
          anchorBlockText: 'Alpha block',
          summary: 'Alpha links outward to Beta.',
          content: 'Alpha note with relation to [Beta](/help).',
          quote: 'Alpha quote',
          thoughtType: 'question',
          attribution: 'mixed',
          at: now - 1_500,
        },
        { kind: 'crystallize', summary: 'Alpha settled once', at: now - 4_000 },
        { kind: 'panel-reopen', at: now - 1_000 },
      ],
    });

    await create({
      kind: 'reading',
      title: 'Beta trace',
      source: {
        docId: 'doc:beta',
        href: '/help',
        sourceTitle: 'Beta Source',
      },
      initialEvents: [
        { kind: 'visit', at: now - 16 * 24 * 60 * 60 * 1000, durationMs: 90_000 },
        {
          kind: 'thought-anchor',
          anchorType: 'paragraph',
          anchorId: 'anchor-beta',
          anchorBlockId: 'anchor-beta',
          anchorBlockText: 'Beta block',
          summary: 'Beta stands alone.',
          content: 'Beta note.',
          quote: 'Beta quote',
          thoughtType: 'explanation',
          attribution: 'mixed',
          at: now - 15 * 24 * 60 * 60 * 1000,
        },
        { kind: 'crystallize', summary: 'Beta settled', at: now - 18 * 24 * 60 * 60 * 1000 },
      ],
    });

    await panelStore.putMany([alphaPanel, betaPanel]);
    await weaveStore.putMany([alphaBetaWeave]);

    window.localStorage.removeItem('loom:learning-target-state:v1');
    window.localStorage.removeItem('loom:last-work-session:v1');
    window.sessionStorage.setItem('loom:work-session:v1', JSON.stringify({
      startedAt: now - 500,
      targetIds: ['panel:doc:alpha', 'weave:wv_references_doc_alpha__doc_beta'],
      outcomes: [],
      plannedResolutions: {
        'panel:doc:alpha': 'reworked',
        'weave:wv_references_doc_alpha__doc_beta': 'questioned',
      },
    }));

    emitPanelChange({ docIds: ['doc:alpha', 'doc:beta'], reason: 'dev-fixture-seed' });
    emitWeaveChange({
      docIds: ['doc:alpha', 'doc:beta'],
      weaveIds: [alphaBetaWeave.id],
      reason: 'dev-fixture-seed',
    });
    emitWorkSessionChange({ reason: 'start' });
    emitLearningTargetStateChange({ reason: 'clear' });
    setSelectedId(null);
    toast('Seeded work fixture');
  };

  const appendTest = async () => {
    if (!selected) { toast('Select a trace first', { kind: 'warn' }); return; }
    await append(selected.id, {
      kind: 'message',
      role: 'user',
      content: `Test message at ${new Date().toLocaleTimeString()}`,
      at: Date.now(),
    });
    toast('Appended event');
  };

  const crystallize = async () => {
    if (!selected) { toast('Select a trace first', { kind: 'warn' }); return; }
    const summary = prompt('Crystallize summary:');
    if (!summary) return;
    await append(selected.id, { kind: 'crystallize', summary, at: Date.now() });
    toast('Crystallized');
  };

  const removeTrace = async () => {
    if (!selected) return;
    if (!confirm(`Delete trace ${selected.id} and all descendants?`)) return;
    await del(selected.id);
    setSelectedId(null);
  };

  const wipeAll = async () => {
    if (!confirm('Wipe ALL traces from IndexedDB? This cannot be undone.')) return;
    await traceStore.clear();
    resetMigrationFlag();
    window.location.reload();
  };

  const rerunMigration = () => {
    resetMigrationFlag();
    window.location.reload();
  };

  return (
    <>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '2rem 2rem 6rem' }}>
        <section style={{ marginBottom: '1.5rem' }}>
          <div className="t-caption2" style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 700,
            marginBottom: 6,
          }}>
            Dev
          </div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 650, letterSpacing: '-0.03em' }}>
            Trace inspector
          </h1>
          <div className="t-footnote" style={{ marginTop: 8, color: 'var(--muted)' }}>
            {stats.total} traces · {stats.totalEvents} events · {panels.length} panels · {weaves.length} weaves · {embeddingCount} embeddings · migration {isMigrated() ? 'ready' : 'pending'} · pipeline {pipelineState}
          </div>
        </section>

        {/* Indexer progress bar */}
        {indexProgress && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.7rem 0',
            borderTop: '0.5px solid var(--accent)',
            borderBottom: '0.5px solid var(--accent)',
          }}>
            <div className="t-caption2" style={{
              color: 'var(--accent)', textTransform: 'uppercase',
              letterSpacing: '0.10em', fontWeight: 700, marginBottom: 5,
            }}>
              Embedding · {indexProgress.done} / {indexProgress.total}
            </div>
            <div style={{
              height: 4, borderRadius: 999,
              background: 'var(--mat-border)', overflow: 'hidden',
            }}>
              <div style={{
                width: `${(indexProgress.done / Math.max(1, indexProgress.total)) * 100}%`,
                height: '100%', background: 'var(--accent)',
                transition: 'width 0.2s var(--ease)',
              }} />
            </div>
          </div>
        )}

        {/* Action bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '1.4rem' }}>
          <ActionButton onClick={createTest}>Create test trace</ActionButton>
          <ActionButton onClick={seedWorkFixture}>Seed work fixture</ActionButton>
          <ActionButton onClick={appendTest} disabled={!selected}>Append event</ActionButton>
          <ActionButton onClick={crystallize} disabled={!selected}>Crystallize</ActionButton>
          <ActionButton onClick={removeTrace} disabled={!selected} danger>Delete</ActionButton>
          <div style={{ flex: 1 }} />
          <ActionButton onClick={runIndexer}>Build embedding index</ActionButton>
          <ActionButton onClick={wipeEmbeddings} danger>Wipe embeddings</ActionButton>
          <ActionButton onClick={rerunMigration}>Run migration again</ActionButton>
          <ActionButton onClick={wipeAll} danger>Wipe all</ActionButton>
        </div>

        {/* Two-column: list + detail */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: '1rem',
          minHeight: 480,
        }}>
        {/* Trace list */}
        <div style={{
          borderTop: '0.5px solid var(--mat-border)',
          borderBottom: '0.5px solid var(--mat-border)',
          overflow: 'hidden',
          maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
        }}>
          <div className="t-caption2" style={{
            padding: '0.8rem 1rem',
            borderBottom: '0.5px solid var(--mat-border)',
            color: 'var(--muted)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.10em',
          }}>{traces.length} traces · sorted by recency</div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && <div className="t-footnote" style={{ padding: '1rem', color: 'var(--muted)' }}>Loading…</div>}
            {!loading && traces.length === 0 && (
              <div className="t-footnote" style={{ padding: '1rem', color: 'var(--muted)' }}>
                No traces yet. Click &ldquo;Create test trace&rdquo; or trigger migration.
              </div>
            )}
            {traces.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '0.7rem 1rem',
                  background: t.id === selectedId ? 'var(--accent-soft)' : 'transparent',
                  border: 0,
                  borderLeft: '3px solid ' + (t.id === selectedId ? 'var(--accent)' : 'transparent'),
                  borderBottom: '0.5px solid var(--mat-border)',
                  cursor: 'pointer',
                  color: 'var(--fg)',
                }}
              >
                <div className="t-subhead" style={{
                  fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{t.title}</div>
                <div className="t-caption" style={{
                  color: 'var(--muted)', marginTop: 3,
                  display: 'flex', gap: 8, flexWrap: 'wrap',
                }}>
                  <span>{t.kind}</span>
                  <span>·</span>
                  <span>{t.events.length} events</span>
                  <span>·</span>
                  <span>m {(t.mastery * 100).toFixed(0)}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div style={{
          borderTop: '0.5px solid var(--mat-border)',
          borderBottom: '0.5px solid var(--mat-border)',
          padding: '1.2rem 1.4rem',
          maxHeight: '70vh',
          overflowY: 'auto',
        }}>
          {!selected && (
            <div className="t-footnote" style={{ color: 'var(--muted)' }}>
              Select a trace from the list to inspect its full event log.
            </div>
          )}
          {selected && <TraceDetail trace={selected} />}
        </div>
        </div>
      </div>
      <ToastHost />
    </>
  );
}

function TraceDetail({ trace }: { trace: Trace }) {
  const thoughtAnchors = trace.events.filter((e) => e.kind === 'thought-anchor');
  return (
    <div>
      <div className="t-caption2" style={{
        textTransform: 'uppercase', letterSpacing: '0.10em',
        color: 'var(--muted)', fontWeight: 700,
      }}>{trace.kind} · {trace.id}</div>
      <h2 className="t-title2" style={{ margin: '4px 0 12px', color: 'var(--fg)', padding: 0, border: 0 }}>
        {trace.title}
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <Stat label="Visits" value={trace.visitCount} />
        <Stat label="Events" value={trace.events.length} />
        <Stat label="Mastery" value={`${(trace.mastery * 100).toFixed(0)}%`} />
        <Stat label="Duration" value={`${Math.round(trace.totalDurationMs / 1000)}s`} />
        <Stat label="Children" value={trace.childIds.length} />
      </div>

      {trace.source && (
        <div style={{
          padding: '0.7rem 0', marginBottom: 16,
          borderTop: '0.5px solid var(--mat-border)',
          borderBottom: '0.5px solid var(--mat-border)',
        }}>
          <div className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>Source</div>
          <div className="t-footnote" style={{ color: 'var(--fg)' }}>
            <code style={{ fontFamily: 'var(--mono)' }}>{trace.source.docId}</code>
            <a href={trace.source.href} style={{ marginLeft: 8, color: 'var(--accent)' }}>{trace.source.href} ↗</a>
          </div>
        </div>
      )}

      {trace.crystallizedSummary && (
        <div style={{
          padding: '0.7rem 0', marginBottom: 16,
          borderTop: '0.5px solid var(--accent)',
          borderBottom: '0.5px solid var(--accent)',
        }}>
          <div className="t-caption2" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>Crystallized</div>
          <div className="t-footnote" style={{ color: 'var(--fg)' }}>{trace.crystallizedSummary}</div>
        </div>
      )}

      {thoughtAnchors.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="t-caption2" style={{
            textTransform: 'uppercase', letterSpacing: '0.10em',
            color: 'var(--muted)', fontWeight: 700, marginBottom: 8,
          }}>
            Thought Anchors
          </div>
          <div style={{
            borderRadius: 'var(--r-1)',
            overflow: 'hidden',
            border: '0.5px solid var(--mat-border)',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-2)', textAlign: 'left' }}>
                  <th style={thStyle}>At</th>
                  <th style={thStyle}>Anchor</th>
                  <th style={thStyle}>Block</th>
                  <th style={thStyle}>Block Text</th>
                  <th style={thStyle}>Offset</th>
                  <th style={thStyle}>Chars</th>
                  <th style={thStyle}>Range</th>
                  <th style={thStyle}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {thoughtAnchors.map((e, idx) => (
                  <tr key={idx} style={{ borderTop: '0.5px solid var(--mat-border)' }}>
                    <td style={tdStyle}>{new Date(e.at).toLocaleTimeString()}</td>
                    <td style={tdStyle}><code>{e.anchorId}</code></td>
                    <td style={tdStyle}><code>{e.anchorBlockId ?? '—'}</code></td>
                    <td style={tdStyle}>
                      <code>{(e as any).anchorBlockText ? String((e as any).anchorBlockText).slice(0, 42) : '—'}</code>
                    </td>
                    <td style={tdStyle}>{e.anchorOffsetPx ?? '—'}</td>
                    <td style={tdStyle}>
                      {e.anchorCharStart != null || e.anchorCharEnd != null
                        ? `${e.anchorCharStart ?? 0}–${e.anchorCharEnd ?? 0}`
                        : '—'}
                    </td>
                    <td style={tdStyle}>
                      <code>{e.rangeStartId ?? e.anchorId}</code>
                      <span style={{ color: 'var(--muted)', margin: '0 4px' }}>→</span>
                      <code>{e.rangeEndId ?? e.anchorId}</code>
                    </td>
                    <td style={tdStyle}>{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="t-caption2" style={{
        textTransform: 'uppercase', letterSpacing: '0.10em',
        color: 'var(--muted)', fontWeight: 700, marginBottom: 8,
      }}>Event Log ({trace.events.length})</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {trace.events.map((e, i) => (
          <div key={i} style={{
            padding: '0.55rem 0',
            borderBottom: '0.5px solid var(--mat-border)',
            fontFamily: 'var(--mono)',
            fontSize: '0.78rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', marginBottom: 3 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{e.kind}</span>
              <span>{new Date(e.at).toLocaleString()}</span>
            </div>
            <div style={{ color: 'var(--fg)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(e, null, 0).slice(0, 280)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{
      padding: '0.45rem 0',
      borderBottom: '0.5px solid var(--mat-border)',
    }}>
      <div className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{label}</div>
      <div className="t-headline" style={{ color: 'var(--fg)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem',
  color: 'var(--muted)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.55rem 0.7rem',
  color: 'var(--fg)',
  verticalAlign: 'top',
};

function ActionButton({
  children, onClick, disabled, danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 14px',
        borderRadius: 999,
        background: 'transparent',
        border: '0.5px solid ' + (danger ? 'var(--tint-red)' : 'var(--mat-border)'),
        color: danger ? 'var(--tint-red)' : 'var(--fg)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.78rem',
        fontWeight: 600,
        fontFamily: 'var(--display)',
        opacity: disabled ? 0.4 : 1,
      }}
    >{children}</button>
  );
}
