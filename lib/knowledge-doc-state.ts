export function normalizeKnowledgeDocBody(body: string): string {
  return body.replace(/\r\n/g, '\n').trim();
}

export function isKnowledgeDocPlaceholder(input: { title: string; body: string }): boolean {
  const normalized = normalizeKnowledgeDocBody(input.body);
  if (!normalized) return true;

  const titleHeading = `# ${input.title}`.trim();
  if (normalized === titleHeading) return true;

  const stripped = normalized
    .replace(/^#\s+.+$/m, '')
    .replace(/^\s+|\s+$/g, '');

  return stripped.length === 0;
}

export function canCaptureInline(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx') || lower.endsWith('.txt');
}
