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
      style: {
        padding: 10,
        border: '0.5px solid var(--mat-border)',
        borderRadius: 0,
        background: 'color-mix(in srgb, var(--bg) 96%, white)',
        color: 'var(--fg)',
        fontSize: 12,
        width: 200,
        boxShadow: 'none',
      },
    };
  });
  const flowEdges = edges.map(([s, t]) => ({
    id: `${s}-${t}`,
    source: s,
    target: t,
    animated: false,
    style: { stroke: '#b6bcc8', strokeWidth: 1 },
  }));

  return (
    <div style={{ width: '100%', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ padding: '1rem 1.5rem 0.9rem', borderBottom: '0.5px solid var(--mat-border)' }}>
        <div
          className="t-caption2"
          style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}
        >
          Map
        </div>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 650, letterSpacing: '-0.02em' }}>Knowledge graph</h1>
        <div style={{ fontSize: '0.84rem', color: 'var(--muted)', marginTop: 4 }}>Choose any thread to open its page.</div>
      </div>
      <div style={{ height: 'calc(100vh - 80px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={flowEdges}
          proOptions={{ hideAttribution: true }}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          onNodeClick={(_, n) => (window.location.href = `/wiki/${n.id}`)}
        />
      </div>
    </div>
  );
}
