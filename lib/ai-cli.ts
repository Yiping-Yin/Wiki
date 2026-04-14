'use client';

export type AiCliKind = 'claude' | 'codex';

export const AI_CLI_STORAGE_KEY = 'loom:ai-cli';

export function normalizeAiCli(value: unknown): AiCliKind {
  return value === 'claude' ? 'claude' : 'codex';
}

export function readAiCliPreference(): AiCliKind {
  if (typeof window === 'undefined') return 'claude';
  try {
    return normalizeAiCli(localStorage.getItem(AI_CLI_STORAGE_KEY));
  } catch {
    return 'claude';
  }
}

export function writeAiCliPreference(cli: AiCliKind) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AI_CLI_STORAGE_KEY, cli);
  } catch {}
}
