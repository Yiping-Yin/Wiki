import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

function repoImport(modulePath: string) {
  const absolutePath = path.join(__dirname, '..', modulePath);
  const href = pathToFileURL(absolutePath).href;
  return import(`${href}?t=${Date.now()}-${Math.random()}`);
}

async function waitFor(predicate: () => boolean, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for condition');
}

async function withTempRepo(t: test.TestContext, fn: (root: string) => Promise<void>) {
  const previousCwd = process.cwd();
  const root = await mkdtemp(path.join(os.tmpdir(), 'source-library-metadata-'));
  const manifestRoot = path.join(root, 'knowledge', '.cache', 'manifest');

  await mkdir(manifestRoot, { recursive: true });
  await writeFile(
    path.join(manifestRoot, 'knowledge-nav.json'),
    JSON.stringify(
      {
        knowledgeCategories: [
          { slug: 'alpha', label: 'Alpha', count: 2, subs: [] },
          { slug: 'beta', label: 'Beta', count: 1, subs: [] },
          { slug: 'wiki-core', label: 'LLM Wiki', count: 99, subs: [], kind: 'wiki' },
        ],
        knowledgeTotal: 102,
      },
      null,
      2,
    ),
    'utf8',
  );

  process.chdir(root);
  t.after(() => {
    process.chdir(previousCwd);
  });

  await fn(root);
}

test('source-library metadata persists groups, keeps Ungrouped fallback, and rehomes deleted memberships', async (t) => {
  await withTempRepo(t, async (root) => {
    const metadataModule = await repoImport('lib/source-library-metadata.ts');

    const created = await metadataModule.createSourceLibraryGroup('Coursework');
    assert.equal(created.label, 'Coursework');

    await metadataModule.assignCategoryToGroup('alpha', created.id);
    await metadataModule.renameSourceLibraryGroup(created.id, 'Semester');

    const renamedState = await metadataModule.readSourceLibraryMetadata();
    assert.deepEqual(
      renamedState.groups.map((group: { id: string; label: string }) => ({
        id: group.id,
        label: group.label,
      })),
      [
        { id: created.id, label: 'Semester' },
        { id: 'ungrouped', label: 'Ungrouped' },
      ],
    );
    assert.deepEqual(renamedState.memberships, [{ categorySlug: 'alpha', groupId: created.id, order: 9999 }]);

    await metadataModule.deleteSourceLibraryGroup(created.id);

    const deletedState = await metadataModule.readSourceLibraryMetadata();
    assert.deepEqual(deletedState.groups, [{ id: 'ungrouped', label: 'Ungrouped', order: 9999 }]);
    assert.deepEqual(deletedState.memberships, [{ categorySlug: 'alpha', groupId: 'ungrouped', order: 9999 }]);

    const rawMetadata = JSON.parse(
      await (await import('node:fs/promises')).readFile(
        path.join(root, 'knowledge', '.cache', 'manifest', 'source-library-groups.json'),
        'utf8',
      ),
    );
    assert.deepEqual(rawMetadata, deletedState);
  });
});

test('source-library metadata rejects malformed files instead of treating them as empty', async (t) => {
  await withTempRepo(t, async (root) => {
    const metadataPath = path.join(root, 'knowledge', '.cache', 'manifest', 'source-library-groups.json');
    await writeFile(metadataPath, '{"groups":[', 'utf8');

    const metadataModule = await repoImport('lib/source-library-metadata.ts');

    await assert.rejects(metadataModule.readSourceLibraryMetadata(), /source library metadata/i);
  });
});

test('source-library metadata writes never expose a truncated file to concurrent readers', async (t) => {
  await withTempRepo(t, async (root) => {
    const metadataModule = await repoImport('lib/source-library-metadata.ts');
    const fsModule = await import('node:fs');
    const originalWriteFile = fsModule.promises.writeFile.bind(fsModule.promises);
    const metadataPath = metadataModule.sourceLibraryMetadataPath();
    const initialMetadata = {
      groups: [
        { id: 'seed', label: 'Seed', order: 0 },
      ],
      memberships: [],
    };

    await writeFile(metadataPath, JSON.stringify(initialMetadata, null, 2), 'utf8');

    let releaseWrite!: () => void;
    let writeStarted = false;

    fsModule.promises.writeFile = (async (...args: Parameters<typeof originalWriteFile>) => {
      const [candidatePath, data] = args;
      const content = typeof data === 'string'
        ? data
        : ArrayBuffer.isView(data)
          ? Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8')
          : String(data);
      if (!writeStarted) {
        writeStarted = true;
        if (candidatePath === metadataPath) {
          await originalWriteFile(candidatePath, content.slice(0, Math.max(1, Math.floor(content.length / 2))), 'utf8');
        }

        await new Promise<void>((resolve) => {
          releaseWrite = resolve;
        });
      }

      return originalWriteFile(...args);
    }) as typeof fsModule.promises.writeFile;

    t.after(() => {
      fsModule.promises.writeFile = originalWriteFile;
    });

    const createPromise = metadataModule.createSourceLibraryGroup('Research');

    await waitFor(() => writeStarted);

    const duringWrite = await metadataModule.readSourceLibraryMetadata();
    assert.deepEqual(duringWrite.groups, [
      { id: 'seed', label: 'Seed', order: 0 },
      { id: 'ungrouped', label: 'Ungrouped', order: 9999 },
    ]);

    releaseWrite();

    const created = await createPromise;
    const finalState = await metadataModule.readSourceLibraryMetadata();
    assert.ok(finalState.groups.some((group: { id: string; label: string }) => group.id === created.id && group.label === 'Research'));
  });
});

