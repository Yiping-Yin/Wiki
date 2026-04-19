import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  SourceLibraryGroupRecord,
  SourceLibraryMembership,
  SourceLibraryMetadata,
} from './knowledge-types';

export const FALLBACK_SOURCE_LIBRARY_GROUP_ID = 'ungrouped';
export const FALLBACK_SOURCE_LIBRARY_GROUP_LABEL = 'Ungrouped';
export const DEFAULT_SOURCE_LIBRARY_ORDER = 9999;

const EMPTY_METADATA: SourceLibraryMetadata = {
  groups: [],
  memberships: [],
};

let sourceLibraryMetadataWriteQueue = Promise.resolve();

function fallbackGroup(): SourceLibraryGroupRecord {
  return {
    id: FALLBACK_SOURCE_LIBRARY_GROUP_ID,
    label: FALLBACK_SOURCE_LIBRARY_GROUP_LABEL,
    order: DEFAULT_SOURCE_LIBRARY_ORDER,
  };
}

function sourceLibraryManifestRoot() {
  return path.join(process.cwd(), 'knowledge', '.cache', 'manifest');
}

function normalizeLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ');
}

function requireString(value: unknown, message: string) {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  return value;
}

function isMissingMetadataFileError(error: unknown) {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}

function sortGroups(groups: SourceLibraryGroupRecord[]) {
  return [...groups].sort((a, b) => (a.order - b.order) || a.label.localeCompare(b.label));
}

function sortMemberships(memberships: SourceLibraryMembership[]) {
  return [...memberships].sort((a, b) => (a.order - b.order) || a.categorySlug.localeCompare(b.categorySlug));
}

async function withSerializedSourceLibraryMetadataWrite<T>(
  task: () => Promise<T> | T,
): Promise<T> {
  const previousWrite = sourceLibraryMetadataWriteQueue;
  let releaseCurrentWrite!: () => void;
  sourceLibraryMetadataWriteQueue = new Promise<void>((resolve) => {
    releaseCurrentWrite = resolve;
  });

  await previousWrite;
  try {
    return await task();
  } finally {
    releaseCurrentWrite();
  }
}

function normalizeMetadata(metadata: SourceLibraryMetadata | null | undefined): SourceLibraryMetadata {
  const groups = new Map<string, SourceLibraryGroupRecord>();
  const memberships = new Map<string, SourceLibraryMembership>();

  for (const group of metadata?.groups ?? []) {
    if (!group || typeof group.id !== 'string' || typeof group.label !== 'string') continue;
    const id = group.id.trim();
    const label = normalizeLabel(group.label);
    if (!id || !label) continue;
    groups.set(id, {
      id,
      label,
      order: Number.isFinite(group.order) ? group.order : DEFAULT_SOURCE_LIBRARY_ORDER,
    });
  }

  groups.set(FALLBACK_SOURCE_LIBRARY_GROUP_ID, fallbackGroup());
  const groupIds = new Set(groups.keys());

  for (const membership of metadata?.memberships ?? []) {
    if (!membership || typeof membership.categorySlug !== 'string') continue;
    const categorySlug = membership.categorySlug.trim();
    if (!categorySlug) continue;
    const groupId = groupIds.has(membership.groupId)
      ? membership.groupId
      : FALLBACK_SOURCE_LIBRARY_GROUP_ID;
    memberships.set(categorySlug, {
      categorySlug,
      groupId,
      order: Number.isFinite(membership.order) ? membership.order : DEFAULT_SOURCE_LIBRARY_ORDER,
    });
  }

  return {
    groups: sortGroups(Array.from(groups.values())),
    memberships: sortMemberships(Array.from(memberships.values())),
  };
}

async function loadSourceLibraryMetadata(): Promise<SourceLibraryMetadata> {
  try {
    const raw = await fs.readFile(sourceLibraryMetadataPath(), 'utf8');
    return normalizeMetadata(JSON.parse(raw) as SourceLibraryMetadata);
  } catch (error) {
    if (isMissingMetadataFileError(error)) {
      return normalizeMetadata(EMPTY_METADATA);
    }

    throw new Error('Unable to read source library metadata');
  }
}

async function persistSourceLibraryMetadata(metadata: SourceLibraryMetadata) {
  await fs.mkdir(sourceLibraryManifestRoot(), { recursive: true });
  const finalPath = sourceLibraryMetadataPath();
  const tempPath = `${finalPath}.${randomUUID()}.tmp`;
  const body = JSON.stringify(normalizeMetadata(metadata), null, 2);

  await fs.writeFile(tempPath, body, 'utf8');
  try {
    await fs.rename(tempPath, finalPath);
  } finally {
    await fs.rm(tempPath, { force: true });
  }
}

