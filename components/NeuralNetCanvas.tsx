'use client';
/**
 * Live neural network forward-pass visualization. Ported from Downloads/webapp.
 * - Configurable layer count
 * - Animates "pulse" travelling left to right
 * - Connection colors encode weight sign + magnitude
 * - Neuron brightness encodes activation
 */
import { useEffect, useRef, useState } from 'react';

export function NeuralNetCanvas({ initialLayers = 4 }: { initialLayers?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [layers, setLayers] = useState(initialLayers);
  const [running, setRunning] = useState(true);
  const phaseRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height;

    const draw = () => {
      const sizes: number[] = [4];
      for (let i = 0; i < layers - 2; i++) sizes.push(5 + i);
      sizes.push(3);

      const maxN = Math.max(...sizes);
      const layerW = W / (sizes.length + 1);

      ctx.fillStyle = '#1A1815';
      ctx.fillRect(0, 0, W, H);

      const positions: { x: number; y: number }[][] = [];
      sizes.forEach((n, l) => {
        const x = layerW * (l + 1);
        const lp: { x: number; y: number }[] = [];
        for (let i = 0; i < n; i++) {
          const y = H / 2 + (i - (n - 1) / 2) * (H / (maxN + 1));
          lp.push({ x, y });
        }
        positions.push(lp);
      });

      const phase = phaseRef.current;

      // connections
      for (let l = 0; l < positions.length - 1; l++) {
        for (let i = 0; i < positions[l].length; i++) {
          for (let j = 0; j < positions[l + 1].length; j++) {
            const w = Math.sin(phase * 0.05 + l * 1.3 + i * 0.7 + j * 0.5);
            const alpha = 0.15 + Math.abs(w) * 0.3;
            ctx.beginPath();
            ctx.moveTo(positions[l][i].x, positions[l][i].y);
            ctx.lineTo(positions[l + 1][j].x, positions[l + 1][j].y);
            ctx.strokeStyle = w > 0 ? `rgba(94,61,92,${alpha})` : `rgba(143,70,70,${alpha})`;
            ctx.lineWidth = Math.abs(w) * 1.5 + 0.3;
            ctx.stroke();
          }
        }
      }

      // neurons
      positions.forEach((layer, l) => {
        layer.forEach((p, i) => {
          const a = Math.tanh(Math.sin(phase * 0.03 + l * 1.5 + i * 0.8));
          const brightness = (a + 1) / 2;
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
          grd.addColorStop(0, `rgba(94,61,92,${brightness * 0.6})`);
          grd.addColorStop(1, 'rgba(94,61,92,0)');
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16, 0, Math.PI * 2);
          ctx.fillStyle = grd;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
          const r = Math.floor(60 + brightness * 94);
          const g = Math.floor(40 + brightness * 61);
          const b = Math.floor(60 + brightness * 92);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.strokeStyle = '#5E3D5C';
          ctx.lineWidth = 1.5;
          ctx.fill();
          ctx.stroke();
        });
      });

      // labels
      const labels = ['Input', ...Array(sizes.length - 2).fill('').map((_, i) => `L${i + 1}`), 'Output'];
      ctx.fillStyle = '#8A8373';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      positions.forEach((layer, l) => ctx.fillText(labels[l], layer[0].x, H - 8));

      // pulse
      const numTransitions = positions.length - 1;
      const t = (phase * 0.015) % numTransitions;
      const pulseL = Math.floor(t);
      const pulseFrac = t - pulseL;
      const fromLayer = positions[pulseL];
      const toLayer = positions[pulseL + 1];
      const fIdx = Math.floor(pulseFrac * fromLayer.length) % fromLayer.length;
      const tIdx = Math.floor(pulseFrac * toLayer.length) % toLayer.length;
      const fromN = fromLayer[fIdx];
      const toN = toLayer[tIdx];
      const px = fromN.x + (toN.x - fromN.x) * pulseFrac;
      const py = fromN.y + (toN.y - fromN.y) * pulseFrac;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#FAF7EC';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#5E3D5C';
      ctx.fill();
      ctx.shadowBlur = 0;
    };

    const step = () => {
      phaseRef.current++;
      draw();
      if (running) rafRef.current = requestAnimationFrame(step);
    };
    draw();
    if (running) rafRef.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(rafRef.current);
  }, [layers, running]);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', margin: '1.2rem 0', background: '#1A1815' }}>
      <div style={{ padding: '0.5rem 0.9rem', background: 'rgba(36,32,24,0.85)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: '0.88rem', color: '#D9CFA8', fontWeight: 400 }}>Live Neural Network</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: '0.7rem', color: '#8A8373' }}>
            layers
            <select
              value={layers}
              onChange={(e) => setLayers(parseInt(e.target.value))}
              style={{ marginLeft: 4, background: '#242018', color: '#FAF7EC', border: '1px solid #3A3428', borderRadius: 3, fontSize: '0.7rem', padding: '1px 4px' }}
            >
              {[3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button
            onClick={() => setRunning((r) => !r)}
            style={{
              fontSize: '0.7rem', background: '#9E7C3E', color: '#FAF7EC',
              border: 0, padding: '3px 10px', borderRadius: 3, cursor: 'pointer',
            }}
          >{running ? 'Pause' : 'Play'}</button>
        </div>
      </div>
      <canvas ref={ref} width={800} height={300} style={{ width: '100%', display: 'block' }} />
    </div>
  );
}
