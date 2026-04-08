/**
 * Scan every LLM chapter MDX and emit lib/chapter-meta.json with feature flags
 *   hasVideo  · has a <YouTube> embed
 *   hasMath   · has $...$ or $$...$$
 *   hasCode   · has a fenced code block
 *   hasMermaid· has <Mermaid>
 *   hasPdf    · has <PDFNotes> or <PDF>
 *   hasWidget · uses any of the interactive widgets
 *   wordCount · approximate prose word count
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chapters } from '../lib/nav';

const ROOT = process.cwd();

type Meta = {
  hasVideo: boolean;
  hasMath: boolean;
  hasCode: boolean;
  hasMermaid: boolean;
  hasPdf: boolean;
  hasWidget: boolean;
  wordCount: number;
};

async function main() {
  const out: Record<string, Meta> = {};
  for (const c of chapters) {
    const p = path.join(ROOT, 'app', 'wiki', c.slug, 'page.mdx');
    let raw = '';
    try { raw = await fs.readFile(p, 'utf-8'); } catch { continue; }
    const stripped = raw
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/\$[^$\n]*\$/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#*_`>\-]/g, ' ');
    out[c.slug] = {
      hasVideo: /<YouTube\s/i.test(raw),
      hasMath: /\$\$|\$[^$\n]+\$/.test(raw),
      hasCode: /```[a-z]/i.test(raw),
      hasMermaid: /<Mermaid/i.test(raw),
      hasPdf: /<PDF(Notes)?\s/i.test(raw),
      hasWidget: /<(SoftmaxPlayground|AttentionHeatmap|BPETokenizer|LRScheduler|GradientDescent|PyodideRunner|NeuralNetCanvas)/i.test(raw),
      wordCount: stripped.split(/\s+/).filter(Boolean).length,
    };
  }
  const file = path.join(ROOT, 'lib', 'chapter-meta.json');
  await fs.writeFile(file, JSON.stringify(out, null, 2));
  console.log(`✅ wrote ${file} (${Object.keys(out).length} chapters)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