async function updateSourceLibraryMetadata(
  update: (metadata: SourceLibraryMetadata) => SourceLibraryMetadata | Promise<SourceLibraryMetadata>,
) {
  return withSerializedSourceLibraryMetadataWrite(async () => {
    const current = await loadSourceLibraryMetadata();
    const next = normalizeMetadata(await update(current));
    await persistSourceLibraryMetadata(next);
    return next;
  });
}

function nextGroupOrder(groups: SourceLibraryGroupRecord[]) {
  const existingOrders = groups
    .filter((group) => group.id !== FALLBACK_SOURCE_LIBRARY_GROUP_ID)
    .map((group) => group.order);
  return existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 0;
}

export function sourceLibraryMetadataPath() {
  return path.join(sourceLibraryManifestRoot(), 'source-library-groups.json');
}

export async function readSourceLibraryMetadata(): Promise<SourceLibraryMetadata> {
  return loadSourceLibraryMetadata();
}

export async function writeSourceLibraryMetadata(metadata: SourceLibraryMetadata) {
  return withSerializedSourceLibraryMetadataWrite(async () => {
    const next = normalizeMetadata(metadata);
    await persistSourceLibraryMetadata(next);
    return next;
  });
}

export async function createSourceLibraryGroup(label: string) {
  const nextLabel = normalizeLabel(requireString(label, 'Group label is required'));
  if (!nextLabel) {
    throw new Error('Group label is required');
  }

  const metadata = await updateSourceLibraryMetadata((current) => {
    const duplicate = current.groups.some((group) => group.label.toLowerCase() === nextLabel.toLowerCase());
    if (duplicate) {
      throw new Error('Group label already exists');
    }

    return {
      ...current,
      groups: [
        ...current.groups,
        {
          id: randomUUID(),
          label: nextLabel,
          order: nextGroupOrder(current.groups),
        },
      ],
    };
  });

  return metadata.groups.find((group) => group.label === nextLabel)!;
}

export async function renameSourceLibraryGroup(groupId: string, label: string) {
  const nextGroupId = requireString(groupId, 'Group id is required');
  const nextLabel = normalizeLabel(requireString(label, 'Group label is required'));
  if (!nextGroupId.trim()) {
    throw new Error('Group id is required');
  }
  if (!nextLabel) {
    throw new Error('Group label is required');
  }
  if (nextGroupId === FALLBACK_SOURCE_LIBRARY_GROUP_ID) {
    throw new Error('Ungrouped cannot be renamed');
  }

  const metadata = await updateSourceLibraryMetadata((current) => {
    const existing = current.groups.find((group) => group.id === nextGroupId);
    if (!existing) {
      throw new Error('Unknown group id');
    }

    const duplicate = current.groups.some(
      (group) => group.id !== nextGroupId && group.label.toLowerCase() === nextLabel.toLowerCase(),
    );
    if (duplicate) {
      throw new Error('Group label already exists');
    }

    return {
      ...current,
      groups: current.groups.map((group) =>
        group.id === nextGroupId ? { ...group, label: nextLabel } : group,
      ),
    };
  });

  return metadata.groups.find((group) => group.id === nextGroupId)!;
}

export async function deleteSourceLibraryGroup(groupId: string) {
  const nextGroupId = requireString(groupId, 'Group id is required');
  if (!nextGroupId.trim()) {
    throw new Error('Group id is required');
  }
  if (nextGroupId === FALLBACK_SOURCE_LIBRARY_GROUP_ID) {
    throw new Error('Ungrouped cannot be deleted');
  }

  return updateSourceLibraryMetadata((current) => {
    const existing = current.groups.find((group) => group.id === nextGroupId);
    if (!existing) {
      throw new Error('Unknown group id');
    }

    return {
      groups: current.groups.filter((group) => group.id !== nextGroupId),
      memberships: current.memberships.map((membership) =>
        membership.groupId === nextGroupId
          ? { ...membership, groupId: FALLBACK_SOURCE_LIBRARY_GROUP_ID }
          : membership,
      ),
    };
  });
}

export async function assignCategoryToGroup(categorySlug: string, groupId: string) {
  const normalizedCategorySlug = requireString(categorySlug, 'Category slug is required').trim();
  if (!normalizedCategorySlug) {
    throw new Error('Category slug is required');
  }
  const nextGroupId = requireString(groupId, 'Group id is required');
  if (!nextGroupId.trim()) {
    throw new Error('Group id is required');
  }

  return updateSourceLibraryMetadata((current) => {
    const targetGroup = current.groups.find((group) => group.id === nextGroupId);
    if (!targetGroup) {
      throw new Error('Unknown group id');
    }

    return {
      ...current,
      memberships: [
        ...current.memberships.filter((membership) => membership.categorySlug !== normalizedCategorySlug),
        {
          categorySlug: normalizedCategorySlug,
          groupId: nextGroupId,
          order: DEFAULT_SOURCE_LIBRARY_ORDER,
        },
      ],
    };
  });
}
