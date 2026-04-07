/**
 * Build a semantic atlas of all wiki content + optional local corpus.
 *
 *   npx tsx scripts/build-atlas.ts
 *
 * Inputs:
 *   - app/wiki/**\/page.mdx              (always)
 *   - knowledge/**\/*.{md,mdx,txt}       (optional, recursive)
 *
 * Output:
 *   - public/atlas.json   { docs: [{id, slug, title, x, y, cluster, source}], clusters: [{id, label, x, y, size}] }
 *
 * Pipeline:
 *   1. Walk corpora, extract title + body (~2k chars)
 *   2. Embed each doc with @huggingface/transformers (all-MiniLM-L6-v2, 384d, local, no API)
 *   3. UMAP → 2D
 *   4. K-means cluster (k=auto, ~sqrt(N))
 *   5. For each cluster: nearest doc to centroid → use its title as cluster label
 *      (optional: pipe to `claude -p` for a 2-word label)
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// ---------- 1. Walk corpus ----------

type Doc = { id: string; slug: string; title: string; body: string; source: 'wiki' | 'knowledge' };

async function walk(dir: string, exts: string[]): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop()!;
    for (const ent of await fs.readdir(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else if (exts.some((e) => ent.name.endsWith(e))) out.push(p);
    }
  }
  return out;
}

function extractTitle(body: string, fallback: string): string {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].replace(/\s*\([^)]*\)$/, '').trim();
  const meta = body.match(/title:\s*['"]([^'"]+)['"]/);
  if (meta) return meta[1].replace(/\s*·.*$/, '').trim();
  return fallback;
}

function stripMDX(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ')                 // code blocks
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')               // block math
    .replace(/\$[^$\n]*\$/g, ' ')                    // inline math
    .replace(/<[^>]+>/g, ' ')                        // jsx tags
    .replace(/export\s+const[^;]+;/g, ' ')           // mdx exports
    .replace(/import[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadDocs(): Promise<Doc[]> {
  const root = process.cwd();
  const docs: Doc[] = [];

  // 1. LLM wiki chapters (MDX)
  const wikiFiles = await walk(path.join(root, 'app', 'wiki'), ['.mdx', '.md']);
  for (const f of wikiFiles) {
    const slug = path.basename(path.dirname(f));
    const raw = await fs.readFile(f, 'utf-8');
    const title = extractTitle(raw, slug);
    const body = stripMDX(raw).slice(0, 4000);
    docs.push({ id: `wiki/${slug}`, slug, title, body, source: 'wiki' });
  }

  // 2. Personal knowledge — read from manifest + per-doc body files
  try {
    const manifestPath = path.join(root, 'lib', 'knowledge-manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as Array<{
      id: string; title: string; categorySlug: string; fileSlug: string; preview: string;
    }>;
    for (const m of manifest) {
      try {
        const bodyFile = path.join(root, 'public', 'knowledge', 'docs', `${m.id}.json`);
        const bodyJson = JSON.parse(await fs.readFile(bodyFile, 'utf-8'));
        const body = (bodyJson.body ?? m.preview ?? '').slice(0, 4000);
        docs.push({
          id: `know/${m.id}`,
          slug: `${m.categorySlug}/${m.fileSlug}`,
          title: m.title,
          body,
          source: 'knowledge',
        });
      } catch { /* skip missing body */ }
    }
  } catch { /* no manifest yet */ }

  // 3. Optional: legacy knowledge/ folder (for ad-hoc drops)
  const knowFiles = await walk(path.join(root, 'knowledge'), ['.md', '.mdx', '.txt']);
  for (const f of knowFiles) {
    const rel = path.relative(path.join(root, 'knowledge'), f);
    const slug = rel.replace(/\.[^.]+$/, '').replace(/[\\/]/g, '-');
    const raw = await fs.readFile(f, 'utf-8');
    const title = extractTitle(raw, slug);
    const body = stripMDX(raw).slice(0, 4000);
    docs.push({ id: `know-legacy/${slug}`, slug, title, body, source: 'knowledge' });
  }

  return docs;
}

// ---------- 2. Embed (local, via @huggingface/transformers) ----------

async function embed(docs: Doc[]): Promise<number[][]> {
  console.log(`📐 embedding ${docs.length} docs (first run downloads ~25MB model)...`);
  const { pipeline } = await import('@huggingface/transformers');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
  const out: number[][] = [];
  for (let i = 0; i < docs.length; i++) {
    const text = `${docs[i].title}. ${docs[i].body}`;
    const r: any = await extractor(text, { pooling: 'mean', normalize: true });
    out.push(Array.from(r.data as Float32Array));
    if ((i + 1) % 10 === 0 || i === docs.length - 1) {
      process.stdout.write(`  ${i + 1}/${docs.length}\r`);
    }
  }
  console.log();
  return out;
}

// ---------- 3. UMAP → 2D ----------

async function umap2d(vectors: number[][]): Promise<[number, number][]> {
  console.log(`🌀 UMAP ${vectors.length} × ${vectors[0].length} → 2D ...`);
  const { UMAP } = await import('umap-js');
  const u = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(15, Math.max(5, Math.floor(vectors.length / 4))),
    minDist: 0.1,
    spread: 1.2,
  });
  const result = await u.fitAsync(vectors);
  return result as [number, number][];
}

