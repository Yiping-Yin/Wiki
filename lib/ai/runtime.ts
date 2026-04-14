'use client';

import type { AiCliKind } from '../ai-cli';
import { readAiCliPreference } from '../ai-cli';
import type { AiStageId } from './stage-model';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

type RunAiOptions = {
  stage: AiStageId;
  messages: ChatMessage[];
  context?: string;
  cli?: AiCliKind;
  signal?: AbortSignal;
  onDelta?: (delta: string, full: string) => void;
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let result = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
      const lines = raw.split('\n');
      raw = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          if (json.error) throw new Error(json.error);
          if (typeof json.delta === 'string') {
            result += json.delta;
            onDelta?.(json.delta, result);
          }
        } catch (e) {
          if (e instanceof SyntaxError) continue;
          throw e;
        }
      }
    }

    return result;
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
  });
}
