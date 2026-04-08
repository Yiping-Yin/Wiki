/**
 * POST /api/chat
 * Body: { messages: [{role, content}], model: 'claude'|'codex', context?: string }
 *
 * Streams the assistant's response as Server-Sent Events.
 * Spawns the local `claude -p` or `codex exec` CLI and pipes stdout chunks.
 *
 * Each SSE event is `data: {"delta":"chunk"}\n\n` followed by `data: [DONE]\n\n`.
 */
import { spawn } from 'node:child_process';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? '/Users/yinyiping/.local/bin/claude';
const CODEX_BIN = process.env.CODEX_BIN ?? '/opt/homebrew/bin/codex';

type Msg = { role: 'user' | 'assistant'; content: string };

function buildPrompt(messages: Msg[], context?: string): string {
  // Build a single text prompt from the conversation history.
  // Claude CLI doesn't have a "messages" mode in -p, so we serialise it.
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
  let body: { messages: Msg[]; model?: 'claude' | 'codex'; context?: string };
  try { body = await req.json(); }
  catch { return new Response('invalid json', { status: 400 }); }
  if (!body.messages || body.messages.length === 0) {
    return new Response('no messages', { status: 400 });
  }

  const model = body.model === 'codex' ? 'codex' : 'claude';
  const prompt = buildPrompt(body.messages, body.context);

  let proc: ReturnType<typeof spawn>;
  try {
    if (model === 'claude') {
      proc = spawn(CLAUDE_BIN, ['-p', prompt, '--output-format', 'text'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      });
    } else {
      proc = spawn(CODEX_BIN, ['exec', prompt], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NO_COLOR: '1' },
      });
    }
  } catch (e: any) {
    return new Response(`failed to spawn ${model}: ${e.message}`, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (data: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(data)); } catch { closed = true; }
      };

      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        safeEnqueue(`data: ${JSON.stringify({ delta: text })}\n\n`);
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        // codex prints non-fatal info to stderr; ignore unless we hit close with error
      });
      proc.on('close', (code) => {
        if (code !== 0) {
          safeEnqueue(`data: ${JSON.stringify({ error: `${model} exited ${code}` })}\n\n`);
        }
        safeEnqueue('data: [DONE]\n\n');
        if (!closed) {
          try { controller.close(); } catch {}
          closed = true;
        }
      });
      proc.on('error', (e) => {
        safeEnqueue(`data: ${JSON.stringify({ error: e.message })}\n\n`);
        safeEnqueue('data: [DONE]\n\n');
        if (!closed) { try { controller.close(); } catch {} closed = true; }
      });
    },
    cancel() {
      proc.kill('SIGTERM');
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
