'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KnowledgeHomeStatic } from './KnowledgeHomeStatic';
import { refreshKnowledgeNav } from '../../lib/use-knowledge-nav';

type KnowledgeHomeGroup = {
  id: string;
  label: string;
  items: Array<{
    slug: string;
    label: string;
    count: number;
    groupId?: string;
  }>;
};

type SourceLibraryGroupRoutePayload = {
  groups: Array<{
    id: string;
    label: string;
    order: number;
    count: number;
    categories: string[];
  }>;
  error?: string;
};

export function KnowledgeHomeClient({
  sourceLibraryGroups,
  groups,
  totalCollections,
  totalDocs,
}: {
  sourceLibraryGroups?: KnowledgeHomeGroup[];
  groups?: KnowledgeHomeGroup[];
  totalCollections: number;
  totalDocs: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedGroups = (sourceLibraryGroups ?? groups ?? []).map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      groupId: item.groupId ?? group.id,
    })),
  }));
  const [currentGroups, setCurrentGroups] = useState(resolvedGroups);

  useEffect(() => {
    setCurrentGroups(resolvedGroups);
  }, [sourceLibraryGroups, groups]);

  function syncGroups(payload: SourceLibraryGroupRoutePayload) {
    setCurrentGroups((previous) => {
      const itemsBySlug = new Map(
        previous.flatMap((group) => group.items.map((item) => [item.slug, item] as const)),
      );
      return payload.groups.map((group) => ({
        id: group.id,
        label: group.label,
        items: group.categories.map((slug) => {
          const existing = itemsBySlug.get(slug);
          return {
            slug,
            label: existing?.label ?? slug,
            count: existing?.count ?? 0,
            groupId: group.id,
          };
        }),
      }));
    });
    void refreshKnowledgeNav();
    startTransition(() => {
      router.refresh();
    });
  }

  async function runMutation(
    requestKey: string,
    input: RequestInfo | URL,
    init: RequestInit,
  ) {
    setBusyKey(requestKey);
    setErrorMessage(null);
    try {
      const response = await fetch(input, init);
      const payload = await response.json() as SourceLibraryGroupRoutePayload;
      if (!response.ok) {
        throw new Error(payload.error ?? 'Request failed');
      }
      syncGroups(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Request failed');
    } finally {
      setBusyKey(null);
    }
  }

  function onAddGroup() {
    const label = window.prompt('Add a source-library group');
    if (!label?.trim()) return;
    void runMutation('group:add', '/api/source-library/groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: label.trim() }),
    });
  }

  function onRenameGroup(groupId: string, currentLabel: string) {
    const label = window.prompt('Rename source-library group', currentLabel);
    if (!label?.trim() || label.trim() === currentLabel) return;
    void runMutation(`group:rename:${groupId}`, '/api/source-library/groups', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId, label: label.trim() }),
    });
  }

  function onDeleteGroup(groupId: string, currentLabel: string) {
    if (!window.confirm(`Delete "${currentLabel}"? Its categories will move back to Ungrouped.`)) return;
    void runMutation(`group:delete:${groupId}`, '/api/source-library/groups', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId }),
    });
  }

  function onMoveCategory(categorySlug: string, groupId: string) {
    void runMutation(`membership:${categorySlug}`, '/api/source-library/membership', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categorySlug, groupId }),
    });
  }

  return (
    <KnowledgeHomeStatic
      sourceLibraryGroups={currentGroups}
      totalCollections={totalCollections}
      totalDocs={totalDocs}
      onAddGroup={onAddGroup}
      onRenameGroup={onRenameGroup}
      onDeleteGroup={onDeleteGroup}
      onMoveCategory={onMoveCategory}
      busyKey={busyKey}
      isPending={isPending}
      errorMessage={errorMessage}
    />
  );
}
