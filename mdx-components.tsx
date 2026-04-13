import type { MDXComponents } from 'mdx/types';
import dynamic from 'next/dynamic';

// ── Light & always-needed components: import eagerly
import { Callout } from './components/Callout';
import { YouTube } from './components/YouTube';
import { PDF } from './components/PDF';
import { PDFNotes } from './components/PDFNotes';
import { ChapterShell } from './components/ChapterShell';

// ── Heavy interactive widgets: lazy-load only when an MDX page actually uses them.
//   This trims ~100 KB off every wiki/* route's First Load JS.
const Mermaid           = dynamic(() => import('./components/Mermaid').then((m) => m.Mermaid));
const PyodideRunner     = dynamic(() => import('./components/PyodideRunner').then((m) => m.PyodideRunner));
const NeuralNetCanvas   = dynamic(() => import('./components/NeuralNetCanvas').then((m) => m.NeuralNetCanvas));
const AttentionHeatmap  = dynamic(() => import('./components/AttentionHeatmap').then((m) => m.AttentionHeatmap));
const SoftmaxPlayground = dynamic(() => import('./components/SoftmaxPlayground').then((m) => m.SoftmaxPlayground));
const GradientDescent   = dynamic(() => import('./components/GradientDescent').then((m) => m.GradientDescent));
const LRScheduler       = dynamic(() => import('./components/LRScheduler').then((m) => m.LRScheduler));
const BPETokenizer      = dynamic(() => import('./components/BPETokenizer').then((m) => m.BPETokenizer));

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    Callout, YouTube, PDF, PDFNotes, ChapterShell,
    Mermaid, PyodideRunner, NeuralNetCanvas,
    AttentionHeatmap, SoftmaxPlayground, GradientDescent,
    LRScheduler, BPETokenizer,
  };
}
