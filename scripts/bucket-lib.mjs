import { execFileSync } from 'node:child_process';

export function loadStatusLines() {
  const raw = execFileSync('git', ['-c', 'core.quotePath=false', 'status', '--porcelain=v1'], { encoding: 'utf8' });
  return raw.split('\n').filter(Boolean).map((line) => ({
    status: line.slice(0, 2),
    path: line.slice(3),
  }));
}

export function bucketFor(path) {
  if (
    path === 'public/atlas.json'
    || path === 'public/search-index.json'
    || path === 'public/rag-index.json'
    || path === 'public/related.json'
    || path.startsWith('public/knowledge/docs/')
    || path.startsWith('public/knowledge/quizzes/')
    || path.startsWith('public/knowledge/structures/')
    || path.startsWith('public/knowledge/summaries/')
  ) {
    return 'generated-public-removals';
  }

  if (
    path === '.env.example'
    || path === '.gitignore'
    || path === 'package.json'
    || path === 'README.md'
    || path.startsWith('app/api/')
    || path.startsWith('lib/server-config')
    || path.startsWith('lib/generated-cache')
    || path.startsWith('lib/knowledge-doc-cache')
    || path.startsWith('lib/derived-index-cache')
    || path.startsWith('lib/knowledge-store')
    || path.startsWith('lib/use-knowledge-nav')
    || path.startsWith('lib/claude-cli')
    || path.startsWith('lib/wikilinks')
    || path === 'lib/knowledge.ts'
    || path === 'lib/knowledge-nav.ts'
    || path === 'lib/knowledge-manifest.json'
    || path.startsWith('scripts/')
  ) {
    return 'knowledge-runtime-infra';
  }

  if (path.startsWith('macos-app/')) {
    return 'macos-shell';
  }

  if (
    path.startsWith('lib/trace/')
    || path.startsWith('lib/note/')
    || path.startsWith('lib/capture/')
    || path.startsWith('lib/view/')
    || path === 'lib/ai/system-prompt.ts'
    || path === 'lib/ai-cli.ts'
    || path === 'lib/embed.ts'
    || path === 'lib/doc-context.ts'
    || path === 'lib/knowledge-types.ts'
    || path === 'lib/use-animated-presence.ts'
    || path === 'lib/use-history.ts'
    || path === 'lib/use-pins.ts'
    || path === 'lib/use-cli-model.ts'
    || path === 'tsconfig.json'
  ) {
    return 'note-trace-runtime';
  }

  if (path === 'public/manifest.webmanifest' || path === 'public/sw.js') {
    return 'pwa-runtime';
  }

  if (
    path === 'CANVAS_SPEC.md'
    || path === 'CAPTURE_SPEC.md'
    || path === 'DESIGN_MEMORY.md'
    || path === 'LOGO_BRIEF.md'
  ) {
    return 'docs-specs';
  }

  if (path.startsWith('app/') || path.startsWith('components/') || path === 'mdx-components.tsx') {
    return 'product-ui';
  }

  return 'uncategorized';
}

export function stageHint(bucket) {
  switch (bucket) {
    case 'generated-public-removals':
      return 'git add -u public/atlas.json public/search-index.json public/rag-index.json public/related.json public/knowledge/docs public/knowledge/quizzes public/knowledge/structures public/knowledge/summaries';
    case 'knowledge-runtime-infra':
      return 'git add .env.example .gitignore package.json README.md app/api lib scripts';
    case 'macos-shell':
      return 'git add macos-app/Loom';
    case 'note-trace-runtime':
      return 'git add lib/trace lib/note lib/capture lib/view lib/ai/system-prompt.ts lib/ai-cli.ts lib/embed.ts lib/doc-context.ts lib/knowledge-types.ts lib/use-animated-presence.ts lib/use-history.ts lib/use-pins.ts lib/use-cli-model.ts tsconfig.json';
    case 'pwa-runtime':
      return 'git add public/manifest.webmanifest public/sw.js';
    case 'docs-specs':
      return 'git add CANVAS_SPEC.md CAPTURE_SPEC.md DESIGN_MEMORY.md LOGO_BRIEF.md';
    case 'product-ui':
      return 'git add app components mdx-components.tsx';
    default:
      return 'review individually';
  }
}

export function groupByBucket(lines = loadStatusLines()) {
  const buckets = new Map();
  for (const item of lines) {
    const bucket = bucketFor(item.path);
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(item);
  }
  return buckets;
}
