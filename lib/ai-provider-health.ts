/**
 * Shim that preserves the public shape consumers (ChatFocus, FreeInput,
 * EmptyDocCaptureSurface) expect — but strips all the CLI-specific
 * probe/issue-classification logic now that AI routes through the Swift
 * bridge per user's chosen provider.
 *
 * Runtime errors still flow through `formatAiRuntimeErrorMessage` →
 * `resolveAiNotice`; the formatter now just echoes the raw message and
 * appends a Settings hint when no more specific guidance is available.
 */

import type { AiCliKind } from './ai-cli';

export type CliIssueCode =
  | 'auth'
  | 'spawn'
  | 'timeout'
  | 'transport'
  | 'session-permission'
  | 'unknown';

export type CliHealth = {
  cli: AiCliKind;
  ok: boolean;
  code: 'ok' | CliIssueCode;
  summary: string;
  action: string;
  checkedAt: number;
};

export type AiAvailability = {
  selected: CliHealth | null;
  alternate: CliHealth | null;
  effectiveCli: AiCliKind | null;
  canSend: boolean;
  notice: string | null;
  tone: 'muted' | 'error' | 'accent' | null;
};

export type AiNoticeAction = {
  kind: 'open-settings';
  label: 'Open Settings';
};

export type AiNotice = {
  message: string | null;
  action: AiNoticeAction | null;
};

/**
 * Format a raw runtime error into a user-readable message. Retains the
 * "Open Settings" hint so `resolveAiNotice` can surface the settings
 * action when the error looks credential-related.
 */
export function formatAiRuntimeErrorMessage(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return 'AI unavailable — Open Settings to check provider status, then retry.';
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('api key') || lower.includes('not authenticated') || lower.includes('unauthorized')) {
    return `${trimmed} Open Settings (⌘,) to add your key.`;
  }
  return trimmed;
}

export function resolveAiNotice(message: string | null | undefined): AiNotice {
  if (!message) {
    return { message: null, action: null };
  }
  return {
    message,
    action: /open settings/i.test(message)
      ? { kind: 'open-settings', label: 'Open Settings' }
      : null,
  };
}
