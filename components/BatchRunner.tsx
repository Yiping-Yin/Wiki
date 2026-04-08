'use client';
import { useEffect, useState } from 'react';

type Doc = { id: string; title: string; href: string; hasText: boolean };
type Status = 'pending' | 'running' | 'cached' | 'done' | 'error' | 'skipped';

export function BatchRunner({
  docs,
  endpoint,
  cachePathTemplate,
  cacheIdTransform = 'none',
  title,
  description,
  icon = '✨',
  concurrency = 3,
}: {
  docs: Doc[];
  endpoint: string;
  cachePathTemplate: string;       // e.g. "/knowledge/summaries/{id}.json"
  cacheIdTransform?: 'none' | 'slash-to-underscore';
  title: string;
  description: string;
  icon?: string;
  concurrency?: number;
}) {
  const cachePathFor = (id: string) => {
    const transformed = cacheIdTransform === 'slash-to-underscore' ? id.replace(/\//g, '__') : id;
    return cachePathTemplate.replace('{id}', transformed);
  };
  const eligible = docs.filter((d) => d.hasText);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [running, setRunning] = useState(false);
  const [aborted, setAborted] = useState(false);

  // probe existing cache
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, Status> = {};
      for (const d of eligible) {
        try {
          const r = await fetch(cachePathFor(d.id), { cache: 'force-cache' });
          if (r.ok) out[d.id] = 'cached';
        } catch {}
        if (cancelled) return;
      }
      if (!cancelled) setStatuses((s) => ({ ...out, ...s }));
    })();
    return () => { cancelled = true; };
  }, [docs, endpoint]); // eslint-disable-line react-hooks/exhaustive-deps

  const cachedCount = eligible.filter((d) => statuses[d.id] === 'cached' || statuses[d.id] === 'done').length;
  const errorCount = eligible.filter((d) => statuses[d.id] === 'error').length;
  const runningCount = eligible.filter((d) => statuses[d.id] === 'running').length;
  const pct = eligible.length > 0 ? Math.round((cachedCount / eligible.length) * 100) : 0;

  const run = async () => {
    if (running) return;
    setRunning(true); setAborted(false);
    const queue = eligible.filter((d) => statuses[d.id] !== 'cached' && statuses[d.id] !== 'done');
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
          const r = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: d.id }),
          });
          const j = await r.json();
          if (r.ok) setOne(d.id, 'done');
          else setOne(d.id, j.error?.includes('no extractable') || j.error?.includes('too short') ? 'skipped' : 'error');
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
      margin: '0.6rem 0', padding: '0.9rem 1.1rem',
      border: '1px solid var(--border)', borderRadius: 10,
      background: 'linear-gradient(135deg, rgba(37,99,235,0.05), rgba(168,85,247,0.05))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{icon} {title}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
            {description} · {eligible.length} eligible docs
          </div>
        </div>
        <button
          onClick={running ? () => setAborted(true) : run}
          disabled={cachedCount === eligible.length && !running}
          style={{
            background: running ? '#dc2626' : 'var(--accent)',
            color: '#fff', border: 0, borderRadius: 6,
            padding: '0.45rem 0.9rem', cursor: cachedCount === eligible.length && !running ? 'default' : 'pointer',
            fontSize: '0.82rem', fontWeight: 600,
            opacity: cachedCount === eligible.length && !running ? 0.4 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {running ? 'Stop' : cachedCount === eligible.length ? '✓ Done' : 'Run'}
        </button>
      </div>

      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
      </div>
      <div style={{ display: 'flex', gap: '0.9rem', marginTop: 5, fontSize: '0.7rem', color: 'var(--muted)' }}>
        <span>✓ {cachedCount}</span>
        {runningCount > 0 && <span style={{ color: 'var(--accent)' }}>● {runningCount}</span>}
        {errorCount > 0 && <span style={{ color: '#dc2626' }}>✗ {errorCount}</span>}
        <span style={{ marginLeft: 'auto' }}>{pct}%</span>
      </div>
    </div>
  );
}
