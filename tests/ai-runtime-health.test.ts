import assert from 'node:assert/strict';
import test from 'node:test';

import { CODEX_HEALTH_TIMEOUT_MS, probeLocalRuntimesInOrder } from '../lib/ai-runtime/health';

test('probeLocalRuntimesInOrder runs runtime checks sequentially in fixed order', async () => {
  const starts: string[] = [];
  const finishes: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const result = await probeLocalRuntimesInOrder(async (cli) => {
    starts.push(cli);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);

    await new Promise((resolve) => setTimeout(resolve, cli === 'codex' ? 20 : 0));

    finishes.push(cli);
    inFlight -= 1;

    return {
      cli,
      ok: cli === 'codex',
      code: cli === 'codex' ? 'ok' : 'auth',
      summary: `${cli} checked`,
      action: '',
      checkedAt: Date.now(),
    };
  });

  assert.equal(maxInFlight, 1);
  assert.deepEqual(starts, ['codex', 'claude']);
  assert.deepEqual(finishes, ['codex', 'claude']);
  assert.deepEqual(
    result.map((entry) => entry.cli),
    ['codex', 'claude'],
  );
});

test('codex health timeout is longer than the generic fast-fail window', () => {
  assert.equal(CODEX_HEALTH_TIMEOUT_MS >= 45000, true);
});
