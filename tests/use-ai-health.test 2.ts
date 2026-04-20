import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('useAiHealth falls back from long-running health checks to a soft timeout provider state', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'lib/use-ai-health.ts'), 'utf8');

  assert.match(source, /const HEALTH_SOFT_TIMEOUT_MS = \d+_/);
  assert.match(source, /function buildSoftTimeoutProvider\(cli: AiCliKind\): CliHealth/);
  assert.match(source, /setProviders\(\(current\) => current \?\? \[buildSoftTimeoutProvider\(preferredCli\)\]\);/);
  assert.match(source, /setLoading\(false\);/);
});
