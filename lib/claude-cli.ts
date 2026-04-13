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
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CLAUDE_BIN, CODEX_BIN, DEFAULT_CLI, type CliKind } from './server-config';

const DEFAULT_TIMEOUT_MS = 180000;

export async function runCli(prompt: string, opts: {
  cli?: CliKind;
  timeoutMs?: number;
  model?: string;
  allowFallback?: boolean;
  onChunk?: (chunk: string) => void;
} = {}): Promise<string> {
  const cli: CliKind = opts.cli === 'claude' || opts.cli === 'codex' ? opts.cli : DEFAULT_CLI;
  let bin: string;
  let args: string[];
  let tempDir: string | null = null;
  let codexOutputPath: string | null = null;
  const streamClaude = !!opts.onChunk && cli === 'claude';
  if (cli === 'claude') {
    bin = CLAUDE_BIN;
    args = ['-p', prompt, '--output-format', streamClaude ? 'stream-json' : 'text'];
    if (streamClaude) {
      args.push('--verbose', '--include-partial-messages');
    }
    if (opts.model) args.push('--model', opts.model);
  } else {
    tempDir = await mkdtemp(path.join(tmpdir(), 'loom-codex-'));
    codexOutputPath = path.join(tempDir, 'last-message.txt');
    bin = CODEX_BIN;
    args = [
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--color',
      'never',
      '-o',
      codexOutputPath,
      prompt,
    ];
    if (opts.model) args.push('--model', opts.model);
  }

  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
    if (cli === 'codex' && tempDir) env.CODEX_HOME = tempDir;
    const proc = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let out = '';
    let err = '';
    let streamBuffer = '';
    let streamedText = '';

    const emitChunk = (chunk: string) => {
      if (!chunk) return;
      streamedText += chunk;
      try { opts.onChunk?.(chunk); } catch {}
    };

    const flushClaudeStreamLines = () => {
      while (true) {
        const newline = streamBuffer.indexOf('\n');
        if (newline < 0) break;
        const line = streamBuffer.slice(0, newline).trim();
        streamBuffer = streamBuffer.slice(newline + 1);
        if (!line) continue;
        const chunk = parseClaudeStreamChunk(line, streamedText);
        if (chunk) emitChunk(chunk);
      }
    };

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`${cli} CLI timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`));
    }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    proc.stdout.on('data', (d) => {
      const text = d.toString();
      out += text;
      if (streamClaude) {
        streamBuffer += text;
        flushClaudeStreamLines();
      }
    });
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', async (code) => {
      clearTimeout(timer);
      try {
        if (code === 0) {
          if (streamClaude) {
            if (streamBuffer.trim()) {
              const chunk = parseClaudeStreamChunk(streamBuffer.trim(), streamedText);
              if (chunk) emitChunk(chunk);
            }
            resolve(streamedText.trim());
            return;
          }
          if (codexOutputPath) {
            try {
              const finalMessage = (await readFile(codexOutputPath, 'utf-8')).trim();
              resolve(finalMessage || out.trim());
              return;
            } finally {
              if (tempDir) {
                await rm(tempDir, { recursive: true, force: true }).catch(() => {});
              }
            }
          }
          resolve(out.trim());
          return;
        }
        const detail = (err || out).slice(0, 500);
        if ((opts.allowFallback ?? true) && isAuthFailure(detail)) {
          const fallbackCli = otherCli(cli);
          try {
            const fallback = await runCli(prompt, { ...opts, cli: fallbackCli, allowFallback: false });
            resolve(fallback);
            return;
          } catch (fallbackError: any) {
            reject(new Error(explainCliFailure(cli, detail, fallbackCli, fallbackError.message)));
            return;
          }
        }
        reject(new Error(explainCliFailure(cli, detail)));
      } catch (e: any) {
        reject(new Error(`failed to read ${cli} output: ${e.message}`));
      } finally {
        if (tempDir) {
          await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
      }
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

/** Read CLI preference from request body field `cli` or fall back to default. */
export function pickCli(body: any): CliKind {
  const v = body?.cli ?? body?.model;
  return v === 'claude' || v === 'codex' ? v : DEFAULT_CLI;
}

export function otherCli(cli: CliKind): CliKind {
  return cli === 'claude' ? 'codex' : 'claude';
}

export function isAuthFailure(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('failed to authenticate')
    || lower.includes('authentication_error')
    || lower.includes('invalid authentication credentials')
    || lower.includes('invalid_token')
    || lower.includes('missing or invalid access token')
    || lower.includes('authrequired');
}

export function explainCliFailure(cli: CliKind, detail: string, fallbackCli?: CliKind, fallbackDetail?: string): string {
  if (isAuthFailure(detail)) {
    if (fallbackCli && fallbackDetail) {
      return `${cli} CLI is not authenticated, and fallback to ${fallbackCli} also failed: ${fallbackDetail.slice(0, 220)}`;
    }
    return `${cli} CLI is not authenticated. Sign in to ${cli}, or switch provider in Settings.`;
  }
  return `${cli} CLI failed: ${detail}`;
}

function parseClaudeStreamChunk(line: string, streamedText: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(line);
  } catch {
    return '';
  }

  const deltaText = parsed?.event?.delta?.text;
  if (typeof deltaText === 'string' && deltaText) {
    return deltaText;
  }

  if (!streamedText && parsed?.type === 'assistant') {
    const text = parsed?.message?.content
      ?.filter((block: any) => block?.type === 'text')
      .map((block: any) => block.text)
      .join('') ?? '';
    return typeof text === 'string' ? text : '';
  }

  if (!streamedText && parsed?.type === 'result' && typeof parsed?.result === 'string') {
    return parsed.result;
  }

  return '';
}
