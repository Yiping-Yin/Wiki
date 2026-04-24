import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveContentRoot } from '../../lib/runtime-roots';
import { UploadsClient, type UploadListItem } from './UploadsClient';

export const metadata = { title: 'Intake · Loom' };

const TEXT_PREVIEW_EXTS = new Set(['.txt', '.md', '.json', '.csv', '.tsv']);

function normalizePreview(raw: string) {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 180);
}

export default async function UploadsPage() {
  // Under static export we ship one bundle to every user — the builder's
  // `knowledge/uploads/` must not leak in. Dev mode still reads the real
  // directory so the web UI keeps working during development.
  if (process.env.LOOM_NEXT_OUTPUT === 'export') {
    return <UploadsClient items={[]} />;
  }

  const dir = path.join(resolveContentRoot(), 'knowledge', 'uploads');
  let items: UploadListItem[] = [];
  try {
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir);
    items = await Promise.all(
      entries.filter((n) => !n.startsWith('.')).map(async (name) => {
        const fullPath = path.join(dir, name);
        const stat = await fs.stat(fullPath);
        const ext = path.extname(name).toLowerCase();
        let preview = '';
        if (TEXT_PREVIEW_EXTS.has(ext)) {
          try {
            preview = normalizePreview(await fs.readFile(fullPath, 'utf-8'));
          } catch {}
        }
        return {
          name,
          size: stat.size,
          mtime: stat.mtime.getTime(),
          ext,
          preview,
        };
      }),
    );
    items.sort((a, b) => b.mtime - a.mtime);
  } catch {}

  return <UploadsClient items={items} />;
}
