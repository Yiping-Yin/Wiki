/**
 * Safely extract a JSON object from CLI output that may contain
 * surrounding text, markdown fences, or preamble.
 *
 * Strategy:
 * 1. Try JSON.parse on the full text (after stripping code fences)
 * 2. If that fails, find the first `{` and use bracket-matching to
 *    locate the corresponding `}`, then parse that substring.
 */
export function extractJson(text: string): any | null {
  const cleaned = text.trim()
    .replace(/^```(?:json|JSON)?\s*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const start = cleaned.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}
