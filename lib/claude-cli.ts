/**
 * Server-side wrapper around local CLI binaries (claude or codex).
 * No API key required — uses the user's existing CLI login.
 *
 *   await runCli('write a haiku', { cli: 'claude' });
 *   await runCli('write a haiku', { cli: 'codex' });
 *
 * Resolves with stdout (trimmed). Rejects on non-zero exit or timeout.
 */
import { spawn } from 'node:child_process';

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? '/Users/yinyiping/.local/bin/claude';
const CODEX_BIN  = process.env.CODEX_BIN  ?? '/opt/homebrew/bin/codex';
const DEFAULT_TIMEOUT_MS = 180000;

export type CliKind = 'claude' | 'codex';

export async function runCli(prompt: string, opts: {
  cli?: CliKind;
  timeoutMs?: number;
  model?: string;
} = {}): Promise<string> {
  const cli: CliKind = opts.cli === 'codex' ? 'codex' : 'claude';
  let bin: string;
  let args: string[];
  if (cli === 'claude') {
    bin = CLAUDE_BIN;
    args = ['-p', prompt, '--output-format', 'text'];
    if (opts.model) args.push('--model', opts.model);
  } else {
    bin = CODEX_BIN;
    args = ['exec', prompt];
    if (opts.model) args.push('--model', opts.model);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`${cli} CLI timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`));
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${cli} CLI exited ${code}: ${err.slice(0, 500)}`));
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`failed to spawn ${cli} CLI: ${e.message}`));
    });
  });
}

/** Backward-compat alias — defaults to claude. */
export const runClaude = (prompt: string, opts: { timeoutMs?: number; model?: string } = {}) =>
  runCli(prompt, { cli: 'claude', ...opts });

/** Read CLI preference from request body field `cli` or fall back to claude. */
export function pickCli(body: any): CliKind {
  const v = body?.cli ?? body?.model;
  return v === 'codex' ? 'codex' : 'claude';
}
