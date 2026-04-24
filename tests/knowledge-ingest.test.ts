import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

async function importIngestModule() {
  const href = pathToFileURL(path.join(process.cwd(), 'scripts', 'ingest-knowledge.ts')).href;
  return import(`${href}?t=${Date.now()}-${Math.random()}`);
}

test('runKnowledgeIngest executes the repo ingest script then invalidates knowledge caches', async () => {
  const { runKnowledgeIngest } = await import('../lib/knowledge-ingest');

  const calls: string[] = [];
  let received:
    | { command: string; args: string[]; cwd: string; timeout: number }
    | null = null;

  await runKnowledgeIngest({
    cwd: '/tmp/loom-test',
    exec: async (spec) => {
      received = spec;
      calls.push('exec');
    },
    invalidate: () => {
      calls.push('invalidate');
    },
  });

  assert.deepEqual(received, {
    command: 'npx',
    args: ['tsx', 'scripts/ingest-knowledge.ts'],
    cwd: '/tmp/loom-test',
    timeout: 30_000,
  });
  assert.deepEqual(calls, ['exec', 'invalidate']);
});

test('ingest keeps a picked course folder as the source category', async () => {
  const { categorizePath } = await importIngestModule();
  const src = path.join('/tmp', 'UNSW', 'INFS3822');

  assert.deepEqual(
    categorizePath(path.join(src, 'Week 1', 'Lecture 01.pdf'), src, { included: [] }),
    {
      category: 'UNSW · INFS3822',
      categorySlug: 'unsw-infs3822',
      subcategory: 'Week 1',
    },
  );
});

test('ingest keeps a picked root folder when its children are content buckets', async () => {
  const { categorizePath } = await importIngestModule();
  const src = path.join('/tmp', 'INFS3822');

  assert.deepEqual(
    categorizePath(path.join(src, 'Assessment', 'rubric.pdf'), src, { included: [] }),
    {
      category: 'INFS3822',
      categorySlug: 'infs3822',
      subcategory: 'Assessment',
    },
  );
});

test('ingest keeps a selected scoped subtree as the source category', async () => {
  const { categorizePath } = await importIngestModule();
  const src = path.join('/tmp', 'Library');

  assert.deepEqual(
    categorizePath(path.join(src, 'UNSW', 'INFS3822', 'Week 2', 'slides.pdf'), src, {
      included: ['UNSW/INFS3822'],
    }),
    {
      category: 'UNSW · INFS3822',
      categorySlug: 'unsw-infs3822',
      subcategory: 'Week 2',
    },
  );
});

test('ingest writes a picked folder as one source collection with its folders underneath', async (t) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-picked-folder-'));
  const picked = path.join(tempRoot, 'INFS 3822');
  await mkdir(path.join(picked, 'Assessment'), { recursive: true });
  await mkdir(path.join(picked, 'Week'), { recursive: true });
  await writeFile(path.join(picked, 'Course Guide.md'), '# Guide', 'utf8');
  await writeFile(path.join(picked, 'Assessment', 'rubric.md'), '# Rubric', 'utf8');
  await writeFile(path.join(picked, 'Week', 'week-1.md'), '# Week 1', 'utf8');

  const previousKnowledgeRoot = process.env.LOOM_KNOWLEDGE_ROOT;
  const previousContentRoot = process.env.LOOM_CONTENT_ROOT;
  const previousUserDataRoot = process.env.LOOM_USER_DATA_ROOT;
  process.env.LOOM_KNOWLEDGE_ROOT = picked;
  process.env.LOOM_CONTENT_ROOT = picked;
  process.env.LOOM_USER_DATA_ROOT = path.join(tempRoot, 'user-data');
  t.after(() => {
    if (previousKnowledgeRoot === undefined) delete process.env.LOOM_KNOWLEDGE_ROOT;
    else process.env.LOOM_KNOWLEDGE_ROOT = previousKnowledgeRoot;
    if (previousContentRoot === undefined) delete process.env.LOOM_CONTENT_ROOT;
    else process.env.LOOM_CONTENT_ROOT = previousContentRoot;
    if (previousUserDataRoot === undefined) delete process.env.LOOM_USER_DATA_ROOT;
    else process.env.LOOM_USER_DATA_ROOT = previousUserDataRoot;
  });

  const { runIngest } = await importIngestModule();
  await runIngest();

  const navPath = path.join(picked, 'knowledge', '.cache', 'manifest', 'knowledge-nav.json');
  const nav = JSON.parse(await readFile(navPath, 'utf8')) as {
    knowledgeCategories: Array<{
      slug: string;
      label: string;
      count: number;
      subs: Array<{ label: string; count: number }>;
    }>;
    knowledgeTotal: number;
  };

  assert.equal(nav.knowledgeTotal, 3);
  assert.deepEqual(
    nav.knowledgeCategories.map((category) => ({
      slug: category.slug,
      label: category.label,
      count: category.count,
      subs: category.subs.map((sub) => sub.label),
    })),
    [
      {
        slug: 'infs-3822',
        label: 'INFS 3822',
        count: 3,
        subs: ['', 'Assessment', 'Week'],
      },
    ],
  );
});
