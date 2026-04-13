'use client';
/**
 * lib/note/export · export Notes as markdown or JSON files.
 *
 * Part of the user-trust story: "you can take your data with you at any
 * time." Triggered via CommandPalette or other actions. Uses a blob URL
 * + anchor click to trigger a browser download with zero dependencies.
 *
 * Formats:
 *   - Markdown: one human-readable file with sections per doc, notes
 *     sorted by date within each doc. Each note has a header with anchor
 *     info, then quote, then content.
 *   - JSON: raw Note[] serialized directly. Full fidelity, can be
 *     re-imported later.
 */
import type { Note } from './types';

/**
 * Group Notes by their anchor target (usually a doc or a note id).
 * Returns a Map preserving insertion order (first-seen target first).
 */
function groupByTarget(notes: Note[]): Map<string, Note[]> {
  const out = new Map<string, Note[]>();
  for (const n of notes) {
    const key = n.anchor.target ?? '(untargeted)';
    const existing = out.get(key);
    if (existing) existing.push(n);
    else out.set(key, [n]);
  }
  return out;
}

/**
 * Render a Note[] as a single markdown document.
 *
 * Structure:
 *   # Loom notes export · <timestamp>
 *
 *   ## <docId-friendly-name>
 *
 *   ### <first-line-of-summary-or-timestamp>
 *
 *   > <quote if any>
 *
 *   <content>
 *
 *   ---
 */
export function notesToMarkdown(notes: Note[]): string {
  const parts: string[] = [];
  parts.push(`# Loom notes export · ${new Date().toISOString()}`);
  parts.push('');
  parts.push(
    `Total: ${notes.length} note${notes.length === 1 ? '' : 's'}`,
  );
  parts.push('');

  const byTarget = groupByTarget(notes);
  for (const [target, group] of byTarget.entries()) {
    parts.push(`## ${prettifyTarget(target)}`);
    parts.push('');
    parts.push(
      `_${group.length} note${group.length === 1 ? '' : 's'} · target: \`${target}\`_`,
    );
    parts.push('');

    const sorted = group.slice().sort((a, b) => a.at - b.at);
    for (const note of sorted) {
      const when = new Date(note.at).toISOString();
      const title = (note.summary?.trim() || note.content.trim().split('\n')[0] || '(no title)').slice(
        0,
        120,
      );
      parts.push(`### ${title}`);
      parts.push('');
      parts.push(`_${when}_${note.flags.crystallized ? ' · ◈ crystallized' : ''}`);
      parts.push('');

      if (note.anchor.quote) {
        const lines = note.anchor.quote.split('\n');
        for (const line of lines) parts.push(`> ${line}`);
        parts.push('');
      }

      if (note.content.trim()) {
        parts.push(note.content);
        parts.push('');
      } else if (!note.anchor.quote) {
        parts.push('_(capture only, no content yet)_');
        parts.push('');
      }

      parts.push('---');
      parts.push('');
    }
  }

  return parts.join('\n');
}

/**
 * Render a single Note as a standalone markdown document.
 * Used for per-note exports (e.g., "Export focal note as markdown").
 */
export function singleNoteToMarkdown(note: Note): string {
  const when = new Date(note.at).toISOString();
  const title = note.summary?.trim() || note.content.trim().split('\n')[0] || 'Loom note';
  const parts: string[] = [];
  parts.push(`# ${title}`);
  parts.push('');
  parts.push(`_${when} · ${note.anchor.target ?? 'untargeted'}_`);
  parts.push('');
  if (note.anchor.quote) {
    const lines = note.anchor.quote.split('\n');
    for (const line of lines) parts.push(`> ${line}`);
    parts.push('');
  }
  if (note.content.trim()) {
    parts.push(note.content);
    parts.push('');
  }
  return parts.join('\n');
}

/**
 * Serialize Notes as JSON (one-line-per-note for diff-ability, or pretty).
 */
export function notesToJson(notes: Note[], pretty = true): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: notes.length,
      notes,
    },
    null,
    pretty ? 2 : 0,
  );
}

/**
 * Trigger a browser download of a string as a file. Uses a blob URL
 * + anchor click pattern that works in all modern browsers without
 * needing any dependencies.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'text/plain;charset=utf-8',
): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Cleanup. The setTimeout lets Safari register the click before
  // revoking the blob URL.
  window.setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── helpers ──────────────────────────────────────────────────────────────

function prettifyTarget(target: string): string {
  if (target.startsWith('wiki/')) {
    return (
      'wiki · ' +
      target.slice(5).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    );
  }
  if (target.startsWith('know/')) {
    const rest = target.slice(5);
    const idx = rest.indexOf('__');
    if (idx >= 0) {
      return (
        rest.slice(0, idx).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) +
        ' · ' +
        rest.slice(idx + 2).replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      );
    }
    return rest.replace(/[-_]+/g, ' ');
  }
  if (target.startsWith('ingested:')) {
    return 'Ingested · ' + target.slice(9);
  }
  return target;
}
