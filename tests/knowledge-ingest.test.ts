import assert from 'node:assert/strict';
import test from 'node:test';

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
