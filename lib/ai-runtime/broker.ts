import type { AiCliKind } from '../ai-cli';
import { describeCliIssue, detectCliIssueCode } from '../ai-provider-health';
import type {
  RuntimeFailure,
  RuntimeFailureResult,
  RuntimePlan,
  RuntimeSuccess,
} from './types';
export type { RuntimeFailure } from './types';

const RECOVERABLE = new Set([
  'auth',
  'session-permission',
  'timeout',
  'transport',
]);

export function pickExecutionPlan({ preferred }: { preferred: AiCliKind | null }): RuntimePlan {
  const first: AiCliKind = preferred === 'claude' ? 'claude' : 'codex';
  return {
    preferred: first,
    order: first === 'claude' ? ['claude', 'codex'] : ['codex', 'claude'],
  };
}

export function isRecoverableFailure(failure: RuntimeFailure) {
  return RECOVERABLE.has(failure.code);
}

export function classifyRuntimeFailure(cli: AiCliKind, detail: string): RuntimeFailure {
  return {
    runtime: cli,
    code: detectCliIssueCode(cli, detail),
    detail,
  };
}

export function shouldFallback(cli: AiCliKind, detail: string): boolean {
  return isRecoverableFailure(classifyRuntimeFailure(cli, detail));
}

export function explainCliFailure(
  cli: AiCliKind,
  detail: string,
  fallbackCli?: AiCliKind,
  fallbackDetail?: string,
): string {
  const primary = describeCliIssue(cli, detail);
  if (fallbackCli && fallbackDetail) {
    const fallback = describeCliIssue(fallbackCli, fallbackDetail);
    return `${primary.summary} ${primary.action} Fallback ${fallback.summary.toLowerCase()} ${fallback.action}`;
  }
  return `${primary.summary} ${primary.action}`;
}

export function resolveBrokerResult(args: {
  preferred: AiCliKind | null;
  firstFailure?: RuntimeFailure;
  fallbackSuccess?: string;
}): RuntimeSuccess | RuntimeFailureResult {
  const plan = pickExecutionPlan({ preferred: args.preferred });
  if (args.firstFailure && args.fallbackSuccess && isRecoverableFailure(args.firstFailure)) {
    return {
      runtime: plan.order[1],
      text: args.fallbackSuccess,
      fellBack: true,
      notice: `${plan.order[0] === 'codex' ? 'Codex CLI' : 'Claude CLI'} unavailable. Loom used ${plan.order[1] === 'codex' ? 'Codex CLI' : 'Claude CLI'} for this request.`,
    };
  }
  if (args.firstFailure) {
    return {
      runtime: null,
      fellBack: false,
      userMessage: explainCliFailure(args.firstFailure.runtime, args.firstFailure.detail),
    };
  }
  throw new Error('resolveBrokerResult requires a failure to resolve');
}
