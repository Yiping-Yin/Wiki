/**
 * User-override layer on top of ingest-produced metadata.
 *
 * Ingest populates `knowledge/.cache/manifest/collection-metadata.json` from
 * source file contents. Users then correct/customize via the UI; those
 * corrections live in a single `overrides.json` under user-data so rebuilds
 * never wipe them.
 *
 * Current override surfaces:
 *   - Collection-level: courseName, term, teachers (correct what AI got wrong)
 *   - Folder-level: display order, label (rename a folder for display only)
 *
 * Shape is intentionally forward-looking: new override types can be added
 * without changing API contracts.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loomUserDataRoot } from './paths';

export type CollectionOverride = {
  courseName?: string;
  term?: string;
  teachers?: string[];
};

export type FolderOverride = {
  /** Child keys in desired order. For a folder child, the key is the folder's
   *  fullPath (e.g. "Week / Week 1"). For a file child, the key is the doc
   *  id (e.g. "unsw-infs-3822__week-1-seminar-slides"). Unknown children
   *  fall through to the default sort after the ordered ones. */
  order?: string[];
  /** Display-only rename. Source folder name is unchanged. */
  label?: string;
};

export type KnowledgeOverrides = {
  collections?: Record<string, CollectionOverride>;
  folders?: Record<string, Record<string, FolderOverride>>;
};

export function knowledgeOverridesPath(): string {
  return path.join(loomUserDataRoot(), 'knowledge', 'overrides.json');
}

export async function readKnowledgeOverrides(): Promise<KnowledgeOverrides> {
  try {
    const raw = await fs.readFile(knowledgeOverridesPath(), 'utf-8');
    const parsed = JSON.parse(raw) as KnowledgeOverrides;
    return parsed ?? {};
  } catch {
    return {};
  }
}

export async function writeKnowledgeOverrides(next: KnowledgeOverrides): Promise<void> {
  const file = knowledgeOverridesPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(next, null, 2), 'utf-8');
}

/** Merge a partial patch into the existing overrides, then persist. */
export async function patchKnowledgeOverrides(patch: {
  collections?: Record<string, CollectionOverride>;
  folders?: Record<string, Record<string, FolderOverride>>;
}): Promise<KnowledgeOverrides> {
  const current = await readKnowledgeOverrides();
  const next: KnowledgeOverrides = {
    collections: { ...(current.collections ?? {}) },
    folders: { ...(current.folders ?? {}) },
  };
  if (patch.collections) {
    for (const [slug, value] of Object.entries(patch.collections)) {
      next.collections![slug] = { ...(next.collections![slug] ?? {}), ...value };
    }
  }
  if (patch.folders) {
    for (const [slug, folderMap] of Object.entries(patch.folders)) {
      next.folders![slug] = { ...(next.folders![slug] ?? {}) };
      for (const [fullPath, value] of Object.entries(folderMap)) {
        next.folders![slug][fullPath] = { ...(next.folders![slug][fullPath] ?? {}), ...value };
      }
    }
  }
  await writeKnowledgeOverrides(next);
  return next;
}

export function collectionOverrideFor(
  overrides: KnowledgeOverrides,
  slug: string,
): CollectionOverride | undefined {
  return overrides.collections?.[slug];
}

export function folderOverridesFor(
  overrides: KnowledgeOverrides,
  slug: string,
): Record<string, FolderOverride> {
  return overrides.folders?.[slug] ?? {};
}
