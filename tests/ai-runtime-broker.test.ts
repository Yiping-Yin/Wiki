import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRuntimeFailure,
  isRecoverableFailure,
  pickExecutionPlan,
  resolveBrokerResult,
  shouldFallback,
} from '../lib/ai-runtime/broker';

test('codex is the default first runtime', () => {
  const plan = pickExecutionPlan({ preferred: null });
  assert.deepEqual(plan.order, ['codex', 'claude']);
});

test('preferred claude becomes the first runtime', () => {
  const plan = pickExecutionPlan({ preferred: 'claude' });
  assert.deepEqual(plan.order, ['claude', 'codex']);
});

test('recoverable codex failure falls back to claude', () => {
  const failure = classifyRuntimeFailure('codex', 'permission denied');
  assert.equal(isRecoverableFailure(failure), true);
  assert.equal(shouldFallback('codex', 'permission denied'), true);

  const result = resolveBrokerResult({
    preferred: 'codex',
    firstFailure: failure,
    fallbackSuccess: 'ok from claude',
  });
  assert.equal(result.runtime, 'claude');
  assert.equal(result.fellBack, true);
  assert.equal(result.text, 'ok from claude');
});

test('non-recoverable failure does not fall back', () => {
  const failure = classifyRuntimeFailure('claude', 'ENOENT');
  assert.equal(isRecoverableFailure(failure), false);
  assert.equal(shouldFallback('claude', 'ENOENT'), false);

  const result = resolveBrokerResult({
    preferred: 'claude',
    firstFailure: failure,
  });
  assert.equal(result.runtime, null);
  assert.equal(result.fellBack, false);
  assert.match(result.userMessage, /not available|settings/i);
});
