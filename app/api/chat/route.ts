/**
 * POST /api/chat
 * Body: { messages: [{role, content}], cli?: 'claude'|'codex', model?: 'claude'|'codex', context?: string }
 *
 * Streams the assistant's response as Server-Sent Events.
 * Internally this route now uses the same CLI wrapper as the non-streaming
 * endpoints, so provider fallback and auth handling stay consistent.
 *
 * Each SSE event is `data: {"delta":"chunk"}\n\n` followed by `data: [DONE]\n\n`.
 */
import { pickCli } from '../../../lib/claude-cli';
import { markLocalRuntimeHealthy } from '../../../lib/ai-runtime/health';
import { invokeLocalRuntime } from '../../../lib/ai-runtime/invoke';
import type { AiStageId } from '../../../lib/ai/stage-model';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

type Msg = { role: 'user' | 'assistant'; content: string };

function buildPrompt(messages: Msg[], context?: string): string {
  const parts: string[] = [];
  if (context) {
    parts.push(`<context>\n${context}\n</context>`);
    parts.push('');
  }
  parts.push('You are a focused assistant inside a personal wiki app. Be concise. Use markdown when helpful.');
  parts.push('');
  for (const m of messages) {
    if (m.role === 'user') parts.push(`User: ${m.content}`);
    else parts.push(`Assistant: ${m.content}`);
  }
  parts.push('Assistant:');
  return parts.join('\n');
}

export async function POST(req: Request) {
  let body: {
    messages: Msg[];
    cli?: 'claude' | 'codex';
    model?: 'claude' | 'codex';
    context?: string;
    stage?: AiStageId;
  };
  try {
    body = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  if (!body.messages || body.messages.length === 0) {
    return new Response('no messages', { status: 400 });
  }

  const cli = pickCli(body);
  const prompt = buildPrompt(body.messages, body.context);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const safeEnqueue = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {}
      };
      let streamed = false;

      const result = await invokeLocalRuntime({
        preferred: cli,
        prompt,
        stage: body.stage,
        onChunk: (chunk) => {
          streamed = true;
          safeEnqueue(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
        },
      });

      try {
        if (result.runtime === null) {
          safeEnqueue(`data: ${JSON.stringify({ error: result.userMessage })}\n\n`);
        } else {
          markLocalRuntimeHealthy(result.runtime);
          if (result.notice) {
            safeEnqueue(`data: ${JSON.stringify({ notice: result.notice })}\n\n`);
          }
          if (result.text && !streamed) {
            safeEnqueue(`data: ${JSON.stringify({ delta: result.text })}\n\n`);
          }
        }
      } finally {
        safeEnqueue('data: [DONE]\n\n');
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
