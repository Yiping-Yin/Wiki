'use client';

export type AiCliKind = 'claude' | 'codex';

export const AI_CLI_STORAGE_KEY = 'loom:ai-cli';
export const AI_CLI_CHANGE_EVENT = 'loom:ai-cli-change';
export const AI_CLI_MIGRATION_KEY = 'loom:ai-cli:migrated-to-codex-v1';

export function normalizeAiCli(value: unknown): AiCliKind {
  return value === 'claude' ? 'claude' : 'codex';
}

export function readAiCliPreference(): AiCliKind {
  if (typeof window === 'undefined') return 'codex';
  try {
    const migrated = localStorage.getItem(AI_CLI_MIGRATION_KEY) === '1';
    const current = localStorage.getItem(AI_CLI_STORAGE_KEY);
    if (!migrated && current === 'claude') {
      localStorage.setItem(AI_CLI_STORAGE_KEY, 'codex');
      localStorage.setItem(AI_CLI_MIGRATION_KEY, '1');
      return 'codex';
    }
    if (!migrated) {
      localStorage.setItem(AI_CLI_MIGRATION_KEY, '1');
    }
    return normalizeAiCli(localStorage.getItem(AI_CLI_STORAGE_KEY));
  } catch {
    return 'codex';
  }
}

export function writeAiCliPreference(cli: AiCliKind) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AI_CLI_STORAGE_KEY, cli);
    localStorage.setItem(AI_CLI_MIGRATION_KEY, '1');
    window.dispatchEvent(new CustomEvent(AI_CLI_CHANGE_EVENT, { detail: { cli } }));
  } catch {}
}
