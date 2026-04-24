import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loomUserDataRoot } from '../../../../lib/paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * DELETE /api/source-corrections/all
 *
 * Nuke every Source Correct sidecar in one shot. Paired with the Settings
 * "Clear all corrections" action — lets the user reset the mutation layer
 * without individually navigating to each corrected doc.
 */

export async function DELETE() {
  const dir = path.join(loomUserDataRoot(), 'knowledge', '.cache', 'corrections');
  let removed = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          await fs.unlink(path.join(dir, entry.name));
          removed += 1;
        } catch {}
      }
    }
  } catch {}
  return NextResponse.json({ ok: true, removed });
}
