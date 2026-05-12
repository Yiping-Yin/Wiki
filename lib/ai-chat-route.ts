type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

export type NormalizedChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type SourceContext = {
  title?: string;
  path?: string;
  loomURL?: string;
};

export function sseFrame(data: string) {
  return `data: ${data}\n\n`;
}

export function sseDelta(delta: string) {
  return sseFrame(JSON.stringify({ delta }));
}

export function sseHeaders() {
  return {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  };
}

export function normalizeMessages(value: unknown): NormalizedChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: NormalizedChatMessage[] = [];
  for (const item of value as ChatMessage[]) {
    const role = item?.role === 'assistant' ? 'assistant' : 'user';
    const content = typeof item?.content === 'string' ? item.content.trim() : '';
    if (content) messages.push({ role, content });
  }
  return messages;
}

export function normalizeSource(value: unknown): SourceContext | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    title: typeof raw.title === 'string' ? raw.title : undefined,
    path: typeof raw.path === 'string' ? raw.path : undefined,
    loomURL: typeof raw.loomURL === 'string' ? raw.loomURL : undefined,
  };
}

function buildSourceBlock(source: SourceContext | null) {
  if (!source) return '';
  const lines = ['SOURCE [S1]'];
  if (source.title) lines.push(`Title: ${source.title}`);
  if (source.path) lines.push(`Path: ${source.path}`);
  if (source.loomURL) lines.push(`Loom URL: ${source.loomURL}`);
  return lines.join('\n');
}

export function buildSourceBoundPrompt({
  context,
  messages,
  source = null,
}: {
  context?: string;
  messages: NormalizedChatMessage[];
  source?: SourceContext | null;
}) {
  const parts = [
    'You are a source-bound writing sidecar inside Loom, not a general chat surface.',
    'Support citation, summary, structure suggestions, and context retrieval only when they are traceable to SOURCE [S1] or the named Loom context below.',
    'If the provided source context does not contain enough evidence, say that directly instead of filling gaps with general knowledge.',
  ];
  const sourceBlock = buildSourceBlock(source);
  if (sourceBlock) parts.push(sourceBlock);
  if (context?.trim()) parts.push(`LOOM CONTEXT\n${context.trim()}`);
  parts.push(
    messages
      .map((message) => `${message.role === 'assistant' ? 'Assistant' : 'User'}: ${message.content}`)
      .join('\n\n'),
  );
  return parts.join('\n\n');
}

export function isSmokeChat(messages: NormalizedChatMessage[]) {
  return process.env.LOOM_SMOKE_CHAT === '1'
    && messages.some((message) => /reply with exactly:\s*hi/i.test(message.content));
}
