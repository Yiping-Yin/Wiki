/**
 * Server-side wrapper around the local `claude` CLI binary
 * (Claude Code in non-interactive print mode).
 *
 * Avoids requiring an ANTHROPIC_API_KEY — uses the user's existing
 * Claude Code login.
 *
 *   const text = await runClaude("write a haiku");
 *
 * Resolves with stdout (trimmed). Rejects on non-zero exit or timeout.
 */
import { spawn } from 'node:child_process';

const DEFAULT_BIN = process.env.CLAUDE_BIN ?? '/Users/yinyiping/.local/bin/claude';
const DEFAULT_MODEL = process.env.CLAUDE_MODEL ?? '';   // empty = let CLI pick default
const DEFAULT_TIMEOUT_MS = 180000;

export async function runClaude(prompt: string, opts: {
  model?: string;
  timeoutMs?: number;
} = {}): Promise<string> {
  const args = ['-p', prompt, '--output-format', 'text'];
  if (opts.model || DEFAULT_MODEL) args.push('--model', opts.model || DEFAULT_MODEL);

  return new Promise((resolve, reject) => {
    const proc = spawn(DEFAULT_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1' },
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`claude CLI timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`));
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 500)}`));
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`failed to spawn claude CLI: ${e.message}`));
    });
  });
}
