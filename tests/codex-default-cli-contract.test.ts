import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string) {
  return readFileSync(path, 'utf8');
}

test('environment example defaults the local AI CLI to codex', () => {
  const text = source('.env.example');

  assert.match(text, /^LOOM_AI_CLI_DEFAULT=codex$/m);
  assert.doesNotMatch(text, /^LOOM_AI_CLI_DEFAULT=(?!codex$).+$/m);
});

test('research scripts default to codex when no --cli flag is passed', () => {
  assert.match(source('scripts/research.ts'), /let cli: CLI = 'codex';/);
  assert.match(source('scripts/research-batch.ts'), /flag\('cli', 'codex'\)/);
});

test('smoke and e2e harnesses use codex as the default CLI', () => {
  assert.match(source('scripts/smoke.mjs'), /cli:\s*'codex'/);
  assert.match(
    source('scripts/phase6-e2e-smoke.py'),
    /DEFAULT_AI_COMMAND = "codex exec --skip-git-repo-check --ephemeral --color never"/,
  );
});

test('native CLI wrapper defaults to codex flavor', () => {
  assert.match(
    source('macos-app/Loom/Sources/CLIRuntimeClient.swift'),
    /var flavor: Flavor = \.codex/,
  );
});
