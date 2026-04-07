import type { MDXComponents } from 'mdx/types';
import { Callout } from './components/Callout';
import { YouTube } from './components/YouTube';
import { PDF } from './components/PDF';
import { PDFNotes } from './components/PDFNotes';
import { SoftmaxPlayground } from './components/SoftmaxPlayground';
import { AttentionHeatmap } from './components/AttentionHeatmap';
import { BPETokenizer } from './components/BPETokenizer';
import { LRScheduler } from './components/LRScheduler';
import { GradientDescent } from './components/GradientDescent';
import { Mermaid } from './components/Mermaid';
import { PyodideRunner } from './components/PyodideRunner';
import { ChapterShell } from './components/ChapterShell';

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    Callout, YouTube, PDF, PDFNotes,
    SoftmaxPlayground, AttentionHeatmap, BPETokenizer,
    LRScheduler, GradientDescent, Mermaid, PyodideRunner, ChapterShell,
  };
}
