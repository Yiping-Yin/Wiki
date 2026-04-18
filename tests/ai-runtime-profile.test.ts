import assert from 'node:assert/strict';
import test from 'node:test';

import { getRuntimeInvocationProfile } from '../lib/ai-runtime/profile';

test('clarify passage uses a lighter codex profile', () => {
  const profile = getRuntimeInvocationProfile('clarify-passage');
  assert.equal(profile.timeoutMs, 20_000);
  assert.equal(profile.model, 'gpt-5.4-mini');
  assert.deepEqual(profile.codexConfigOverrides, ['model_reasoning_effort="low"']);
});

test('commit anchor keeps a bounded but slightly denser mini profile', () => {
  const profile = getRuntimeInvocationProfile('commit-anchor');
  assert.equal(profile.timeoutMs, 45_000);
  assert.equal(profile.model, 'gpt-5.4-mini');
  assert.deepEqual(profile.codexConfigOverrides, ['model_reasoning_effort="medium"']);
});
