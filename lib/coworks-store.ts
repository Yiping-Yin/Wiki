/**
 * File-backed cowork store, keyed by user-data root.
 * Single JSON file `user-data/coworks.json` holds all coworks across all
 * collections. Reads are cached in-process by mtime; writes invalidate.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loomUserDataRoot } from './paths';
import type { Cowork, CoworkMaterial, CoworkSummary, ScratchBlock } from './cowork-types';

export function coworksStorePath(): string {
  return path.join(loomUserDataRoot(), 'coworks.json');
}

type StoredState = { coworks: Cowork[] };

let cachePromise: Promise<StoredState> | null = null;
let cacheSig: string | null = null;

async function fileSignature(file: string): Promise<string> {
  try {
    const stat = await fs.stat(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return 'missing';
  }
}

async function loadState(): Promise<StoredState> {
  const file = coworksStorePath();
  const sig = await fileSignature(file);
  if (cachePromise && cacheSig === sig) return cachePromise;
  cacheSig = sig;
  cachePromise = (async () => {
    try {
      const raw = await fs.readFile(file, 'utf-8');
      const parsed = JSON.parse(raw) as StoredState;
      if (!parsed || !Array.isArray(parsed.coworks)) return { coworks: [] };
      return parsed;
    } catch {
      return { coworks: [] };
    }
  })();
  return cachePromise;
}

async function writeState(state: StoredState): Promise<void> {
  const file = coworksStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), 'utf-8');
  cachePromise = null;
  cacheSig = null;
}

function toSummary(c: Cowork): CoworkSummary {
  return {
    id: c.id,
    categorySlug: c.categorySlug,
    title: c.title,
    description: c.description,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    materialCount: c.materials.length,
    scratchBlockCount: c.scratch.length,
    hasTidyDraft: Boolean(c.tidyDraft),
    hasReflection: Boolean(c.reflection && c.reflection.trim().length > 0),
  };
}

export async function listCoworksByCategory(categorySlug: string): Promise<CoworkSummary[]> {
  const state = await loadState();
  return state.coworks
    .filter((c) => c.categorySlug === categorySlug)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(toSummary);
}

/** Every cowork in the store, sorted newest-updated first. Used by the
 *  global /coworks index so rehearsals are first-class citizens of Loom
 *  navigation rather than buried inside each collection. */
export async function listAllCoworks(): Promise<CoworkSummary[]> {
  const state = await loadState();
  return [...state.coworks]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(toSummary);
}

/** Search preview data per cowork — title, description, scratch text
 *  (flattened from blocks), and reflection. Used by /coworks index-page
 *  filtering so the user can grep across all their thinking, not just
 *  titles. Scratch preview is trimmed to keep the client payload bounded. */
export type CoworkSearchable = CoworkSummary & {
  scratchPreview: string;
  reflectionPreview: string;
};

const SCRATCH_PREVIEW_MAX = 1200;
const REFLECTION_PREVIEW_MAX = 500;

export async function listCoworksWithSearchable(): Promise<CoworkSearchable[]> {
  const state = await loadState();
  return [...state.coworks]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((c) => {
      const textParts: string[] = [];
      for (const b of c.scratch) {
        if (b.kind === 'text' && b.content.trim()) textParts.push(b.content.trim());
        if (textParts.join(' ').length > SCRATCH_PREVIEW_MAX) break;
      }
      const scratchPreview = textParts
        .join(' ')
        .replace(/\s+/g, ' ')
        .slice(0, SCRATCH_PREVIEW_MAX);
      const reflectionPreview = (c.reflection ?? '')
        .replace(/\s+/g, ' ')
        .slice(0, REFLECTION_PREVIEW_MAX);
      return {
        ...toSummary(c),
        scratchPreview,
        reflectionPreview,
      };
    });
}

/** Inverse index: for each library doc id, the list of cowork summaries
 *  that reference it. Built fresh from the full state on each call —
 *  coworks are bounded in number so full scan is fine. */
