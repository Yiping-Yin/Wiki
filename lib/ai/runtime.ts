'use client';
/**
 * AI call entry point — Swift-bridge only. Phase 3 / 5 of architecture
 * inversion. `/api/chat` is deleted; the Mac app's Swift layer (via
 * `askAIStream`) is the single AI transport.
 */

import type { AiCliKind } from '../ai-cli';
import { askAIStream } from '../ai-stream-bridge';
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

/**
 * Fold a messages array into a single prompt string. Swift's
 * `AnthropicClient.Options` takes a single-string prompt today; a later
 * pass can pipe a proper messages array through the bridge.
 */
function foldMessagesToPrompt(messages: ChatMessage[], context?: string): string {
  const parts: string[] = [];
  if (context) parts.push(context);
  for (const m of messages) {
    if (m.role === 'user') {
      parts.push(m.content);
    } else {
      parts.push(`Assistant: ${m.content}`);
    }
  }
  return parts.join('\n\n');
}

export async function runAiText({
  stage,
  messages,
  context,
  signal,
  onDelta,
  onNotice,
}: RunAiOptions): Promise<string> {
  dispatchIsland('ai-start', stage);
  try {
    const prompt = foldMessagesToPrompt(messages, context);
    return await askAIStream(prompt, {
      onDelta: onDelta ?? (() => {}),
      onNotice,
      signal,
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
