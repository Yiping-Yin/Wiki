import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadCachedHomeDocs,
  resetHomeWorkbenchDataCache,
  type HomeIndexDoc,
} from '../components/home/useHomeWorkbenchData';

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
