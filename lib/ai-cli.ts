'use client';

export type AiCliKind = 'codex';

export const AI_CLI_STORAGE_KEY = 'loom:ai-cli';
export const AI_CLI_CHANGE_EVENT = 'loom:ai-cli-change';
export const AI_CLI_MIGRATION_KEY = 'loom:ai-cli:migrated-to-codex-v1';

export function normalizeAiCli(_value: unknown): AiCliKind {
  return 'codex';
}

export function readAiCliPreference(): AiCliKind {
  if (typeof window === 'undefined') return 'codex';
  try {
    const current = localStorage.getItem(AI_CLI_STORAGE_KEY);
    if (current !== 'codex') {
      localStorage.setItem(AI_CLI_STORAGE_KEY, 'codex');
    }
    localStorage.setItem(AI_CLI_MIGRATION_KEY, '1');
    return 'codex';
  } catch {
    return 'codex';
  }
}

export function writeAiCliPreference(cli: AiCliKind = 'codex') {
  if (typeof window === 'undefined') return;
  try {
    const next = normalizeAiCli(cli);
    localStorage.setItem(AI_CLI_STORAGE_KEY, next);
    localStorage.setItem(AI_CLI_MIGRATION_KEY, '1');
    window.dispatchEvent(new CustomEvent(AI_CLI_CHANGE_EVENT, { detail: { cli: next } }));
  } catch {}
}
