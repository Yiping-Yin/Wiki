import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loomUserDataRoot } from './paths';

/**
 * Scan scope · user-selected subset of content-root to ingest.
 *
 * A plain all-or-nothing scan of content-root is too blunt: users routinely
 * have sibling folders they do NOT want indexed (code, media, archives).
 * Scan scope lets them check the folders they DO want, saved as paths
 * relative to content-root.
 *
 * Semantics:
 *  - `included` empty → scan everything (default, backward-compatible).
 *  - `included` non-empty → only those relative paths (and their subtrees).
 *
 * Paths are normalized: no leading slash, use forward slashes, no `..`.
 */

export type ScanScope = {
  included: string[];
};

function scopePath(): string {
  return path.join(loomUserDataRoot(), 'scan-scope.json');
}

function normalizeRel(p: string): string | null {
  const cleaned = p.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  if (!cleaned) return null;
  if (cleaned.split('/').some((seg) => seg === '..' || seg === '.')) return null;
  return cleaned;
}

export async function readScanScope(): Promise<ScanScope> {
  try {
    const raw = await fs.readFile(scopePath(), 'utf-8');
    const parsed = JSON.parse(raw) as { included?: unknown };
    const included = Array.isArray(parsed.included)
      ? parsed.included
          .filter((s): s is string => typeof s === 'string')
          .map(normalizeRel)
          .filter((s): s is string => s !== null)
      : [];
    return { included };
  } catch {
    return { included: [] };
  }
}

export async function writeScanScope(scope: ScanScope): Promise<ScanScope> {
  const normalized: ScanScope = {
    included: Array.from(new Set(
      (scope.included ?? [])
        .map(normalizeRel)
        .filter((s): s is string => s !== null),
    )).sort(),
  };
  await fs.mkdir(path.dirname(scopePath()), { recursive: true });
  await fs.writeFile(scopePath(), JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

/**
 * Given a relative path (from content-root) and the saved scope, return
 * whether this path should be walked into / indexed.
 *
 * A scope match is inclusive of descendants: if user checked `notes/ml`, then
 * `notes/ml/week-1/lecture.pdf` matches.
 */
export function pathInScope(relPath: string, scope: ScanScope): boolean {
  if (scope.included.length === 0) return true;
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  for (const sel of scope.included) {
    if (normalized === sel) return true;
    if (normalized.startsWith(sel + '/')) return true;
    // Also walk INTO ancestors of selected dirs so the walker can reach the
    // selected subtree. "notes" is walkable when "notes/ml" is selected.
    if (sel.startsWith(normalized + '/')) return true;
  }
  return false;
}
