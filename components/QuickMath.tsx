'use client';
/**
 * Persistent floating "Quick Math" reference card. Inspired by webapp's
 * always-visible KaTeX cheat sheet in the right sidebar. Renders a tiny
 * curated formula reference that the user can flip through while reading.
 */
import { useState, useEffect } from 'react';
import 'katex/dist/katex.min.css';

const FORMULAS: { name: string; tex: string }[] = [
  { name: 'Softmax', tex: '\\sigma(z)_i = \\dfrac{e^{z_i}}{\\sum_j e^{z_j}}' },
  { name: 'Attention', tex: '\\text{softmax}\\!\\left(\\dfrac{QK^\\top}{\\sqrt{d_k}}\\right)V' },
  { name: 'Cross-entropy', tex: '\\mathcal{L}=-\\sum_i y_i\\log p_i' },
  { name: 'Bayes', tex: 'P(A\\mid B)=\\dfrac{P(B\\mid A)P(A)}{P(B)}' },
  { name: 'SGD', tex: '\\theta\\leftarrow\\theta-\\eta\\nabla_\\theta L' },
  { name: 'Chain rule', tex: '\\dfrac{dy}{dx}=\\dfrac{dy}{du}\\dfrac{du}{dx}' },
  { name: 'LayerNorm', tex: '\\hat{x}=\\dfrac{x-\\mu}{\\sqrt{\\sigma^2+\\epsilon}}' },
  { name: 'KL', tex: 'D_{KL}(P\\|Q)=\\sum_i P_i\\log\\dfrac{P_i}{Q_i}' },
];

export function QuickMath() {
  const [i, setI] = useState(0);
  const [html, setHtml] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const katex = (await import('katex')).default;
      const out = katex.renderToString(FORMULAS[i].tex, { throwOnError: false, displayMode: false });
      if (!cancelled) setHtml(out);
    })();
    return () => { cancelled = true; };
  }, [i]);

  return (
    <div style={{
      marginTop: '1rem', padding: '0.7rem 0.85rem',
      border: '1px solid var(--accent)', borderRadius: 8,
      background: 'var(--accent-soft)',
      cursor: 'pointer',
    }}
      onClick={() => setI((x) => (x + 1) % FORMULAS.length)}
      title="Click to cycle through formulas"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          √x Quick Math
        </span>
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>{i + 1}/{FORMULAS.length}</span>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 4 }}>{FORMULAS[i].name}:</div>
      <div style={{ fontSize: '0.82rem', overflowX: 'auto' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
