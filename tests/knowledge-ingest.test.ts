import assert from 'node:assert/strict';
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
