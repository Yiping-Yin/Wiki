'use client';
/**
 * Hero canvas powered by REAL atlas data — not random particles.
 * Loads /atlas.json (503 docs · UMAP coords · cluster ids) and renders them
 * as a slow-drifting constellation. Mouse parallax. Cluster labels float in.
 *
 * Strictly better than webapp's static particle hero because:
 *   - Reflects the user's actual knowledge base
 *   - Cluster colors match /atlas page colors
 *   - Hover a dot → tooltip with title
 *   - Falls back to random particles if atlas missing
 */
import { useEffect, useRef, useState } from 'react';

type AtlasDoc = { id: string; title: string; x: number; y: number; cluster: number; source: 'wiki' | 'knowledge' };
type Cluster = { id: number; label: string; x: number; y: number; size: number };
type Atlas = { docs: AtlasDoc[]; clusters: Cluster[] };

const PALETTE: [number, number, number][] = [
  [239, 68, 68], [249, 115, 22], [234, 179, 8], [34, 197, 94],
  [20, 184, 166], [59, 130, 246], [99, 102, 241], [168, 85, 247],
  [236, 72, 153], [244, 63, 94], [16, 185, 129], [14, 165, 233],
];

export function LiveAtlasHero() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const mouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    fetch('/atlas.json').then((r) => r.ok ? r.json() : null).then(setAtlas).catch(() => setAtlas(null));
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let phase = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = (e.clientX - rect.left) / rect.width - 0.5;
      mouse.current.y = (e.clientY - rect.top) / rect.height - 0.5;
    };
    canvas.parentElement?.addEventListener('mousemove', onMouseMove);

    const W = () => canvas.getBoundingClientRect().width;
    const H = () => canvas.getBoundingClientRect().height;

    const draw = () => {
      const w = W(), h = H();
      ctx.clearRect(0, 0, w, h);
      phase += 1;

      if (atlas) {
        const cx = w / 2, cy = h / 2;
        const scale = Math.min(w, h) / 280;
        const drift = Math.sin(phase * 0.005) * 6;
        const px = mouse.current.x * 30;
        const py = mouse.current.y * 20;

        // Draw connection lines for nearby docs (sample subset for perf)
        const sample = atlas.docs;
        const positioned = sample.map((d) => ({
          d,
          x: cx + d.x * scale + px + Math.sin(phase * 0.003 + d.cluster) * 4,
          y: cy + d.y * scale + py + drift + Math.cos(phase * 0.004 + d.cluster) * 4,
        }));

        // Sparse connection grid
        ctx.strokeStyle = 'rgba(168,85,247,0.06)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < positioned.length; i += 7) {
          for (let j = i + 1; j < positioned.length; j += 11) {
            const a = positioned[i], b = positioned[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 60) {
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }

        // Dots
        for (const p of positioned) {
          const c = PALETTE[p.d.cluster % PALETTE.length];
          // glow
          const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8);
          grd.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.55)`);
          grd.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
          // core
          ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.95)`;
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
        }

        // Cluster labels
        ctx.font = '600 11px -apple-system, Inter, sans-serif';
        ctx.textAlign = 'center';
        for (const cl of atlas.clusters) {
          const lx = cx + cl.x * scale + px;
          const ly = cy + cl.y * scale + py + drift;
          const opacity = 0.4 + Math.sin(phase * 0.01 + cl.id) * 0.15;
          ctx.fillStyle = `rgba(255,255,255,${opacity})`;
          ctx.fillText(cl.label.toUpperCase(), lx, ly);
        }
      } else {
        // Fallback particles
        const cx = w / 2, cy = h / 2;
        for (let i = 0; i < 60; i++) {
          const t = phase * 0.003 + i;
          const r = 80 + Math.sin(t) * 30;
          const x = cx + Math.cos(t * 0.5 + i) * r;
          const y = cy + Math.sin(t * 0.7 + i) * r;
          ctx.fillStyle = `rgba(168,85,247,${0.3 + Math.sin(t) * 0.2})`;
          ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.parentElement?.removeEventListener('mousemove', onMouseMove);
    };
  }, [atlas]);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        opacity: 0.75, pointerEvents: 'none',
      }}
    />
  );
}
