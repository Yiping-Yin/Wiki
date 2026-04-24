/**
 * Build a client-loadable MiniSearch index over the entire corpus
 * (LLM wiki chapters + 454 personal knowledge docs).
 *
 *   npx tsx scripts/build-search-index.ts
 *
 * Output:
 *   knowledge/.cache/indexes/search-index.json
 *
 * The SearchBox client component lazy-loads this and runs queries fully in-browser.
 */
import MiniSearch from 'minisearch';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readKnowledgeDocBody } from '../lib/knowledge-doc-cache';
import { derivedIndexRoot, searchIndexPath } from '../lib/derived-index-cache';
import { getAllDocs } from '../lib/knowledge-store';

const ROOT = process.cwd();

type Item = {
  id: string;
  title: string;
  href: string;
  category: string;
  subcategory: string;
  sourcePath: string;
  body: string;
};

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
  for (const c of navMod.chapters as Array<{ slug: string; title: string; section: string }>) {
    try {
      const raw = await fs.readFile(path.join(wikiRoot, c.slug, 'page.mdx'), 'utf-8');
      const body = stripMDX(raw).slice(0, 6000);
      items.push({
        id: `wiki/${c.slug}`,
        title: c.title,
        href: `/wiki/${c.slug}`,
        category: `LLM · ${c.section}`,
        subcategory: '',
        sourcePath: '',
        body,
      });
    } catch {}
  }

  // 2. Personal knowledge
  try {
    const manifest = await getAllDocs();
    for (const m of manifest) {
      try {
        const body = ((await readKnowledgeDocBody(m.id))?.body ?? '').slice(0, 6000);
        items.push({
          id: `know/${m.id}`,
          title: m.title,
          href: `/knowledge/${m.categorySlug}/${m.fileSlug}`,
          category: m.category,
          subcategory: m.subcategory ?? '',
          sourcePath: m.sourcePath,
          body,
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

  const ms = new MiniSearch({
    idField: 'id',
    fields: ['title', 'category', 'body'],
    storeFields: ['title', 'href', 'category', 'subcategory', 'sourcePath'],
    searchOptions: {
      boost: { title: 4, category: 2 },
      fuzzy: 0.15,
      prefix: true,
    },
  });

  ms.addAll(items);

  // Serialize the index plus the doc store
  const out = {
    generatedAt: new Date().toISOString(),
    count: items.length,
    index: ms.toJSON(),
  };
  await fs.mkdir(derivedIndexRoot(), { recursive: true });
  const outPath = searchIndexPath();
  await fs.writeFile(outPath, JSON.stringify(out));
  const sizeMB = (JSON.stringify(out).length / 1024 / 1024).toFixed(1);
  console.log(`✅ wrote ${outPath}  (${items.length} docs · ${sizeMB} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