test('knowledge-store returns grouped source-library categories only for raw sources and leaves wiki categories outside Atlas groups', async (t) => {
  await withTempRepo(t, async () => {
    const metadataModule = await repoImport('lib/source-library-metadata.ts');
    const storeModule = await repoImport('lib/knowledge-store.ts');

    const originalCategories = await storeModule.getKnowledgeCategories();
    const originalSnapshot = structuredClone(originalCategories);
    const sourceCategories = await storeModule.getSourceLibraryCategories();

    assert.deepEqual(sourceCategories.map((category: { slug: string }) => category.slug), ['alpha', 'beta']);
    assert.ok(
      originalCategories.every((category: { kind: string }) => category.kind === 'source' || category.kind === 'wiki'),
    );
    assert.deepEqual(
      originalCategories.map((category: { slug: string; kind: string }) => ({ slug: category.slug, kind: category.kind })),
      [
        { slug: 'alpha', kind: 'source' },
        { slug: 'beta', kind: 'source' },
        { slug: 'wiki-core', kind: 'wiki' },
      ],
    );

    const courseGroup = await metadataModule.createSourceLibraryGroup('Coursework');
    await metadataModule.assignCategoryToGroup('beta', courseGroup.id);

    const grouped = await storeModule.getSourceLibraryGroups();
    assert.deepEqual(
      grouped.map((group: { id: string; label: string; categories: Array<{ slug: string }> }) => ({
        id: group.id,
        label: group.label,
        categories: group.categories.map((category) => category.slug),
      })),
      [
        { id: courseGroup.id, label: 'Coursework', categories: ['beta'] },
        { id: 'ungrouped', label: 'Ungrouped', categories: ['alpha'] },
      ],
    );
    assert.ok(
      grouped.every((group: { categories: Array<{ slug: string }> }) =>
        group.categories.every((category) => category.slug !== 'wiki-core'),
      ),
    );

    assert.deepEqual(originalCategories, originalSnapshot);
  });
});

test('knowledge-store refreshes nav and manifest reads after the underlying files are rewritten', async (t) => {
  await withTempRepo(t, async (root) => {
    const storeModule = await repoImport('lib/knowledge-store.ts');
    const manifestRoot = path.join(root, 'knowledge', '.cache', 'manifest');
    const navPath = path.join(manifestRoot, 'knowledge-nav.json');
    const manifestPath = path.join(manifestRoot, 'knowledge-manifest.json');

    await writeFile(
      manifestPath,
      JSON.stringify([
        {
          id: 'alpha-doc',
          title: 'Alpha Doc',
          category: 'Alpha',
          categorySlug: 'alpha',
          fileSlug: 'alpha-doc',
          sourcePath: path.join(root, 'knowledge', 'alpha', 'alpha-doc.md'),
          ext: '.md',
          size: 12,
          hasText: true,
          preview: 'alpha',
        },
      ], null, 2),
      'utf8',
    );

    const firstNav = await storeModule.getKnowledgeNav();
    const firstDocs = await storeModule.getAllDocs();

    assert.deepEqual(firstNav.knowledgeCategories.map((category: { slug: string }) => category.slug), ['alpha', 'beta', 'wiki-core']);
    assert.deepEqual(firstDocs.map((doc: { id: string }) => doc.id), ['alpha-doc']);

    await writeFile(
      navPath,
      JSON.stringify(
        {
          knowledgeCategories: [
            { slug: 'gamma', label: 'Gamma', count: 4, subs: [] },
          ],
          knowledgeTotal: 4,
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(
      manifestPath,
      JSON.stringify([
        {
          id: 'gamma-doc',
          title: 'Gamma Doc',
          category: 'Gamma',
          categorySlug: 'gamma',
          fileSlug: 'gamma-doc',
          sourcePath: path.join(root, 'knowledge', 'gamma', 'gamma-doc.md'),
          ext: '.md',
          size: 13,
          hasText: true,
          preview: 'gamma',
        },
      ], null, 2),
      'utf8',
    );

    const secondNav = await storeModule.getKnowledgeNav();
    const secondDocs = await storeModule.getAllDocs();

    assert.deepEqual(secondNav.knowledgeCategories.map((category: { slug: string }) => category.slug), ['gamma']);
    assert.equal(secondNav.knowledgeTotal, 4);
    assert.deepEqual(secondDocs.map((doc: { id: string }) => doc.id), ['gamma-doc']);
  });
});
