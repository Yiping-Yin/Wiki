import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveAiAvailability,
  describeCliIssue,
  formatAiRuntimeErrorMessage,
  resolveAiNotice,
  type CliHealth,
} from '../lib/ai-provider-health';
import { shouldFallback } from '../lib/ai-runtime/broker';
import { buildCliEnv } from '../lib/claude-cli';

test('buildCliEnv preserves CODEX_HOME instead of replacing it with a temp directory', () => {
  const env = buildCliEnv({
    CODEX_HOME: '/Users/example/.codex',
    PATH: '/usr/bin:/bin',
  });

  assert.equal(env.CODEX_HOME, '/Users/example/.codex');
  assert.equal(env.NO_COLOR, '1');
});

test('buildCliEnv does not invent CODEX_HOME when none is configured', () => {
  const env = buildCliEnv({ PATH: '/usr/bin:/bin' });

  assert.equal('CODEX_HOME' in env, false);
  assert.equal(env.NO_COLOR, '1');
});

test('shouldFallback treats codex session permission failures as recoverable', () => {
  const detail = 'Codex cannot access session files at /Users/me/.codex/sessions (permission denied).';

  assert.equal(shouldFallback('codex', detail), true);
});

test('describeCliIssue classifies codex session permission failures with actionable guidance', () => {
  const issue = describeCliIssue(
    'codex',
    'Codex cannot access session files at /Users/me/.codex/sessions (permission denied).',
  );

  assert.equal(issue.code, 'session-permission');
  assert.match(issue.summary, /cannot access .*\.codex/i);
  assert.match(issue.action, /permissions|switch provider/i);
});

test('describeCliIssue classifies authentication failures with sign-in guidance', () => {
  const issue = describeCliIssue(
    'claude',
    'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
  );

  assert.equal(issue.code, 'auth');
  assert.match(issue.summary, /not authenticated|authentication/i);
  assert.match(issue.action, /sign in/i);
});

test('formatAiRuntimeErrorMessage collapses dual-provider auth failures into one actionable message', () => {
  const message = formatAiRuntimeErrorMessage(
    'codex CLI is not authenticated, and fallback to claude also failed: Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid authentication credentials"}}',
  );

  assert.match(message, /codex and claude/i);
  assert.match(message, /settings|sign in/i);
});

test('route-facing formatter preserves auth guidance', () => {
  const message = formatAiRuntimeErrorMessage(
    'Claude CLI is not authenticated. Open Settings and sign in to Claude CLI, or switch to the other provider.',
  );

  assert.match(message, /not authenticated/i);
  assert.match(message, /settings/i);
});

test('deriveAiAvailability switches to alternate provider when preferred provider is unavailable', () => {
  const providers: CliHealth[] = [
    {
      cli: 'codex',
      ok: false,
      code: 'session-permission',
      summary: 'Codex CLI cannot access ~/.codex session files.',
      action: 'Fix ~/.codex permissions or switch to Claude in Settings.',
      checkedAt: Date.now(),
    },
    {
      cli: 'claude',
      ok: true,
      code: 'ok',
      summary: 'Claude CLI is available.',
      action: '',
      checkedAt: Date.now(),
    },
  ];

  const availability = deriveAiAvailability('codex', providers);

  assert.equal(availability.canSend, true);
  assert.equal(availability.effectiveCli, 'claude');
  assert.match(availability.notice ?? '', /codex cli unavailable/i);
  assert.match(availability.notice ?? '', /claude cli/i);
});

test('deriveAiAvailability blocks send when both providers are unavailable', () => {
  const providers: CliHealth[] = [
    {
      cli: 'codex',
      ok: false,
      code: 'auth',
      summary: 'Codex CLI is not authenticated.',
      action: 'Open Settings and sign in to Codex CLI, or switch to the other provider.',
      checkedAt: Date.now(),
    },
    {
      cli: 'claude',
      ok: false,
      code: 'auth',
      summary: 'Claude CLI is not authenticated.',
      action: 'Open Settings and sign in to Claude CLI, or switch to the other provider.',
      checkedAt: Date.now(),
    },
  ];

  const availability = deriveAiAvailability('codex', providers);

  assert.equal(availability.canSend, false);
  assert.equal(availability.effectiveCli, null);
  assert.match(availability.notice ?? '', /not authenticated/i);
});

test('resolveAiNotice exposes an Open Settings action for provider auth guidance', () => {
  const notice = resolveAiNotice(
    'AI unavailable — Codex and Claude are not authenticated. Open Settings, sign in to one provider, then retry.',
  );

  assert.equal(notice.message, 'AI unavailable — Codex and Claude are not authenticated. Open Settings, sign in to one provider, then retry.');
  assert.deepEqual(notice.action, {
    kind: 'open-settings',
    label: 'Open Settings',
  });
});

test('resolveAiNotice leaves unrelated notices actionless', () => {
  const notice = resolveAiNotice('Claude CLI unavailable. Loom will use Codex CLI for now.');

  assert.equal(notice.message, 'Claude CLI unavailable. Loom will use Codex CLI for now.');
  assert.equal(notice.action, null);
});
