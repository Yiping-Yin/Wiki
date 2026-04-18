export function buildSourceExcerpt(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

export function buildSourceStub(text: string, maxLength = 220) {
  const full = text.replace(/\s+/g, ' ').trim();
  const preview = buildSourceExcerpt(full, maxLength);
  return {
    full,
    preview,
    truncated: preview !== full,
  };
}
