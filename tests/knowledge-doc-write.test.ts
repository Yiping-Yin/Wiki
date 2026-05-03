import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { writeKnowledgeDocBody } from '../lib/knowledge-doc-write';

test('writeKnowledgeDocBody writes Loom-owned user-data files and reruns ingest', async () => {
  const previousUserDataRoot = process.env.LOOM_USER_DATA_ROOT;
  const userDataRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-doc-write-user-data-'));
  const calls: string[] = [];
  let filePath = '';
  let fileBody = '';
  let ingestArg: unknown;
  const sourcePath = path.join(userDataRoot, 'knowledge', 'uploads', 'demo.md');

  process.env.LOOM_USER_DATA_ROOT = userDataRoot;
  try {
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
            sourcePath,
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
      ingest: async (arg) => {
        ingestArg = arg;
        calls.push('ingest');
      },
    });

    assert.equal(filePath, sourcePath);
    assert.match(fileBody, /## Core idea/);
    assert.deepEqual(calls, ['write', 'ingest']);
    assert.deepEqual(ingestArg, { cwd: process.cwd() });
    assert.equal(result.href, '/knowledge/demo/demo');
  } finally {
    if (previousUserDataRoot === undefined) delete process.env.LOOM_USER_DATA_ROOT;
    else process.env.LOOM_USER_DATA_ROOT = previousUserDataRoot;
  }
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

test('writeKnowledgeDocBody refuses to mutate source-library files', async () => {
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
          body: '<!-- loom:capture-doc -->\n# Demo\n',
        }),
      }),
    /will not write into source library files/i,
  );
});
