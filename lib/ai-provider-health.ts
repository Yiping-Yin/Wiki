import type { AiCliKind } from './ai-cli';
import type { CliKind } from './server-config';
import type { RuntimeCode } from './ai-runtime/types';

export type CliIssueCode = RuntimeCode;

export type CliIssue = {
  cli: CliKind;
  code: CliIssueCode;
  summary: string;
  action: string;
  detail: string;
};

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

function cliLabel(cli: CliKind): string {
  return cli === 'claude' ? 'Claude CLI' : 'Codex CLI';
}

function includesAny(lower: string, needles: string[]) {
  return needles.some((needle) => lower.includes(needle));
}

export function detectCliIssueCode(cli: CliKind, detail: string): CliIssueCode {
  const lower = detail.toLowerCase();

  if (includesAny(lower, [
    'authentication_error',
    'failed to authenticate',
    'is not authenticated',
    'invalid authentication credentials',
    'invalid_token',
    'missing or invalid access token',
    'missing bearer or basic authentication',
    'unauthorized',
    'authrequired',
  ])) {
    return 'auth';
  }

  if (
    cli === 'codex'
    && includesAny(lower, [
      '.codex/sessions',
      'cannot access session files',
      'error creating thread',
      'permission denied',
    ])
  ) {
    return 'session-permission';
  }

  if (includesAny(lower, ['timed out after', 'timed out', 'timeout'])) {
    return 'timeout';
  }

  if (includesAny(lower, ['failed to spawn', 'no such file or directory', 'enoent'])) {
    return 'spawn';
  }

  if (includesAny(lower, [
    'failed to connect to websocket',
    'internal server error',
    'reading additional input from stdin',
    'unexpected status 401',
    'fetch failed',
    'network',
    'econnrefused',
    'econnreset',
  ])) {
    return 'transport';
  }

  return 'unknown';
}

export function describeCliIssue(cli: CliKind, detail: string): CliIssue {
  const code = detectCliIssueCode(cli, detail);
  const label = cliLabel(cli);

  switch (code) {
    case 'auth':
      return {
        cli,
        code,
        summary: `${label} is not authenticated.`,
        action: `Open Settings and sign in to ${label}, or switch to the other provider.`,
        detail,
      };
    case 'session-permission':
      return {
        cli,
        code,
        summary: `${label} cannot access ~/.codex session files.`,
        action: 'Fix ~/.codex permissions or switch to Claude in Settings.',
        detail,
      };
    case 'timeout':
      return {
        cli,
        code,
        summary: `${label} did not respond in time.`,
        action: 'Retry, or switch to the other provider in Settings.',
        detail,
      };
    case 'spawn':
      return {
        cli,
        code,
        summary: `${label} could not be started on this machine.`,
        action: `Check that ${cli} is installed and available in PATH, or switch providers in Settings.`,
        detail,
      };
    case 'transport':
      return {
        cli,
        code,
        summary: `${label} could not reach its backend service.`,
        action: 'Retry, or switch to the other provider in Settings.',
        detail,
      };
    default:
      return {
        cli,
        code,
        summary: `${label} failed.`,
        action: 'Open Settings to check provider status, then retry.',
        detail,
      };
  }
}

export function formatAiRuntimeErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  const mentionsCodex = lower.includes('codex');
  const mentionsClaude = lower.includes('claude');

  const codexIssue = mentionsCodex ? describeCliIssue('codex', raw) : null;
  const claudeIssue = mentionsClaude ? describeCliIssue('claude', raw) : null;

  if (codexIssue && claudeIssue) {
    if (codexIssue.code === 'auth' && claudeIssue.code === 'auth') {
      return 'AI unavailable — Codex and Claude are not authenticated. Open Settings, sign in to one provider, then retry.';
    }

    return `AI unavailable — ${codexIssue.summary} ${claudeIssue.summary} Open Settings to check provider status, then retry.`;
  }

  const single = codexIssue ?? claudeIssue;
  if (single) {
    return `AI unavailable — ${single.summary} ${single.action}`;
  }

  return 'AI unavailable — Open Settings to check provider status, then retry.';
}

export function deriveAiAvailability(
  preferredCli: AiCliKind,
  providers: CliHealth[] | null | undefined,
): AiAvailability {
  if (!providers) {
    return {
      selected: null,
      alternate: null,
      effectiveCli: null,
      canSend: false,
      notice: 'Checking AI availability…',
      tone: 'muted',
    };
  }

  if (providers.length === 0) {
    return {
      selected: null,
      alternate: null,
      effectiveCli: null,
      canSend: false,
      notice: 'AI unavailable — provider status could not be verified. Retry, or open Settings to inspect the configured CLI.',
      tone: 'error',
    };
  }

  const selected = providers.find((provider) => provider.cli === preferredCli) ?? null;
  const alternate = providers.find((provider) => provider.cli !== preferredCli) ?? null;

  if (!selected) {
    return {
      selected: null,
      alternate,
      effectiveCli: alternate?.ok ? alternate.cli : preferredCli,
      canSend: alternate?.ok ?? true,
      notice: null,
      tone: null,
    };
  }

  if (selected.ok) {
    return {
      selected,
      alternate,
      effectiveCli: selected.cli,
      canSend: true,
      notice: null,
      tone: null,
    };
  }

  if (alternate?.ok) {
    return {
      selected,
      alternate,
      effectiveCli: alternate.cli,
      canSend: true,
      notice: `${selected.cli === 'codex' ? 'Codex CLI' : 'Claude CLI'} unavailable. Loom will use ${alternate.cli === 'codex' ? 'Codex CLI' : 'Claude CLI'} for now. Open Settings if you want to switch permanently.`,
      tone: 'muted',
    };
  }

  if (selected.code === 'auth' && alternate?.code === 'auth') {
    return {
      selected,
      alternate,
      effectiveCli: null,
      canSend: false,
      notice: 'AI unavailable — Codex and Claude are not authenticated. Open Settings, sign in to one provider, then retry.',
      tone: 'error',
    };
  }

  return {
    selected,
    alternate,
    effectiveCli: null,
    canSend: false,
    notice: formatAiRuntimeErrorMessage(
      [selected.summary, selected.action, alternate?.summary, alternate?.action].filter(Boolean).join(' '),
    ),
    tone: 'error',
  };
}

export function resolveAiNotice(message: string | null | undefined): AiNotice {
  if (!message) {
    return {
      message: null,
      action: null,
    };
  }

  return {
    message,
    action: /open settings/i.test(message)
      ? {
          kind: 'open-settings',
          label: 'Open Settings',
        }
      : null,
  };
}
