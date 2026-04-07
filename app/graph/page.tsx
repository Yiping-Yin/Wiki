'use client';
import dynamic from 'next/dynamic';
import { chapters } from '../../lib/nav';
import 'reactflow/dist/style.css';

const ReactFlow = dynamic(() => import('reactflow').then((m) => m.default), { ssr: false });

const edges = [
  ['micrograd', 'makemore-bigram'],
  ['makemore-bigram', 'mlp'],
  ['mlp', 'batchnorm'],
  ['batchnorm', 'backprop-ninja'],
  ['backprop-ninja', 'wavenet'],
  ['wavenet', 'attention'],
  ['attention', 'transformer'],
  ['transformer', 'tokenization'],
  ['transformer', 'state-of-gpt'],
  ['transformer', 'kv-cache'],
  ['kv-cache', 'quantization'],
  ['transformer', 'lora'],
  ['lora', 'rlhf'],
  ['state-of-gpt', 'rlhf'],
  ['transformer', 'multimodal'],
  ['transformer', 'nanochat'],
  ['lora', 'nanochat'],
  ['rlhf', 'nanochat'],
];

const SECTION_X: Record<string, number> = {
  Start: 0, Foundations: 250, Transformer: 600, Inference: 950, Finetuning: 950, Frontier: 1300,
};

export default function GraphPage() {
  const counters: Record<string, number> = {};
  const nodes = chapters.map((c) => {
    const y = (counters[c.section] = (counters[c.section] ?? -1) + 1) * 110 + 40;
    return {
      id: c.slug,
      data: { label: c.title },
      position: { x: SECTION_X[c.section] ?? 0, y: y + (c.section === 'Finetuning' ? 350 : 0) },
      style: { padding: 10, border: '1px solid #2563eb', borderRadius: 8, background: '#fff', fontSize: 12, width: 200 },
    };
  });
  const flowEdges = edges.map(([s, t]) => ({ id: `${s}-${t}`, source: s, target: t, animated: true, style: { stroke: '#94a3b8' } }));

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800 }}>🕸 Knowledge Graph</h1>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Click any node to open the chapter.</div>
      </div>
      <div style={{ height: 'calc(100vh - 80px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          fitView
          onNodeClick={(_, n) => (window.location.href = `/wiki/${n.id}`)}
        />
      </div>
    </div>
  );
}
