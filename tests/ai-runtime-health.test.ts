import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CODEX_HEALTH_TIMEOUT_MS,
  TIMEOUT_CACHE_TTL_MS,
  clearLocalRuntimeHealthCache,
  markLocalRuntimeHealthy,
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

test('timeout probe results expire on a shorter cache window', async () => {
  clearLocalRuntimeHealthCache();
  const originalNow = Date.now;
  let now = 1_000;
  let calls = 0;

  Date.now = () => now;

  try {
    const first = await probeLocalRuntime('codex', {
      runCliImpl: async () => {
        calls += 1;
        throw new Error('codex CLI timed out after 15000ms');
      },
    });

    assert.equal(first.ok, false);
    assert.equal(first.code, 'timeout');
    assert.equal(calls, 1);

    now += TIMEOUT_CACHE_TTL_MS + 1;

    const second = await probeLocalRuntime('codex', {
      runCliImpl: async () => {
        calls += 1;
        return 'ok';
      },
    });

    assert.equal(calls, 2);
    assert.equal(second.ok, true);
    assert.equal(second.code, 'ok');
  } finally {
    Date.now = originalNow;
    clearLocalRuntimeHealthCache();
  }
});

test('successful runtime use overrides a cached timeout result immediately', async () => {
  clearLocalRuntimeHealthCache();

  await probeLocalRuntime('codex', {
    runCliImpl: async () => {
      throw new Error('codex CLI timed out after 15000ms');
    },
  });

  markLocalRuntimeHealthy('codex');

  let invoked = false;
  const result = await probeLocalRuntime('codex', {
    runCliImpl: async () => {
      invoked = true;
      throw new Error('should not re-probe while cached healthy');
    },
  });

  assert.equal(invoked, false);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'ok');
});
