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

  { slug: 'rope',             title: 'RoPE',                     section: 'Architecture' },
  { slug: 'alibi',            title: 'ALiBi',                    section: 'Architecture' },
  { slug: 'rmsnorm',          title: 'RMSNorm',                  section: 'Architecture' },
  { slug: 'swiglu',           title: 'SwiGLU & Gated Activations', section: 'Architecture' },
  { slug: 'moe',              title: 'Mixture of Experts',       section: 'Architecture' },
  { slug: 'mamba',            title: 'Mamba & SSMs',             section: 'Architecture' },
  { slug: 'gqa-mqa',          title: 'GQA & MQA',                section: 'Architecture' },

  { slug: 'scaling-laws',     title: 'Scaling Laws',             section: 'Training' },
  { slug: 'fsdp-zero',        title: 'FSDP & ZeRO',              section: 'Training' },
  { slug: 'tensor-pipeline-parallel', title: 'Tensor & Pipeline Parallel', section: 'Training' },
  { slug: 'mixed-precision',  title: 'Mixed Precision (bf16/fp8)', section: 'Training' },
  { slug: 'muP',              title: 'μP — Maximal Update',      section: 'Training' },

  { slug: 'data-curation',    title: 'Pretraining Data Curation', section: 'Data' },
  { slug: 'synthetic-data',   title: 'Synthetic Data & Distillation', section: 'Data' },

  { slug: 'kv-cache',         title: '11 · KV-Cache',            section: 'Inference' },
  { slug: 'quantization',     title: '12 · Quantization',        section: 'Inference' },
  { slug: 'flash-attention',  title: 'FlashAttention',           section: 'Inference' },
  { slug: 'speculative-decoding', title: 'Speculative Decoding', section: 'Inference' },
  { slug: 'vllm-paged',       title: 'vLLM & PagedAttention',    section: 'Inference' },
  { slug: 'yarn-rope-scaling',title: 'YaRN — Long Context',      section: 'Inference' },

  { slug: 'lora',             title: '13 · LoRA / SFT',          section: 'Finetuning' },
  { slug: 'rlhf',             title: '14 · RLHF / DPO',          section: 'Finetuning' },
  { slug: 'dpo',              title: 'DPO',                      section: 'Finetuning' },
  { slug: 'grpo',             title: 'GRPO',                     section: 'Finetuning' },
  { slug: 'constitutional-ai',title: 'Constitutional AI / RLAIF',section: 'Finetuning' },
  { slug: 'instruction-tuning', title: 'Instruction Tuning Data', section: 'Finetuning' },

  { slug: 'react-agents',     title: 'ReAct & Tool Use',         section: 'Agents' },
  { slug: 'reflexion',        title: 'Reflexion',                section: 'Agents' },
  { slug: 'reasoning-models', title: 'Reasoning Models (o1, R1)',section: 'Agents' },

  { slug: 'benchmarks',       title: 'LLM Benchmarks',           section: 'Evaluation' },
  { slug: 'llm-as-judge',     title: 'LLM-as-a-Judge',           section: 'Evaluation' },

  { slug: 'multimodal',       title: '15 · Multimodal',          section: 'Frontier' },
  { slug: 'nanochat',         title: '16 · nanochat',            section: 'Frontier' },
  { slug: 'interpretability', title: 'Mech Interpretability',    section: 'Frontier' },

  { slug: 'watermarking',     title: 'Watermarking',             section: 'Safety' },
  { slug: 'jailbreaks',       title: 'Jailbreaks & Injection',   section: 'Safety' },
];

export function neighbors(slug: string) {
  const i = chapters.findIndex((c) => c.slug === slug);
  return { prev: i > 0 ? chapters[i - 1] : null, next: i >= 0 && i < chapters.length - 1 ? chapters[i + 1] : null };
}
