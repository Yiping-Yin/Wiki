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

async function withTempRepo(t: test.TestContext, fn: () => Promise<void>) {
  const previousCwd = process.cwd();
  const previousContentRoot = process.env.LOOM_CONTENT_ROOT;
  const root = await mkdtemp(path.join(os.tmpdir(), 'source-library-api-'));
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
  process.env.LOOM_CONTENT_ROOT = root;
  t.after(() => {
    process.chdir(previousCwd);
    if (previousContentRoot === undefined) {
      delete process.env.LOOM_CONTENT_ROOT;
    } else {
      process.env.LOOM_CONTENT_ROOT = previousContentRoot;
    }
  });

  await fn();
}

test('groups route exposes fallback group and full CRUD against source-library categories only', async (t) => {
  await withTempRepo(t, async () => {
    const groupsRoute = await repoImport('app/api/source-library/groups/route.ts');

    const initialResponse = await groupsRoute.GET();
    assert.equal(initialResponse.status, 200);
    assert.deepEqual(await initialResponse.json(), {
      groups: [
        {
          id: 'ungrouped',
          label: 'Ungrouped',
          order: 9999,
          count: 2,
          categories: ['alpha', 'beta'],
        },
      ],
    });

    const createdResponse = await groupsRoute.POST(
      new Request('http://localhost/api/source-library/groups', {
        method: 'POST',
        body: JSON.stringify({ label: 'Coursework' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(createdResponse.status, 200);
    const createdPayload = await createdResponse.json();
    const createdGroup = createdPayload.groups.find((group: { label: string }) => group.label === 'Coursework');
    assert.ok(createdGroup);

    const renamedResponse = await groupsRoute.PATCH(
      new Request('http://localhost/api/source-library/groups', {
        method: 'PATCH',
        body: JSON.stringify({ groupId: createdGroup.id, label: 'Semester' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(renamedResponse.status, 200);
    assert.equal(
      (await renamedResponse.json()).groups.find((group: { id: string }) => group.id === createdGroup.id)?.label,
      'Semester',
    );

    const deletedResponse = await groupsRoute.DELETE(
      new Request('http://localhost/api/source-library/groups', {
        method: 'DELETE',
        body: JSON.stringify({ groupId: createdGroup.id }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(deletedResponse.status, 200);
    assert.deepEqual(await deletedResponse.json(), {
      groups: [
        {
          id: 'ungrouped',
          label: 'Ungrouped',
          order: 9999,
          count: 2,
          categories: ['alpha', 'beta'],
        },
      ],
    });
  });
});

test('concurrent group writes preserve every created group', { concurrency: false }, async (t) => {
  await withTempRepo(t, async () => {
    const groupsRoute = await repoImport('app/api/source-library/groups/route.ts');
    const fsModule = await import('node:fs');
    const originalWriteFile = fsModule.promises.writeFile.bind(fsModule.promises);

    let releaseFirstWrite!: () => void;
    let releaseSecondWrite!: () => void;
    let writeCount = 0;
    let secondWriteStarted = false;

    fsModule.promises.writeFile = (async (...args: Parameters<typeof originalWriteFile>) => {
      writeCount += 1;
      if (writeCount === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstWrite = resolve;
        });
      } else if (writeCount === 2) {
        secondWriteStarted = true;
        await new Promise<void>((resolve) => {
          releaseSecondWrite = resolve;
        });
      }

      return originalWriteFile(...args);
    }) as typeof fsModule.promises.writeFile;

    t.after(() => {
      fsModule.promises.writeFile = originalWriteFile;
    });

    const firstCreate = groupsRoute.POST(
      new Request('http://localhost/api/source-library/groups', {
        method: 'POST',
        body: JSON.stringify({ label: 'Coursework' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const secondCreate = groupsRoute.POST(
      new Request('http://localhost/api/source-library/groups', {
        method: 'POST',
        body: JSON.stringify({ label: 'Research' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    await waitFor(() => writeCount > 0);
    for (let i = 0; i < 25 && !secondWriteStarted; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    if (secondWriteStarted) {
      releaseFirstWrite();
      releaseSecondWrite();
    } else {
      releaseFirstWrite();
      await waitFor(() => secondWriteStarted);
      releaseSecondWrite();
    }

    assert.equal((await firstCreate).status, 200);
    assert.equal((await secondCreate).status, 200);

    const finalGroupsResponse = await groupsRoute.GET();
    assert.equal(finalGroupsResponse.status, 200);
    const finalGroups = await finalGroupsResponse.json();
    assert.deepEqual(
      finalGroups.groups.map((group: { label: string }) => group.label).sort(),
      ['Coursework', 'Research', 'Ungrouped'],
    );
  });
});

test('knowledge nav route returns runtime kinds and metadata-backed sourceLibraryGroups', async (t) => {
  await withTempRepo(t, async () => {
    const metadataModule = await repoImport('lib/source-library-metadata.ts');
    const knowledgeNavRoute = await repoImport('app/api/knowledge-nav/route.ts');

    const courseGroup = await metadataModule.createSourceLibraryGroup('Coursework');
    await metadataModule.assignCategoryToGroup('beta', courseGroup.id);

    const response = await knowledgeNavRoute.GET();
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.deepEqual(
      payload.knowledgeCategories.map((category: { slug: string; kind: string }) => ({
        slug: category.slug,
        kind: category.kind,
      })),
      [
        { slug: 'alpha', kind: 'source' },
        { slug: 'beta', kind: 'source' },
        { slug: 'wiki-core', kind: 'wiki' },
      ],
    );
    assert.deepEqual(
      payload.sourceLibraryGroups.map((group: { id: string; categories: Array<{ slug: string }> }) => ({
        id: group.id,
        categories: group.categories.map((category) => category.slug),
      })),
      [
        { id: courseGroup.id, categories: ['beta'] },
        { id: 'ungrouped', categories: ['alpha'] },
      ],
    );
  });
});

test('membership route reassigns a raw-source category and rejects wiki or unknown categories', async (t) => {
  await withTempRepo(t, async () => {
    const groupsRoute = await repoImport('app/api/source-library/groups/route.ts');
    const membershipRoute = await repoImport('app/api/source-library/membership/route.ts');

    const createdResponse = await groupsRoute.POST(
      new Request('http://localhost/api/source-library/groups', {
        method: 'POST',
        body: JSON.stringify({ label: 'Coursework' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const createdGroup = (await createdResponse.json()).groups.find((group: { label: string }) => group.label === 'Coursework');

    const assignedResponse = await membershipRoute.PATCH(
      new Request('http://localhost/api/source-library/membership', {
        method: 'PATCH',
        body: JSON.stringify({ categorySlug: 'beta', groupId: createdGroup.id }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(assignedResponse.status, 200);
    assert.deepEqual(await assignedResponse.json(), {
      groups: [
        {
          id: createdGroup.id,
          label: 'Coursework',
          order: createdGroup.order,
          count: 1,
          categories: ['beta'],
        },
        {
          id: 'ungrouped',
          label: 'Ungrouped',
          order: 9999,
          count: 1,
          categories: ['alpha'],
        },
      ],
    });

    const missingCategoryResponse = await membershipRoute.PATCH(
      new Request('http://localhost/api/source-library/membership', {
        method: 'PATCH',
        body: JSON.stringify({ categorySlug: 'missing', groupId: createdGroup.id }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(missingCategoryResponse.status, 404);
    assert.deepEqual(await missingCategoryResponse.json(), { error: 'Unknown category slug' });

    const wikiCategoryResponse = await membershipRoute.PATCH(
      new Request('http://localhost/api/source-library/membership', {
        method: 'PATCH',
        body: JSON.stringify({ categorySlug: 'wiki-core', groupId: createdGroup.id }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(wikiCategoryResponse.status, 400);
    assert.deepEqual(await wikiCategoryResponse.json(), { error: 'Category is not a source-library category' });
  });
});

test('source-library routes reject malformed JSON and missing required fields with 400s', async (t) => {
  await withTempRepo(t, async () => {
    const groupsRoute = await repoImport('app/api/source-library/groups/route.ts');
    const membershipRoute = await repoImport('app/api/source-library/membership/route.ts');

    const invalidGroupsResponse = await groupsRoute.POST(
      new Request('http://localhost/api/source-library/groups', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(invalidGroupsResponse.status, 400);

    const missingMembershipFieldsResponse = await membershipRoute.PATCH(
      new Request('http://localhost/api/source-library/membership', {
        method: 'PATCH',
        body: JSON.stringify({ groupId: 'ungrouped' }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    assert.equal(missingMembershipFieldsResponse.status, 400);
  });
});