export async function coworkRefsByDocId(): Promise<Map<string, CoworkSummary[]>> {
  const state = await loadState();
  const result = new Map<string, CoworkSummary[]>();
  for (const cowork of state.coworks) {
    for (const material of cowork.materials) {
      if (material.kind !== 'library') continue;
      const existing = result.get(material.ref) ?? [];
      // Dedupe — a cowork might reference the same doc more than once in
      // edge cases.
      if (existing.some((c) => c.id === cowork.id)) continue;
      existing.push(toSummary(cowork));
      result.set(material.ref, existing);
    }
  }
  return result;
}

export async function getCowork(id: string): Promise<Cowork | null> {
  const state = await loadState();
  return state.coworks.find((c) => c.id === id) ?? null;
}

export async function createCowork(input: {
  categorySlug: string;
  title: string;
  description?: string;
}): Promise<Cowork> {
  const state = await loadState();
  const now = Date.now();
  const cowork: Cowork = {
    id: randomUUID(),
    categorySlug: input.categorySlug,
    title: input.title.trim() || 'Untitled rehearsal',
    description: (input.description ?? '').trim(),
    materials: [],
    scratch: [{ kind: 'text', id: randomUUID(), content: '' }],
    createdAt: now,
    updatedAt: now,
  };
  state.coworks.push(cowork);
  await writeState(state);
  return cowork;
}

export async function updateCowork(
  id: string,
  patch: Partial<Omit<Cowork, 'id' | 'categorySlug' | 'createdAt'>>,
): Promise<Cowork | null> {
  const state = await loadState();
  const idx = state.coworks.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const next: Cowork = {
    ...state.coworks[idx],
    ...patch,
    updatedAt: Date.now(),
  };
  state.coworks[idx] = next;
  await writeState(state);
  return next;
}

export async function deleteCowork(id: string): Promise<boolean> {
  const state = await loadState();
  const idx = state.coworks.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  state.coworks.splice(idx, 1);
  await writeState(state);
  return true;
}

/** Duplicate a cowork. Copies materials (fresh ids so removes don't cascade)
 *  and starts with an empty scratch — NOT the original's scratch, since the
 *  user's intent is "try another angle with the same setup." Reflection is
 *  NOT copied (it belongs to the prior execution). */
export async function duplicateCowork(id: string): Promise<Cowork | null> {
  const source = await getCowork(id);
  if (!source) return null;
  const state = await loadState();
  const now = Date.now();
  const newId = randomUUID();
  const fresh: Cowork = {
    id: newId,
    categorySlug: source.categorySlug,
    title: `${source.title} (copy)`,
    description: source.description,
    materials: source.materials.map((m) => ({
      ...m,
      id: randomUUID(),
      addedAt: now,
    })),
    scratch: [{ kind: 'text', id: randomUUID(), content: '' }],
    createdAt: now,
    updatedAt: now,
  };
  state.coworks.push(fresh);
  await writeState(state);
  return fresh;
}

/** Convenience helpers used by API routes for common mutations. */
export async function addMaterial(coworkId: string, material: Omit<CoworkMaterial, 'id' | 'addedAt'>): Promise<Cowork | null> {
  const cowork = await getCowork(coworkId);
  if (!cowork) return null;
  // Skip duplicates by (kind, ref) — re-adding the same library doc or URL
  // is almost always accidental.
  if (cowork.materials.some((m) => m.kind === material.kind && m.ref === material.ref)) {
    return cowork;
  }
  const newMaterial: CoworkMaterial = {
    id: randomUUID(),
    addedAt: Date.now(),
    ...material,
  };
  return updateCowork(coworkId, { materials: [...cowork.materials, newMaterial] });
}

/** Bulk add — atomic single write. Used by "Rehearse this folder" which can
 *  attach 30+ docs at once; individual PATCH calls would contend on the store. */
export async function addMaterials(
  coworkId: string,
  materials: Omit<CoworkMaterial, 'id' | 'addedAt'>[],
): Promise<Cowork | null> {
  const cowork = await getCowork(coworkId);
  if (!cowork) return null;
  const existing = new Set(cowork.materials.map((m) => `${m.kind}::${m.ref}`));
  const now = Date.now();
  const additions: CoworkMaterial[] = [];
  for (const m of materials) {
    const key = `${m.kind}::${m.ref}`;
    if (existing.has(key)) continue;
    existing.add(key);
    additions.push({ id: randomUUID(), addedAt: now, ...m });
  }
  if (additions.length === 0) return cowork;
  return updateCowork(coworkId, { materials: [...cowork.materials, ...additions] });
}

