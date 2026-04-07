'use client';
import { useMemo, useState } from 'react';

export function LRScheduler() {
  const [warmup, setWarmup] = useState(50);
  const [total, setTotal] = useState(500);
  const [maxLR, setMaxLR] = useState(3);  // x 1e-4
  const [minLR, setMinLR] = useState(0.3);
  const W = 600, H = 180;

  const points = useMemo(() => {
    const pts: [number, number][] = [];
    for (let t = 0; t <= total; t += Math.max(1, Math.floor(total / 200))) {
      let lr;
      if (t < warmup) lr = (maxLR * (t + 1)) / warmup;
      else {
        const p = (t - warmup) / Math.max(1, total - warmup);
        lr = minLR + 0.5 * (maxLR - minLR) * (1 + Math.cos(Math.PI * p));
      }
      pts.push([t, lr]);
    }
    return pts;
  }, [warmup, total, maxLR, minLR]);

  const path = points.map(([t, lr], i) => {
    const x = (t / total) * W;
    const y = H - (lr / Math.max(maxLR, 0.01)) * (H - 20) - 10;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', margin: '1.2rem 0', background: 'var(--code-bg)' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.6rem' }}>📈 Cosine LR Schedule with Warmup</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 180, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
        <line x1={(warmup / total) * W} y1={0} x2={(warmup / total) * W} y2={H} stroke="var(--border)" strokeDasharray="3,3" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 1rem', fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.6rem' }}>
        <label>warmup: {warmup}<input type="range" min={0} max={300} value={warmup} onChange={(e) => setWarmup(+e.target.value)} style={{ width: '100%' }} /></label>
        <label>total: {total}<input type="range" min={100} max={2000} value={total} onChange={(e) => setTotal(+e.target.value)} style={{ width: '100%' }} /></label>
        <label>max lr: {maxLR.toFixed(2)}e-4<input type="range" min={0.5} max={10} step={0.1} value={maxLR} onChange={(e) => setMaxLR(+e.target.value)} style={{ width: '100%' }} /></label>
        <label>min lr: {minLR.toFixed(2)}e-4<input type="range" min={0} max={2} step={0.05} value={minLR} onChange={(e) => setMinLR(+e.target.value)} style={{ width: '100%' }} /></label>
      </div>
    </div>
  );
}
