import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  loadCachedHomeDocs,
  resetHomeWorkbenchDataCache,
  type HomeIndexDoc,
} from '../components/home/useHomeWorkbenchData';

const repoRoot = path.resolve(__dirname, '..');

test('home data hook owns async loading while the model stays pure', () => {
  const hookSource = fs.readFileSync(path.join(repoRoot, 'components/home/useHomeWorkbenchData.ts'), 'utf8');
  const modelSource = fs.readFileSync(path.join(repoRoot, 'components/home/homeWorkbenchModel.ts'), 'utf8');

  assert.match(hookSource, /export async function loadHomeDocs/);
  assert.match(hookSource, /fetch\('\/api\/search-index'\)/);
  assert.doesNotMatch(modelSource, /export async function loadHomeDocs/);
  assert.doesNotMatch(modelSource, /fetch\('\/api\/search-index'\)/);
});

test('loadCachedHomeDocs caches loader results until reset', async () => {
  resetHomeWorkbenchDataCache();

  let calls = 0;
  const loader = async (): Promise<HomeIndexDoc[]> => {
    calls += 1;
    return [
      { id: 'rope', title: 'RoPE', href: '/wiki/rope', category: 'Architecture' },
    ];
  };

  const first = await loadCachedHomeDocs(loader);
  const second = await loadCachedHomeDocs(loader);

  assert.equal(calls, 1);
  assert.deepEqual(first, second);

  resetHomeWorkbenchDataCache();
  await loadCachedHomeDocs(loader);
  assert.equal(calls, 2);
});
