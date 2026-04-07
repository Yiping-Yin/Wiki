export type Chapter = { slug: string; title: string; section: string };

export const chapters: Chapter[] = [
  { slug: 'llm101n',          title: 'LLM101n Overview',         section: 'Start' },
  { slug: 'micrograd',        title: '1 · Micrograd',            section: 'Foundations' },
  { slug: 'makemore-bigram',  title: '2 · Bigram LM',            section: 'Foundations' },
  { slug: 'mlp',              title: '3 · MLP (Bengio 2003)',    section: 'Foundations' },
  { slug: 'batchnorm',        title: '4 · BatchNorm & Init',     section: 'Foundations' },
  { slug: 'backprop-ninja',   title: '5 · Backprop Ninja',       section: 'Foundations' },
  { slug: 'wavenet',          title: '6 · WaveNet',              section: 'Foundations' },
  { slug: 'attention',        title: '7 · Attention',            section: 'Transformer' },
  { slug: 'transformer',      title: '8 · Reproduce GPT-2',      section: 'Transformer' },
  { slug: 'tokenization',     title: '9 · Tokenization (BPE)',   section: 'Transformer' },
  { slug: 'state-of-gpt',     title: '10 · State of GPT',        section: 'Transformer' },
  { slug: 'kv-cache',         title: '11 · KV-Cache',            section: 'Inference' },
  { slug: 'quantization',     title: '12 · Quantization',        section: 'Inference' },
  { slug: 'lora',             title: '13 · LoRA / SFT',          section: 'Finetuning' },
  { slug: 'rlhf',             title: '14 · RLHF / DPO',          section: 'Finetuning' },
  { slug: 'multimodal',       title: '15 · Multimodal',          section: 'Frontier' },
  { slug: 'nanochat',         title: '16 · nanochat',            section: 'Frontier' },
];

export function neighbors(slug: string) {
  const i = chapters.findIndex((c) => c.slug === slug);
  return { prev: i > 0 ? chapters[i - 1] : null, next: i >= 0 && i < chapters.length - 1 ? chapters[i + 1] : null };
}
