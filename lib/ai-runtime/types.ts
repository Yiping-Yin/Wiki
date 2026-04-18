import type { AiCliKind } from '../ai-cli';

export type RuntimeCode =
  | 'auth'
  | 'session-permission'
  | 'timeout'
  | 'spawn'
  | 'transport'
  | 'unknown';

export type RuntimeFailure = {
  runtime: AiCliKind;
  code: RuntimeCode;
  detail: string;
};

export type RuntimePlan = {
  preferred: AiCliKind;
  order: [AiCliKind, AiCliKind];
};

export type RuntimeSuccess = {
  runtime: AiCliKind;
  text: string;
  fellBack: boolean;
  notice: string | null;
};

export type RuntimeFailureResult = {
  runtime: null;
  fellBack: boolean;
  userMessage: string;
};
