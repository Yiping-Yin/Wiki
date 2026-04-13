/**
 * Terminal batch processor — runs summarize / structure / quiz over many
 * knowledge docs by spawning the local `claude` CLI directly. No HTTP, no
 * Next.js server required.
 *
 * Usage:
 *   npx tsx scripts/batch-process.ts --task structure --category unsw-math-3856
 *   npx tsx scripts/batch-process.ts --task all --all
 *   npx tsx scripts/batch-process.ts --task summarize --concurrency 4
 *   npx tsx scripts/batch-process.ts --task quiz --only id1,id2
 *   npx tsx scripts/batch-process.ts --task structure --category unsw-fins-3640 --force
 *
 * Flags:
 *   --task <summarize|structure|quiz|all>   (default: summarize)
 *   --category <slug>                       restrict to one category
 *   --all                                   process every doc
 *   --only <id1,id2>                        only these doc ids
 *   --concurrency <N>                       default 3
 *   --force                                 ignore cache and regenerate
 *   --skip-existing                         (default true; pass --force to override)
 *
 * Cache locations are unchanged so the web UI picks them up automatically:
 *   knowledge/.cache/generated/summaries/<id>.json
 *   knowledge/.cache/generated/structures/<id>.json
 *   knowledge/.cache/generated/quizzes/<id>.json
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runClaude } from '../lib/claude-cli';
import { runtimeCacheDir, runtimeCachePath } from '../lib/generated-cache';
import { readKnowledgeDocBody } from '../lib/knowledge-doc-cache';
import { getAllDocs } from '../lib/knowledge-store';

const ROOT = process.cwd();

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = argv.indexOf('--' + n);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (n: string) => argv.includes('--' + n);

type Task = 'summarize' | 'structure' | 'quiz';
const TASKS_ARG = (flag('task', 'summarize') ?? 'summarize').toLowerCase();
const TASKS: Task[] = TASKS_ARG === 'all'
  ? ['summarize', 'structure', 'quiz']
  : [TASKS_ARG as Task];
for (const t of TASKS) if (!['summarize', 'structure', 'quiz'].includes(t)) {
  console.error(`unknown --task ${t}`); process.exit(1);
}

const categoryFilter = flag('category');
const allFlag = has('all');
const onlyArg = flag('only');
const onlySet = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim())) : null;
const concurrency = parseInt(flag('concurrency', '3')!, 10);
const force = has('force');

// ---------- manifest ----------
type DocMeta = {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  fileSlug: string;
  hasText: boolean;
};

async function loadManifest(): Promise<DocMeta[]> {
  return getAllDocs();
}

async function loadBody(id: string): Promise<{ title: string; body: string } | null> {
  return readKnowledgeDocBody(id);
}

// ---------- task definitions ----------
type TaskSpec = {
  cacheDir: string;
  cachePathFor: (id: string) => string;
  prompt: (title: string, body: string) => string;
  parse: (raw: string, id: string, title: string) => any;
  minBodyChars: number;
};

const SUMMARIZE: TaskSpec = {
  cacheDir: runtimeCacheDir('summaries'),
  cachePathFor: (id) => runtimeCachePath('summaries', id),
  minBodyChars: 50,
  prompt: (title, body) => `Summarize this document. Output STRICT JSON only, no preamble, no code fences:

{
  "summary": "<2-3 sentence overview>",
  "bullets": ["<key point 1>", "<key point 2>", "<key point 3>", "<key point 4>", "<key point 5>"],
  "keyTerms": ["<term>", "<term>", "<term>", "<term>", "<term>"]
}

Document title: ${title}

Document text (may contain OCR artefacts — extract the meaning, ignore formatting noise):
"""
${body.slice(0, 12000)}
"""`,
  parse: (raw, id) => {
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    let p: any;
    try { p = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('non-JSON');
      p = JSON.parse(m[0]);
    }
    return {
      id,
      summary: String(p.summary ?? ''),
      bullets: Array.isArray(p.bullets) ? p.bullets.slice(0, 8).map(String) : [],
      keyTerms: Array.isArray(p.keyTerms) ? p.keyTerms.slice(0, 12).map(String) : [],
      generatedAt: new Date().toISOString(),
    };
  },
};

const STRUCTURE: TaskSpec = {
  cacheDir: runtimeCacheDir('structures'),
  cachePathFor: (id) => runtimeCachePath('structures', id),
  minBodyChars: 100,
  prompt: (title, body) => `You are restructuring a document for a personal knowledge wiki. The text below comes from a PDF extraction and may contain OCR artefacts.

Your job: produce a clean, well-structured Markdown rewrite that captures the document's content faithfully. This will be rendered in a Notion-style reader.

Output rules:
- Output ONLY raw Markdown, no preamble, no code fences around the whole output.
- Use ## H2 for major sections, ### H3 for subsections.
- Render any equations as KaTeX block math $$ ... $$ (or inline $...$).
- Render code/pseudocode as fenced \`\`\`lang ... \`\`\` blocks.
- Use > blockquote for callouts (definitions, key insights, warnings).
- Use bullet and numbered lists generously.
- Bold key terms on first introduction.
- If slide deck: organize by topic. If paper: Abstract / Background / Method / Results / Discussion. If notes: lecture topics.
- Drop noise: page numbers, headers, license text.
- Aim for 600-2000 words.
- DO NOT invent content. Stay faithful to the source.

Title: ${title}

Source text:
"""
${body.slice(0, 18000)}
"""

Begin Markdown output now:
`,
  parse: (raw, id, title) => {
    const cleaned = raw.replace(/^```(?:markdown|md)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    if (cleaned.length < 50) throw new Error('too short');
    return { id, title, markdown: cleaned, generatedAt: new Date().toISOString() };
  },
};

const QUIZ: TaskSpec = {
  cacheDir: runtimeCacheDir('quizzes'),
  cachePathFor: (id) => runtimeCachePath('quizzes', id),
  minBodyChars: 100,
  prompt: (title, body) => `Create 3 multiple-choice questions to test understanding of this document. Output STRICT JSON, no preamble or fences:

{
  "questions": [
    {
      "q": "<question stem>",
      "choices": ["<A>", "<B>", "<C>", "<D>"],
      "correct": 0,
      "explain": "<1-2 sentence explanation>"
    }
  ]
}

Rules:
- Test conceptual understanding, not trivia
- "correct" is the 0-indexed position of the right answer
- Distractors should be plausible
- One easy, one medium, one hard

Document title: ${title}

Document text:
"""
${body.slice(0, 12000)}
"""`,
  parse: (raw, id) => {
    const cleaned = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    let p: any;
    try { p = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('non-JSON');
      p = JSON.parse(m[0]);
    }
    const questions = (p.questions ?? []).slice(0, 5).map((q: any) => ({
      q: String(q.q ?? ''),
      choices: Array.isArray(q.choices) ? q.choices.slice(0, 4).map(String) : [],
      correct: Number.isInteger(q.correct) ? Math.max(0, Math.min(3, q.correct)) : 0,
      explain: String(q.explain ?? ''),
    })).filter((q: any) => q.q && q.choices.length === 4);
    if (questions.length === 0) throw new Error('no questions');
    return { id, questions, generatedAt: new Date().toISOString() };
  },
};

const SPECS: Record<Task, TaskSpec> = { summarize: SUMMARIZE, structure: STRUCTURE, quiz: QUIZ };

// ---------- runner ----------
async function processOne(doc: DocMeta, task: Task): Promise<'cached' | 'done' | 'skipped' | 'error'> {
  const spec = SPECS[task];
  const cacheFile = spec.cachePathFor(doc.id);
  if (!force && existsSync(cacheFile)) return 'cached';
  if (!doc.hasText) return 'skipped';

  const data = await loadBody(doc.id);
  if (!data || data.body.trim().length < spec.minBodyChars) return 'skipped';

  const prompt = spec.prompt(data.title, data.body);
  try {
    const raw = await runClaude(prompt, { timeoutMs: task === 'structure' ? 240000 : 180000 });
    const parsed = spec.parse(raw, doc.id, data.title);
    await fs.mkdir(spec.cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(parsed, null, 2));
    return 'done';
  } catch (e: any) {
    console.error(`  ✗ ${doc.id} (${task}): ${e.message.split('\n')[0].slice(0, 100)}`);
    return 'error';
  }
}

async function main() {
  const manifest = await loadManifest();
  let docs = manifest;
  if (categoryFilter) docs = docs.filter((d) => d.categorySlug === categoryFilter);
  if (onlySet) docs = docs.filter((d) => onlySet.has(d.id));
  if (!categoryFilter && !allFlag && !onlySet) {
    console.error('error: pass --category <slug> or --all or --only <ids>');
    process.exit(1);
  }
  if (docs.length === 0) {
    console.error('no docs match the filter');
    process.exit(1);
  }

  console.log(`📦 ${docs.length} docs · tasks: ${TASKS.join(', ')} · concurrency=${concurrency}${force ? ' · FORCE' : ''}`);
  console.log();

  for (const task of TASKS) {
    console.log(`▶ ${task}`);
    let cursor = 0;
    let done = 0, cached = 0, skipped = 0, errors = 0;
    const startTs = Date.now();

    const worker = async (id: number) => {
      while (cursor < docs.length) {
        const i = cursor++;
        const doc = docs[i];
        const t0 = Date.now();
        const result = await processOne(doc, task);
        const dt = ((Date.now() - t0) / 1000).toFixed(0);
        if (result === 'done') done++;
        else if (result === 'cached') cached++;
        else if (result === 'skipped') skipped++;
        else if (result === 'error') errors++;
        const total = done + cached + skipped + errors;
        const icon = result === 'done' ? '✓' : result === 'cached' ? '·' : result === 'skipped' ? '⊘' : '✗';
        process.stdout.write(`  [${total}/${docs.length}] ${icon} ${doc.id.slice(0, 50).padEnd(50)} ${result === 'done' ? `(${dt}s)` : ''}\n`);
      }
    };

    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));

    const totalDt = ((Date.now() - startTs) / 1000).toFixed(0);
    console.log(`  ✓ ${done} done · · ${cached} cached · ⊘ ${skipped} skipped · ✗ ${errors} errors  (${totalDt}s)\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
