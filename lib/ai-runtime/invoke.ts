import type { AiCliKind } from '../ai-cli';
import { runCli } from '../claude-cli';
import {
  classifyRuntimeFailure,
  explainCliFailure,
  isRecoverableFailure,
  pickExecutionPlan,
  resolveBrokerResult,
} from './broker';
import type { RuntimeFailureResult, RuntimeSuccess } from './types';

export async function invokeLocalRuntime(args: {
  preferred: AiCliKind | null;
  prompt: string;
  timeoutMs: number;
  model?: string;
  onChunk?: (chunk: string) => void;
}): Promise<RuntimeSuccess | RuntimeFailureResult> {
  const plan = pickExecutionPlan({ preferred: args.preferred });
  const firstRuntime = plan.order[0];
  let primaryStreamed = false;

  try {
    const text = await runCli(args.prompt, {
      cli: firstRuntime,
      timeoutMs: args.timeoutMs,
      model: args.model,
      onChunk: args.onChunk
        ? (chunk) => {
            primaryStreamed = true;
            args.onChunk?.(chunk);
          }
        : undefined,
    });
    return { runtime: firstRuntime, text, fellBack: false, notice: null };
  } catch (error: any) {
    const firstFailure = classifyRuntimeFailure(
      firstRuntime,
      error?.message ?? String(error),
    );

    if (primaryStreamed || !isRecoverableFailure(firstFailure)) {
      return resolveBrokerResult({
        preferred: args.preferred,
        firstFailure,
      });
    }

    const fallbackRuntime = plan.order[1];
    try {
      const text = await runCli(args.prompt, {
        cli: fallbackRuntime,
        timeoutMs: args.timeoutMs,
        model: args.model,
        onChunk: args.onChunk,
      });
      return resolveBrokerResult({
        preferred: args.preferred,
        firstFailure,
        fallbackSuccess: text,
      });
    } catch (fallbackError: any) {
      const fallbackFailure = classifyRuntimeFailure(
        fallbackRuntime,
        fallbackError?.message ?? String(fallbackError),
      );
      return {
        runtime: null,
        fellBack: false,
        userMessage: explainCliFailure(
          firstFailure.runtime,
          firstFailure.detail,
          fallbackFailure.runtime,
          fallbackFailure.detail,
        ),
      };
    }
  }
}
