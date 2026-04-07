'use client';
import { useMemo, useState } from 'react';

// Toy "attention" — uses character bigram-style affinity (cosine of random fixed embeddings)
// Deterministic so it renders the same on each load.
function hash(s: string) { let h = 2166136261; for (const c of s) h = (h ^ c.charCodeAt(0)) * 16777619; return h >>> 0; }
function embed(tok: string, dim = 16) {
  const v = new Array(dim).fill(0);
  let seed = hash(tok);
  for (let i = 0; i < dim; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; v[i] = ((seed / 2 ** 32) - 0.5); }
  const n = Math.hypot(...v); return v.map((x) => x / (n || 1));
}

export function AttentionHeatmap({ initial = 'the quick brown fox jumps' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  const [causal, setCausal] = useState(true);
  const tokens = text.trim().split(/\s+/).filter(Boolean).slice(0, 12);

  const matrix = useMemo(() => {
    const E = tokens.map((t) => embed(t));
    const T = tokens.length;
    const raw: number[][] = Array.from({ length: T }, () => new Array(T).fill(0));
    for (let i = 0; i < T; i++) {
      for (let j = 0; j < T; j++) {
        if (causal && j > i) { raw[i][j] = -Infinity; continue; }
        let s = 0; for (let k = 0; k < E[i].length; k++) s += E[i][k] * E[j][k];
        raw[i][j] = s * 4;
      }
    }
    return raw.map((row) => {
      const m = Math.max(...row.filter((x) => isFinite(x)));
      const exps = row.map((x) => (isFinite(x) ? Math.exp(x - m) : 0));
      const sum = exps.reduce((a, b) => a + b, 0);
      return exps.map((e) => e / (sum || 1));
    });
  }, [tokens.join('|'), causal]);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', margin: '1.2rem 0', background: 'var(--code-bg)' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.6rem' }}>🔥 Attention Heatmap</div>
      <input value={text} onChange={(e) => setText(e.target.value)}
        style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.85rem' }} />
      <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--muted)', margin: '0.5rem 0' }}>
        <input type="checkbox" checked={causal} onChange={(e) => setCausal(e.target.checked)} /> causal mask
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: `auto repeat(${tokens.length}, 1fr)`, gap: 2, fontSize: '0.7rem', fontFamily: 'ui-monospace, monospace' }}>
        <div></div>
        {tokens.map((t, j) => <div key={`c${j}`} style={{ textAlign: 'center', color: 'var(--muted)' }}>{t}</div>)}
        {matrix.map((row, i) => (
          <>
            <div key={`r${i}`} style={{ color: 'var(--muted)', paddingRight: 4, textAlign: 'right' }}>{tokens[i]}</div>
            {row.map((p, j) => (
              <div key={`${i}-${j}`} title={p.toFixed(2)}
                style={{ aspectRatio: '1/1', background: `rgba(37,99,235,${p})`, borderRadius: 2, color: p > 0.4 ? '#fff' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem' }}>
                {p > 0.1 ? p.toFixed(2) : ''}
              </div>
            ))}
          </>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
        Each row is a query token; each cell is softmax(QKᵀ/√d) over the row.
      </div>
    </div>
  );
}
