'use client';
import { useEffect, useState } from 'react';

type Doc = { id: string; title: string; href: string; hasText: boolean };

type Status = 'pending' | 'running' | 'cached' | 'done' | 'error' | 'skipped';

export function BatchSummarize({ docs }: { docs: Doc[] }) {
  const eligible = docs.filter((d) => d.hasText);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);
  const [aborted, setAborted] = useState(false);

  // probe existing cached summaries on mount so we don't redo them
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, Status> = {};
      for (const d of eligible) {
        try {
          const r = await fetch(`/knowledge/summaries/${d.id}.json`, { cache: 'force-cache' });
          if (r.ok) out[d.id] = 'cached';
        } catch {}
        if (cancelled) return;
      }
      if (!cancelled) setStatuses((s) => ({ ...out, ...s }));
    })();
    return () => { cancelled = true; };
  }, [docs]);

  const cachedCount = eligible.filter((d) => statuses[d.id] === 'cached' || statuses[d.id] === 'done').length;
  const errorCount = eligible.filter((d) => statuses[d.id] === 'error').length;
  const runningCount = eligible.filter((d) => statuses[d.id] === 'running').length;
  const pct = eligible.length > 0 ? Math.round((cachedCount / eligible.length) * 100) : 0;

  const run = async () => {
    if (running) return;
    setRunning(true); setAborted(false);
    const queue = eligible.filter((d) => statuses[d.id] !== 'cached' && statuses[d.id] !== 'done');
    const concurrency = 3;
    let cursor = 0;
    let stopped = false;
    const setOne = (id: string, s: Status) => setStatuses((prev) => ({ ...prev, [id]: s }));

    const worker = async () => {
      while (!stopped) {
        const i = cursor++;
        if (i >= queue.length) return;
        const d = queue[i];
        if (aborted) { stopped = true; return; }
        setOne(d.id, 'running');
        try {
          const r = await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: d.id }),
          });
          const j = await r.json();
          if (r.ok) setOne(d.id, 'done');
          else setOne(d.id, j.error?.includes('no extractable text') ? 'skipped' : 'error');
        } catch {
          setOne(d.id, 'error');
        }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    setRunning(false);
  };

  return (
    <div style={{
      margin: '1rem 0 1.5rem', padding: '1rem 1.2rem',
      border: '1px solid var(--border)', borderRadius: 10,
      background: 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(168,85,247,0.06))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>✨ Auto-summarize this category</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
            Generates AI summaries for all {eligible.length} eligible documents in parallel. Cached, so re-runs are free.
          </div>
        </div>
        <button
          onClick={running ? () => setAborted(true) : run}
          disabled={cachedCount === eligible.length && !running}
          style={{
            background: running ? '#dc2626' : 'var(--accent)',
            color: '#fff', border: 0, borderRadius: 6,
            padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            opacity: cachedCount === eligible.length && !running ? 0.4 : 1,
          }}
        >
          {running ? 'Stop' : cachedCount === eligible.length ? '✓ All done' : `Summarize all`}
        </button>
      </div>

      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', gap: '1rem', marginTop: 6, fontSize: '0.72rem', color: 'var(--muted)' }}>
        <span>✓ {cachedCount} cached</span>
        {runningCount > 0 && <span style={{ color: 'var(--accent)' }}>● {runningCount} running</span>}
        {errorCount > 0 && <span style={{ color: '#dc2626' }}>✗ {errorCount} failed</span>}
        <span style={{ marginLeft: 'auto' }}>{pct}%</span>
      </div>
    </div>
  );
}
