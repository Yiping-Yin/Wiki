import assert from 'node:assert/strict';
import test from 'node:test';

import { writeKnowledgeDocBody } from '../lib/knowledge-doc-write';

test('writeKnowledgeDocBody writes the source file and reruns ingest', async () => {
  const calls: string[] = [];
  let filePath = '';
  let fileBody = '';

  const result = await writeKnowledgeDocBody({
    docId: 'know-demo',
    body: '# Organized\n\n## Core idea\n\nStructured body.',
    loadDocs: async () =>
      [
        {
          id: 'know-demo',
          title: 'Demo',
          category: 'Demo',
          categorySlug: 'demo',
          fileSlug: 'demo',
          sourcePath: 'Demo/demo.md',
          ext: '.md',
          preview: '',
          size: 0,
          hasText: true,
        },
      ] as any,
    writeFile: async (candidate, content) => {
      filePath = String(candidate);
      fileBody = String(content);
      calls.push('write');
    },
    readBody: async () => ({
      id: 'know-demo',
      title: 'Demo',
      body: '<!-- loom:capture-doc -->\n# Demo\n',
    }),
    ingest: async () => {
      calls.push('ingest');
    },
  });

  assert.match(filePath, /Demo\/demo\.md$/);
  assert.match(fileBody, /## Core idea/);
  assert.deepEqual(calls, ['write', 'ingest']);
  assert.equal(result.href, '/knowledge/demo/demo');
});

test('writeKnowledgeDocBody rejects non-placeholder source docs', async () => {
  await assert.rejects(
    () =>
      writeKnowledgeDocBody({
        docId: 'know-demo',
        body: '# Organized\n\nReal content',
        loadDocs: async () =>
          [
            {
              id: 'know-demo',
              title: 'Demo',
              category: 'Demo',
              categorySlug: 'demo',
              fileSlug: 'demo',
              sourcePath: 'Demo/demo.md',
              ext: '.md',
              preview: '',
              size: 0,
              hasText: true,
            },
          ] as any,
        readBody: async () => ({
          id: 'know-demo',
          title: 'Demo',
          body: '# Existing imported markdown\n\nHands-written source',
        }),
      }),
    /not a Loom-owned empty capture doc/i,
  );
});