export async function removeMaterial(coworkId: string, materialId: string): Promise<Cowork | null> {
  const cowork = await getCowork(coworkId);
  if (!cowork) return null;
  return updateCowork(coworkId, {
    materials: cowork.materials.filter((m) => m.id !== materialId),
  });
}

/** Rename a material in-place (keeps its id, so scratch chips still resolve).
 *  Used by the URL-preview post-processor to upgrade the title from the raw
 *  URL to the page's <title> once fetched. */
export async function renameMaterial(
  coworkId: string,
  materialId: string,
  title: string,
): Promise<Cowork | null> {
  const cowork = await getCowork(coworkId);
  if (!cowork) return null;
  return updateCowork(coworkId, {
    materials: cowork.materials.map((m) =>
      m.id === materialId ? { ...m, title } : m,
    ),
  });
}

export async function saveScratch(coworkId: string, scratch: ScratchBlock[]): Promise<Cowork | null> {
  return updateCowork(coworkId, { scratch });
}

/** Save an edited tidy draft — user hand-tweaking the assembled markdown.
 *  Sets `userEdited: true` so Regenerate can warn before overwriting. */
export async function saveTidyDraftMarkdown(coworkId: string, markdown: string): Promise<Cowork | null> {
  const cowork = await getCowork(coworkId);
  if (!cowork) return null;
  const prev = cowork.tidyDraft;
  return updateCowork(coworkId, {
    tidyDraft: {
      markdown,
      tidiedBlocks: prev?.tidiedBlocks ?? [],
      generatedAt: prev?.generatedAt ?? Date.now(),
      userEdited: true,
    },
  });
}

/** Re-assemble the cached markdown from the current tidied blocks + chips,
 *  in the order the scratch dictates. Used after per-block edits so Export
 *  always sees the latest state without requiring the client to recompute. */
function reassembleMarkdown(cowork: Cowork, tidiedBlocks: import('./cowork-types').TidiedBlock[]): string {
  const tidiedById = new Map(tidiedBlocks.map((t) => [t.id, t]));
  const materialById = new Map(cowork.materials.map((m) => [m.id, m]));
  const parts: string[] = [];
  for (const block of cowork.scratch) {
    if (block.kind === 'text') {
      const tidied = tidiedById.get(block.id);
      const content = tidied?.content ?? block.content;
      if (content.trim()) parts.push(content.trim());
    } else if (block.kind === 'image') {
      parts.push(`![${block.alt ?? 'image'}](${block.dataUrl})`);
    } else {
      const material = materialById.get(block.materialId);
      if (!material) continue;
      if (material.kind === 'url') {
        parts.push(`[${material.title}](${material.ref})`);
      } else {
        const href = material.meta?.href ?? '';
        parts.push(href ? `[${material.title}](${href})` : `[${material.title}]`);
      }
    }
  }
  return parts.join('\n\n');
}

/** Update a single tidied block (save user edit or AI regenerate). Used by
 *  the per-block Tidy API. Reassembles markdown automatically so export +
 *  preview always reflect current state. */
export async function updateTidiedBlock(
  coworkId: string,
  blockId: string,
  update: { content: string; status: 'ok' | 'fallback' | 'user-reverted'; fallbackReason?: string },
  opts: { markUserEdited?: boolean } = {},
): Promise<Cowork | null> {
  const cowork = await getCowork(coworkId);
  if (!cowork?.tidyDraft) return null;
  const tidiedBlocks = cowork.tidyDraft.tidiedBlocks.map((b) =>
    b.id === blockId
      ? {
          ...b,
          content: update.content,
          status: update.status,
          fallbackReason: update.fallbackReason,
        }
      : b,
  );
  const markdown = reassembleMarkdown(cowork, tidiedBlocks);
  return updateCowork(coworkId, {
    tidyDraft: {
      markdown,
      tidiedBlocks,
      generatedAt: cowork.tidyDraft.generatedAt,
      userEdited: opts.markUserEdited
        ? true
        : cowork.tidyDraft.userEdited ?? false,
    },
  });
}
