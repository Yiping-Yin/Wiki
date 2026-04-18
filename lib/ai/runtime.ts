'use client';

import type { AiCliKind } from '../ai-cli';
import { readAiCliPreference } from '../ai-cli';
import { readSseToString } from './sse-reader';
import type { AiStageId } from './stage-model';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type RunAiOptions = {
  stage: AiStageId;
  messages: ChatMessage[];
  context?: string;
  cli?: AiCliKind;
  signal?: AbortSignal;
  onDelta?: (delta: string, full: string) => void;
  onNotice?: (notice: string) => void;
};

function dispatchIsland(type: 'ai-start' | 'ai-end', stage: AiStageId) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('loom:island', { detail: { type, stage } }));
}

export async function runAiText({
  stage,
  messages,
  context,
  cli,
  signal,
  onDelta,
  onNotice,
}: RunAiOptions): Promise<string> {
  dispatchIsland('ai-start', stage);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        cli: cli ?? readAiCliPreference(),
        context,
        stage,
      }),
      signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`AI call failed: ${response.status}`);
    }

    return readSseToString(response.body, signal, {
      onDelta,
      onNotice,
    });
  } finally {
    dispatchIsland('ai-end', stage);
  }
}

export async function callAiPrompt(
  stage: AiStageId,
  prompt: string,
  opts?: Omit<RunAiOptions, 'stage' | 'messages'>,
): Promise<string> {
  return runAiText({
    stage,
    messages: [{ role: 'user', content: prompt }],
    context: opts?.context,
    cli: opts?.cli,
    signal: opts?.signal,
    onDelta: opts?.onDelta,
    onNotice: opts?.onNotice,
  });
}
