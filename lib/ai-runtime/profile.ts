import type { AiStageId } from '../ai/stage-model';

export type RuntimeInvocationProfile = {
  timeoutMs: number;
  model?: string;
  codexConfigOverrides?: string[];
};

export function getRuntimeInvocationProfile(stage?: AiStageId): RuntimeInvocationProfile {
  switch (stage) {
    case 'clarify-passage':
      return {
        timeoutMs: 20_000,
        model: 'gpt-5.4-mini',
        codexConfigOverrides: ['model_reasoning_effort="low"'],
      };
    case 'commit-anchor':
      return {
        timeoutMs: 45_000,
        model: 'gpt-5.4-mini',
        codexConfigOverrides: ['model_reasoning_effort="medium"'],
      };
    default:
      return {
        timeoutMs: 45_000,
        codexConfigOverrides: ['model_reasoning_effort="medium"'],
      };
  }
}
