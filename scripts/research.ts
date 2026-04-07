/**
 * Auto-research: generate a new MDX chapter from a topic.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npm run research "FlashAttention-3"
 */
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';

const topic = process.argv.slice(2).join(' ').trim();
if (!topic) {
  console.error('Usage: npm run research "<topic>"');
  process.exit(1);
}

const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

const client = new Anthropic({ apiKey });

const prompt = `You are writing one chapter of a Notion-style LLM wiki. The chapter is on: "${topic}".

Output STRICT MDX only — no preamble, no fencing, no explanation. Follow this exact skeleton:

export const metadata = { title: '${topic} · LLM Wiki' };

<ChapterShell slug="${slug}">

# ${topic}

(2-paragraph intro: what it is, why it matters, who invented it, year)

## Key idea

(1 paragraph + 1-2 LaTeX block formulas using $$...$$)

## How it works

(2-3 paragraphs, may include 1 mermaid diagram via <Mermaid chart={\`...\`} />)

## Code

\`\`\`python
# 10-25 line illustrative snippet
\`\`\`

<Callout type="tip">
(one non-obvious insight)
</Callout>

## Reading

<PDFNotes src="https://arxiv.org/pdf/XXXX.XXXXX" title="Authors — Title (Year)" />

</ChapterShell>

Rules:
- Use real arXiv IDs you are confident about. If unsure, omit the PDFNotes line.
- LaTeX must be valid KaTeX.
- Do NOT wrap the output in code fences.
- Do NOT add any text before "export" or after "</ChapterShell>".
`;

console.log(`🔎 Researching: ${topic}`);
const msg = await client.messages.create({
  model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
  max_tokens: 2500,
  messages: [{ role: 'user', content: prompt }],
});

const mdx = msg.content
  .filter((b: any) => b.type === 'text')
  .map((b: any) => b.text)
  .join('\n')
  .trim()
  .replace(/^```(?:mdx)?\n?/, '')
  .replace(/\n?```$/, '');

const dir = path.join(process.cwd(), 'app', 'wiki', slug);
await fs.mkdir(dir, { recursive: true });
const file = path.join(dir, 'page.mdx');
await fs.writeFile(file, mdx + '\n', 'utf-8');

console.log(`✅ Wrote ${file}`);
console.log(`👉 Add to lib/nav.ts to surface in the sidebar:`);
console.log(`   { slug: '${slug}', title: '${topic}', section: 'Frontier' },`);
