/**
 * Build a vector index for RAG over the entire corpus
 * (LLM wiki chapters + personal knowledge docs).
 *
 *   npx tsx scripts/build-rag-index.ts
 *
 * Output:
 *   public/rag-index.json   { dim, docs: [{id, title, href, vector: number[]}] }
 *
 * The /api/ask route loads this once on cold start, embeds incoming queries
 * with the same model, and ranks by cosine similarity. Pure local — no API.
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

type Item = { id: string; title: string; href: string; text: string };

function stripMDX(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\$[^$\n]*\$/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/export\s+const[^;]+;/g, ' ')
    .replace(/import[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadCorpus(): Promise<Item[]> {
  const items: Item[] = [];

  // 1. LLM wiki chapters
  const navMod = await import(path.join(ROOT, 'lib', 'nav.ts'));
  const wikiRoot = path.join(ROOT, 'app', 'wiki');
  for (const c of navMod.chapters as Array<{ slug: string; title: string }>) {
    try {
      const raw = await fs.readFile(path.join(wikiRoot, c.slug, 'page.mdx'), 'utf-8');
      const text = stripMDX(raw).slice(0, 4000);
      items.push({ id: `wiki/${c.slug}`, title: c.title, href: `/wiki/${c.slug}`, text });
    } catch {}
  }

  // 2. Personal knowledge — manifest + bodies
  try {
    const manifest = JSON.parse(
      await fs.readFile(path.join(ROOT, 'lib', 'knowledge-manifest.json'), 'utf-8'),
    ) as Array<{ id: string; title: string; category: string; categorySlug: string; fileSlug: string; preview: string }>;
    for (const m of manifest) {
      try {
        const bodyFile = path.join(ROOT, 'public', 'knowledge', 'docs', `${m.id}.json`);
        const body = JSON.parse(await fs.readFile(bodyFile, 'utf-8')).body ?? '';
        const text = (m.title + '. ' + body).slice(0, 4000);
        items.push({
          id: `know/${m.id}`,
          title: `${m.title} · ${m.category}`,
          href: `/knowledge/${m.categorySlug}/${m.fileSlug}`,
          text,
        });
      } catch {}
    }
  } catch {}

  return items;
}

async function main() {
  console.log('📚 loading corpus...');
  const items = await loadCorpus();
  console.log(`   ${items.length} items`);

  console.log('📐 loading embedding model (Xenova/all-MiniLM-L6-v2)...');
  const { pipeline } = await import('@huggingface/transformers');
  const extractor: any = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });

  const docs: { id: string; title: string; href: string; vector: number[] }[] = [];
  let dim = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const r = await extractor(it.text, { pooling: 'mean', normalize: true });
    const vec = Array.from(r.data as Float32Array);
    if (!dim) dim = vec.length;
    docs.push({ id: it.id, title: it.title, href: it.href, vector: vec });
    if ((i + 1) % 25 === 0 || i === items.length - 1) {
      process.stdout.write(`  ${i + 1}/${items.length}\r`);
    }
  }
  console.log();

  const out = { dim, generatedAt: new Date().toISOString(), docs };
  const outPath = path.join(ROOT, 'public', 'rag-index.json');
  await fs.writeFile(outPath, JSON.stringify(out));
  const sizeMB = (JSON.stringify(out).length / 1024 / 1024).toFixed(1);
  console.log(`✅ wrote ${outPath}  (${docs.length} docs · dim ${dim} · ${sizeMB} MB)`);

  // Precompute related docs (top-5 nearest neighbors per doc) for fast SSR.
  console.log('🔗 computing top-5 neighbors per doc...');
  const titleById = new Map(items.map((it) => [it.id, it]));
  const related: Record<string, Array<{ id: string; title: string; href: string; score: number }>> = {};
  for (let i = 0; i < docs.length; i++) {
    const a = docs[i].vector;
    const scored: Array<{ d: typeof docs[0]; s: number }> = [];
    for (let j = 0; j < docs.length; j++) {
      if (i === j) continue;
      const b = docs[j].vector;
      let s = 0;
      for (let k = 0; k < a.length; k++) s += a[k] * b[k];
      scored.push({ d: docs[j], s });
    }
    scored.sort((x, y) => y.s - x.s);
    related[docs[i].id] = scored.slice(0, 5).map(({ d, s }) => ({
      id: d.id,
      title: d.title,
      href: d.href,
      score: Math.round(s * 1000) / 1000,
    }));
  }
  const relatedPath = path.join(ROOT, 'public', 'related.json');
  await fs.writeFile(relatedPath, JSON.stringify(related));
  const relMB = (JSON.stringify(related).length / 1024 / 1024).toFixed(2);
  console.log(`✅ wrote ${relatedPath}  (${Object.keys(related).length} entries · ${relMB} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
