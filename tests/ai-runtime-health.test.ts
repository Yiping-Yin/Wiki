import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODEX_HEALTH_TIMEOUT_MS,
  clearLocalRuntimeHealthCache,
  probeLocalRuntime,
  probeLocalRuntimesInOrder,
  probePreferredLocalRuntimes,
} from '../lib/ai-runtime/health';

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
  assert.equal(CODEX_HEALTH_TIMEOUT_MS >= 10000, true);
  assert.equal(CODEX_HEALTH_TIMEOUT_MS <= 15000, true);
});

test('preferred runtime probing stops after a healthy preferred provider', async () => {
  const seen: string[] = [];
  const result = await probePreferredLocalRuntimes('codex', async (cli) => {
    seen.push(cli);
    return {
      cli,
      ok: true,
      code: 'ok',
      summary: `${cli} checked`,
      action: '',
      checkedAt: Date.now(),
    };
  });

  assert.deepEqual(seen, ['codex']);
  assert.deepEqual(result.map((entry) => entry.cli), ['codex']);
});

test('preferred runtime probing falls through to alternate only when needed', async () => {
  const seen: string[] = [];
  const result = await probePreferredLocalRuntimes('claude', async (cli) => {
    seen.push(cli);
    return {
      cli,
      ok: cli === 'codex',
      code: cli === 'codex' ? 'ok' : 'auth',
      summary: `${cli} checked`,
      action: '',
      checkedAt: Date.now(),
    };
  });

  assert.deepEqual(seen, ['claude', 'codex']);
  assert.deepEqual(result.map((entry) => entry.cli), ['claude', 'codex']);
});

test('probeLocalRuntime does not short-circuit to ok from earlier success state', async () => {
  clearLocalRuntimeHealthCache();

  const result = await probeLocalRuntime('codex', {
    runCliImpl: async () => {
      throw new Error('codex CLI timed out after 15000ms');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'timeout');
});
