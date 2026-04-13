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
import { toast, ToastHost } from '../../../components/Toast';
import { PageHero } from '../../../components/PageHero';
import { useEffect } from 'react';

export default function TraceInspectorPage() {
  const { traces, loading } = useAllTraces();
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
        <PageHero
          eyebrow="Dev · Phases 1-5"
          title="Trace Inspector"
          stats={[
            { value: stats.total, label: 'traces' },
            { value: stats.totalEvents, label: 'events' },
            { value: embeddingCount, label: 'embeddings' },
            ...Object.entries(stats.byKind).map(([k, n]) => ({ value: n, label: k })),
          ]}
          description={`Migration: ${isMigrated() ? '✓' : '○'} · Embedding pipeline: ${pipelineState}. This page is for verifying internal state; it isn't linked from the main nav.`}
        />

        {/* Indexer progress bar */}
        {indexProgress && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.7rem 1rem',
            borderRadius: 'var(--r-2)',
            background: 'var(--accent-soft)',
            border: '0.5px solid var(--accent)',
          }}>
            <div className="t-caption2" style={{
              color: 'var(--accent)', textTransform: 'uppercase',
              letterSpacing: '0.10em', fontWeight: 700, marginBottom: 5,
            }}>
              ✦ Embedding · {indexProgress.done} / {indexProgress.total}
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
          <ActionButton onClick={createTest}>+ Create test trace</ActionButton>
          <ActionButton onClick={appendTest} disabled={!selected}>+ Append event</ActionButton>
          <ActionButton onClick={crystallize} disabled={!selected}>✦ Crystallize</ActionButton>
          <ActionButton onClick={removeTrace} disabled={!selected} danger>✕ Delete</ActionButton>
          <div style={{ flex: 1 }} />
          <ActionButton onClick={runIndexer}>✦ Build embedding index</ActionButton>
          <ActionButton onClick={wipeEmbeddings} danger>⚠ Wipe embeddings</ActionButton>
          <ActionButton onClick={rerunMigration}>↻ Re-run migration</ActionButton>
          <ActionButton onClick={wipeAll} danger>⚠ Wipe all</ActionButton>
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
          borderRadius: 'var(--r-3)',
          border: '0.5px solid var(--mat-border)',
          background: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-1)',
          overflow: 'hidden',
          maxHeight: '70vh',
          display: 'flex', flexDirection: 'column',
        }}>
          <div className="t-caption2" style={{
            padding: '0.8rem 1rem',
            borderBottom: '0.5px solid var(--mat-border)',
            color: 'var(--muted)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.10em',
            background: 'var(--surface-2)',
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
          borderRadius: 'var(--r-3)',
          border: '0.5px solid var(--mat-border)',
          background: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-1)',
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
          padding: '0.7rem 0.9rem', borderRadius: 'var(--r-1)',
          background: 'var(--surface-2)', marginBottom: 16,
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
          padding: '0.7rem 0.9rem', borderRadius: 'var(--r-1)',
          background: 'var(--accent-soft)', marginBottom: 16,
          borderLeft: '3px solid var(--accent)',
        }}>
          <div className="t-caption2" style={{ color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>✦ Crystallized</div>
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
            padding: '0.55rem 0.8rem',
            borderRadius: 'var(--r-1)',
            background: 'var(--surface-2)',
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
      padding: '0.55rem 0.7rem', borderRadius: 'var(--r-1)',
      background: 'var(--surface-2)',
      border: '0.5px solid var(--mat-border)',
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
        background: danger ? 'var(--surface-2)' : 'var(--bg-elevated)',
        border: '0.5px solid ' + (danger ? 'var(--tint-red)' : 'var(--mat-border)'),
        color: danger ? 'var(--tint-red)' : 'var(--fg)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '0.78rem',
        fontWeight: 600,
        fontFamily: 'var(--display)',
        opacity: disabled ? 0.4 : 1,
        boxShadow: 'var(--shadow-1)',
      }}
    >{children}</button>
  );
}
