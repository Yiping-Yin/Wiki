'use client';
import { useMemo, useState } from 'react';

// Tiny illustrative BPE: trains merges on the input text itself, then visualizes token segmentation.
// Not a real GPT tokenizer — purely educational.
function trainBPE(text: string, numMerges: number) {
  let ids: number[] = Array.from(new TextEncoder().encode(text));
  const merges: Record<string, number> = {};
  for (let m = 0; m < numMerges; m++) {
    const counts: Record<string, number> = {};
    for (let i = 0; i < ids.length - 1; i++) {
      const k = ids[i] + ',' + ids[i + 1];
      counts[k] = (counts[k] || 0) + 1;
    }
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!best || best[1] < 2) break;
    const [a, b] = best[0].split(',').map(Number);
    const newId = 256 + m;
    merges[best[0]] = newId;
    const out: number[] = [];
    for (let i = 0; i < ids.length; ) {
      if (i < ids.length - 1 && ids[i] === a && ids[i + 1] === b) { out.push(newId); i += 2; }
      else { out.push(ids[i]); i++; }
    }
    ids = out;
  }
  return { ids, merges };
}

const PALETTE = ['#fecaca', '#fed7aa', '#fde68a', '#bbf7d0', '#bae6fd', '#c7d2fe', '#e9d5ff', '#fbcfe8'];

export function BPETokenizer({ initial = 'the cat sat on the mat. the cat sat.' }: { initial?: string }) {
  const [text, setText] = useState(initial);
  const [merges, setMerges] = useState(20);
  const result = useMemo(() => trainBPE(text, merges), [text, merges]);
  const decoder = new TextDecoder();
  const tokens = result.ids.map((id) => {
    if (id < 256) return decoder.decode(new Uint8Array([id]));
    // expand merged id back to bytes by walking the merge table
    const stack: number[] = [id];
    const bytes: number[] = [];
    while (stack.length) {
      const x = stack.pop()!;
      if (x < 256) { bytes.push(x); continue; }
      const pair = Object.entries(result.merges).find(([, v]) => v === x);
      if (!pair) { bytes.push(63); continue; }
      const [a, b] = pair[0].split(',').map(Number);
      stack.push(b, a);
    }
    return decoder.decode(new Uint8Array(bytes.reverse()));
  });

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', margin: '1.2rem 0', background: 'var(--code-bg)' }}>
      <div style={{ fontWeight: 600, marginBottom: '0.6rem' }}>🧩 Mini BPE Tokenizer</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        style={{ width: '100%', padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.85rem', fontFamily: 'inherit' }} />
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', margin: '0.5rem 0', color: 'var(--muted)' }}>
        merges: {merges}
        <input type="range" min={0} max={50} value={merges} onChange={(e) => setMerges(parseInt(e.target.value))} style={{ flex: 1 }} />
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', marginTop: '0.5rem' }}>
        {tokens.map((t, i) => (
          <span key={i} style={{ background: PALETTE[result.ids[i] % PALETTE.length], color: '#111', padding: '2px 5px', borderRadius: 3, whiteSpace: 'pre' }}>
            {t.replace(/\n/g, '⏎')}
          </span>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
        {tokens.length} tokens · {result.ids.filter((id) => id >= 256).length} merged
      </div>
    </div>
  );
}
