/**
 * Auto-research a single chapter using a LOCAL CLI (claude or codex).
 *
 * Usage:
 *   npx tsx scripts/research.ts <slug> "<title>" "<hint>" [--cli claude|codex] [--model <id>]
 *
 * Examples:
 *   npx tsx scripts/research.ts rope "RoPE — Rotary Position Embeddings" "rotary position embedding..."
 *   npx tsx scripts/research.ts mamba "Mamba" "selective state space" --cli codex
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

type CLI = 'claude' | 'codex';

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: tsx scripts/research.ts <slug> "<title>" "<hint>" [--cli claude|codex] [--model <id>]');
  process.exit(1);
}
const [slug, title, hint, ...rest] = args;
let cli: CLI = 'claude';
let model: string | undefined;
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--cli') cli = rest[++i] as CLI;
  else if (rest[i] === '--model') model = rest[++i];
}

function runCLI(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let bin: string;
    let cliArgs: string[];
    if (cli === 'claude') {
      bin = 'claude';
      cliArgs = ['-p', prompt, '--output-format', 'text'];
      if (model) cliArgs.push('--model', model);
    } else {
      bin = 'codex';
      cliArgs = ['exec', prompt];
      if (model) cliArgs.push('--model', model);
    }
    const proc = spawn(bin, cliArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cli} exited ${code}\n${err}`));
    });
    proc.on('error', reject);
  });
}

function cleanMDX(raw: string): string {
  let s = raw.trim();
  // strip leading/trailing fences if model wrapped output
  s = s.replace(/^```(?:mdx|markdown)?\s*\n/, '').replace(/\n```\s*$/, '');
  // drop anything before "export const"
  const start = s.indexOf('export const');
  if (start > 0) s = s.slice(start);
  // drop anything after final </ChapterShell>
  const end = s.lastIndexOf('</ChapterShell>');
  if (end >= 0) s = s.slice(0, end + '</ChapterShell>'.length);
  return s.trim() + '\n';
}

async function main() {
  const tpl = await fs.readFile(
    path.join(process.cwd(), 'scripts', 'prompts', 'chapter.md'),
    'utf-8',
  );
  const prompt = tpl
    .replaceAll('{{TITLE}}', title)
    .replaceAll('{{SLUG}}', slug)
    .replaceAll('{{HINT}}', hint);

  console.log(`🔎 [${cli}] researching: ${title} (${slug})`);
  const t0 = Date.now();
  const raw = await runCLI(prompt);
  const mdx = cleanMDX(raw);

  if (!mdx.includes('<ChapterShell') || !mdx.includes('</ChapterShell>')) {
    console.error('❌ Generated content is missing ChapterShell — aborting write');
    console.error(raw.slice(0, 500));
    process.exit(2);
  }

  const dir = path.join(process.cwd(), 'app', 'wiki', slug);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'page.mdx');
  await fs.writeFile(file, mdx, 'utf-8');

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`✅ wrote ${file}  (${mdx.length} chars, ${dt}s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
