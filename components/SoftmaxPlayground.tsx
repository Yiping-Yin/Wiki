'use client';
import { useState, useMemo } from 'react';

export function SoftmaxPlayground() {
  const [temp, setTemp] = useState(1.0);
  const logits = useMemo(() => [2.0, 1.0, 0.5, -0.5, -1.0], []);
  const labels = ['cat', 'dog', 'fox', 'owl', 'bat'];

  const probs = useMemo(() => {
    const scaled = logits.map(l => l / temp);
    const m = Math.max(...scaled);
    const exps = scaled.map(l => Math.exp(l - m));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
  }, [temp, logits]);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', margin: '1.2rem 0', background: 'var(--code-bg)' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.6rem' }}>🎛️ Softmax Temperature Playground</div>
      <label style={{ fontSize: '0.9rem', display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
        T = {temp.toFixed(2)}
        <input
          type="range"
          min={0.1}
          max={3}
          step={0.05}
          value={temp}
          onChange={e => setTemp(parseFloat(e.target.value))}
          style={{ flex: 1 }}
        />
      </label>
      <div style={{ marginTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {probs.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem', fontFamily: 'var(--mono)' }}>
            <span style={{ width: 32 }}>{labels[i]}</span>
            <div style={{ flex: 1, background: 'var(--border)', height: 14, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${p * 100}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
            <span style={{ width: 56, textAlign: 'right' }}>{(p * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: '0.6rem' }}>
        Low T → sharp/greedy. High T → flat/random. This is the same knob LLMs use during sampling.
      </div>
    </div>
  );
}
