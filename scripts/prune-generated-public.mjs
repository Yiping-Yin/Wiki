import { rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const targets = [
  'public/atlas.json',
  'public/search-index.json',
  'public/rag-index.json',
  'public/related.json',
  'public/knowledge/docs',
  'public/knowledge/quizzes',
  'public/knowledge/structures',
  'public/knowledge/summaries',
];

for (const rel of targets) {
  const abs = path.join(root, rel);
  await rm(abs, { recursive: true, force: true }).catch(() => {});
  console.log(`pruned ${rel}`);
}