// ---------- 4. K-means clustering ----------

function kmeans(points: [number, number][], k: number, iters = 50): number[] {
  const N = points.length;
  // init centroids: pick k well-spaced points (k-means++)
  const centers: [number, number][] = [points[Math.floor(Math.random() * N)]];
  while (centers.length < k) {
    const dists = points.map((p) => {
      let m = Infinity;
      for (const c of centers) {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
        if (d < m) m = d;
      }
      return m;
    });
    const sum = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    for (let i = 0; i < N; i++) {
      r -= dists[i];
      if (r <= 0) { centers.push(points[i]); break; }
    }
  }
  const labels = new Array(N).fill(0);
  for (let it = 0; it < iters; it++) {
    // assign
    for (let i = 0; i < N; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = (points[i][0] - centers[c][0]) ** 2 + (points[i][1] - centers[c][1]) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
      labels[i] = best;
    }
    // update
    const sums = Array.from({ length: k }, () => [0, 0, 0] as [number, number, number]);
    for (let i = 0; i < N; i++) {
      sums[labels[i]][0] += points[i][0];
      sums[labels[i]][1] += points[i][1];
      sums[labels[i]][2] += 1;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][2] > 0) {
        centers[c] = [sums[c][0] / sums[c][2], sums[c][1] / sums[c][2]];
      }
    }
  }
  return labels;
}

// ---------- 5. Cluster labels (optional: claude -p) ----------

function runClaude(prompt: string, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve) => {
    const p = spawn('claude', ['-p', prompt, '--output-format', 'text'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const t = setTimeout(() => { p.kill(); resolve(''); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('close', () => { clearTimeout(t); resolve(out.trim()); });
    p.on('error', () => { clearTimeout(t); resolve(''); });
  });
}

async function labelClusters(docs: Doc[], coords: [number, number][], labels: number[], k: number, useClaude: boolean) {
  const clusters: { id: number; label: string; x: number; y: number; size: number; samples: string[] }[] = [];
  for (let c = 0; c < k; c++) {
    const members = docs.map((d, i) => ({ d, i })).filter(({ i }) => labels[i] === c);
    if (members.length === 0) continue;
    const cx = members.reduce((s, { i }) => s + coords[i][0], 0) / members.length;
    const cy = members.reduce((s, { i }) => s + coords[i][1], 0) / members.length;
    // closest doc to centroid → fallback label
    const closest = members
      .map(({ d, i }) => ({ d, dist: (coords[i][0] - cx) ** 2 + (coords[i][1] - cy) ** 2 }))
      .sort((a, b) => a.dist - b.dist);
    const samples = closest.slice(0, 5).map((m) => m.d.title);
    let label = closest[0].d.title.split(/[—:·]/)[0].trim().slice(0, 28);
    if (useClaude && samples.length >= 2) {
      const prompt = `Give a 2-3 word topic label for this cluster of LLM/ML wiki pages. Output ONLY the label, no quotes or punctuation.\n\nPages:\n- ${samples.join('\n- ')}`;
      const r = await runClaude(prompt, 20000);
      if (r && r.length < 40) label = r.replace(/^["']|["']$/g, '').trim();
    }
    clusters.push({ id: c, label, x: cx, y: cy, size: members.length, samples });
  }
  return clusters;
}

// ---------- main ----------

async function main() {
  const useClaude = !process.argv.includes('--no-labels');
  const docs = await loadDocs();
  console.log(`📚 found ${docs.length} docs`);
  if (docs.length < 4) {
    console.error('not enough docs to build atlas');
    process.exit(1);
  }
  const vecs = await embed(docs);
  const coords = await umap2d(vecs);
  const k = Math.min(12, Math.max(4, Math.round(Math.sqrt(docs.length / 2))));
  console.log(`🎯 k-means with k=${k}`);
  const labels = kmeans(coords, k);
  console.log(`🏷  labelling clusters${useClaude ? ' (via claude -p)' : ''}...`);
  const clusters = await labelClusters(docs, coords, labels, k, useClaude);

  // normalize coordinates to [-100, 100] for stable rendering
  const xs = coords.map((p) => p[0]), ys = coords.map((p) => p[1]);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const norm = (v: number, lo: number, hi: number) => ((v - lo) / (hi - lo) - 0.5) * 200;
  const normCoords = coords.map(([x, y]) => [norm(x, xMin, xMax), norm(y, yMin, yMax)] as [number, number]);
  const normClusters = clusters.map((c) => ({ ...c, x: norm(c.x, xMin, xMax), y: norm(c.y, yMin, yMax) }));

  const out = {
    generatedAt: new Date().toISOString(),
    docs: docs.map((d, i) => ({
      id: d.id, slug: d.slug, title: d.title, source: d.source,
      x: normCoords[i][0], y: normCoords[i][1], cluster: labels[i],
    })),
    clusters: normClusters,
  };
  const outPath = path.join(process.cwd(), 'public', 'atlas.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(out));
  console.log(`✅ wrote ${outPath}  (${docs.length} docs, ${clusters.length} clusters)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
