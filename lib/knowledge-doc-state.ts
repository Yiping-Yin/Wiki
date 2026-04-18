export const LOOM_CAPTURE_DOC_MARKER = '<!-- loom:capture-doc -->';

export function normalizeKnowledgeDocBody(body: string): string {
  return body.replace(/\r\n/g, '\n').trim();
}

export function isKnowledgeDocPlaceholder(input: { title: string; body: string }): boolean {
  const normalized = normalizeKnowledgeDocBody(input.body)
    .replace(LOOM_CAPTURE_DOC_MARKER, '')
    .trim();
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

export function isWritableCaptureDoc(input: { ext: string; body: string }): boolean {
  if (input.ext !== '.md' && input.ext !== '.mdx') return false;
  if (!input.body.includes(LOOM_CAPTURE_DOC_MARKER)) return false;
  return true;
}
