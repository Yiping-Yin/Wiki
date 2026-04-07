'use client';
import { useEffect, useRef, useState } from 'react';

// Visualizes SGD on f(x,y) = (x^2 + y^2)/4 + sin(x)*cos(y)
function f(x: number, y: number) { return (x * x + y * y) / 4 + Math.sin(x) * Math.cos(y); }
function grad(x: number, y: number): [number, number] {
  return [x / 2 + Math.cos(x) * Math.cos(y), y / 2 - Math.sin(x) * Math.sin(y)];
}

export function GradientDescent() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [lr, setLR] = useState(0.15);
  const [pt, setPt] = useState<[number, number]>([3, 2.5]);
  const [path, setPath] = useState<[number, number][]>([[3, 2.5]]);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const ctx = c.getContext('2d')!; const W = c.width, H = c.height;
    const R = 5;
    const img = ctx.createImageData(W, H);
    let mn = Infinity, mx = -Infinity; const vals = new Float32Array(W * H);
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const x = (px / W) * 2 * R - R, y = (py / H) * 2 * R - R;
      const v = f(x, y); vals[py * W + px] = v; if (v < mn) mn = v; if (v > mx) mx = v;
    }
    for (let i = 0; i < vals.length; i++) {
      const t = (vals[i] - mn) / (mx - mn);
      img.data[i * 4 + 0] = 30 + t * 60;
      img.data[i * 4 + 1] = 60 + t * 80;
      img.data[i * 4 + 2] = 130 + t * 100;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2; ctx.beginPath();
    path.forEach(([x, y], i) => {
      const px = ((x + R) / (2 * R)) * W, py = ((y + R) / (2 * R)) * H;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    const [cx, cy] = pt;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(((cx + R) / (2 * R)) * W, ((cy + R) / (2 * R)) * H, 5, 0, Math.PI * 2);
    ctx.fill();
  }, [pt, path]);

  const step = () => {
    const [x, y] = pt; const [gx, gy] = grad(x, y);
    const next: [number, number] = [x - lr * gx, y - lr * gy];
    setPt(next); setPath((p) => [...p, next].slice(-200));
  };
  const reset = () => { setPt([3, 2.5]); setPath([[3, 2.5]]); };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', margin: '1.2rem 0', background: 'var(--code-bg)' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.6rem' }}>⛰ SGD on a 2D loss surface</div>
      <canvas ref={canvas} width={360} height={240} style={{ width: '100%', maxWidth: 360, borderRadius: 6, display: 'block' }} />
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.6rem', fontSize: '0.8rem' }}>
        <button onClick={step} style={{ padding: '0.3rem 0.7rem', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', color: 'var(--fg)', cursor: 'pointer' }}>Step</button>
        <button onClick={reset} style={{ padding: '0.3rem 0.7rem', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--bg)', color: 'var(--fg)', cursor: 'pointer' }}>Reset</button>
        <label style={{ marginLeft: 'auto', color: 'var(--muted)' }}>lr {lr.toFixed(2)}
          <input type="range" min={0.01} max={0.6} step={0.01} value={lr} onChange={(e) => setLR(+e.target.value)} />
        </label>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.4rem' }}>
        f(x,y) = (x²+y²)/4 + sin(x)·cos(y) — a non-convex landscape with multiple basins.
      </div>
    </div>
  );
}
