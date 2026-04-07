/**
 * Batch auto-research using a LOCAL CLI.
 *
 *   npx tsx scripts/research-batch.ts                # all chapters in chapters.json
 *   npx tsx scripts/research-batch.ts --concurrency 3
 *   npx tsx scripts/research-batch.ts --cli codex
 *   npx tsx scripts/research-batch.ts --only rope,mamba,dpo
 *   npx tsx scripts/research-batch.ts --skip-existing
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (name: string, def?: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const has = (name: string) => argv.includes(`--${name}`);

const concurrency = parseInt(flag('concurrency', '2')!, 10);
const cli = flag('cli', 'claude')!;
const onlyArg = flag('only');
const only = onlyArg ? new Set(onlyArg.split(',').map((s) => s.trim())) : null;
const skipExisting = has('skip-existing');

type Chapter = { slug: string; title: string; section: string; hint: string };

let cursor = 0;
let done = 0;
const failures: { slug: string; err: string }[] = [];
let chapters: Chapter[] = [];

async function worker(id: number) {
  while (true) {
    const i = cursor++;
    if (i >= chapters.length) return;
    const ch = chapters[i];
    const t0 = Date.now();
    process.stdout.write(`[w${id}] ▶ ${ch.slug}\n`);
    try {
      await new Promise<void>((resolve, reject) => {
        const p = spawn(
          'npx',
          ['tsx', 'scripts/research.ts', ch.slug, ch.title, ch.hint, '--cli', cli],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let err = '';
        p.stdout.on('data', () => {});
        p.stderr.on('data', (d) => (err += d.toString()));
        p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
      });
      done++;
      const dt = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(`[w${id}] ✓ ${ch.slug}  (${done}/${chapters.length}, ${dt}s)`);
    } catch (e: any) {
      failures.push({ slug: ch.slug, err: e.message });
      console.error(`[w${id}] ✗ ${ch.slug}: ${e.message.split('\n')[0]}`);
    }
  }
}

async function main() {
  const all: Chapter[] = JSON.parse(
    await fs.readFile(path.join(process.cwd(), 'scripts', 'chapters.json'), 'utf-8'),
  );
  chapters = all.filter((c) => {
    if (only && !only.has(c.slug)) return false;
    if (skipExisting && existsSync(path.join(process.cwd(), 'app', 'wiki', c.slug, 'page.mdx'))) return false;
    return true;
  });

  console.log(`🚀 batch: ${chapters.length} chapters via ${cli}, concurrency=${concurrency}`);

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));

  console.log(`\n✅ done: ${done}/${chapters.length}`);
  if (failures.length) {
    console.log(`❌ failures: ${failures.length}`);
    failures.forEach((f) => console.log(`   - ${f.slug}: ${f.err.split('\n')[0]}`));
  }
  console.log(`\n👉 next: npm run build`);
}

main().catch((e) => { console.error(e); process.exit(1); });
