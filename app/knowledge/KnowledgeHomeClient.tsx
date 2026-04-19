'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
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
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupLabel, setNewGroupLabel] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupLabel, setEditingGroupLabel] = useState('');
  const [confirmingDeleteGroupId, setConfirmingDeleteGroupId] = useState<string | null>(null);
  const [confirmingHideCategorySlug, setConfirmingHideCategorySlug] = useState<string | null>(null);

  const resolvedGroups = useMemo(
    () =>
      (sourceLibraryGroups ?? groups ?? []).map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          groupId: item.groupId ?? group.id,
        })),
      })),
    [sourceLibraryGroups, groups],
  );
  const [currentGroups, setCurrentGroups] = useState(resolvedGroups);

  useEffect(() => {
    setCurrentGroups(resolvedGroups);
  }, [resolvedGroups]);

  useEffect(() => {
    if (editingGroupId && !resolvedGroups.some((group) => group.id === editingGroupId)) {
      setEditingGroupId(null);
      setEditingGroupLabel('');
    }
    if (confirmingDeleteGroupId && !resolvedGroups.some((group) => group.id === confirmingDeleteGroupId)) {
      setConfirmingDeleteGroupId(null);
    }
    if (
      confirmingHideCategorySlug
      && !resolvedGroups.some((group) => group.items.some((item) => item.slug === confirmingHideCategorySlug))
    ) {
      setConfirmingHideCategorySlug(null);
    }
  }, [resolvedGroups, editingGroupId, confirmingDeleteGroupId, confirmingHideCategorySlug]);

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
      return payload;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Request failed');
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  function onStartAddGroup() {
    setIsAddingGroup(true);
    setNewGroupLabel('');
    setEditingGroupId(null);
    setEditingGroupLabel('');
    setConfirmingDeleteGroupId(null);
  }

  function onCancelAddGroup() {
    setIsAddingGroup(false);
    setNewGroupLabel('');
  }

  function onSubmitNewGroup() {
    const label = newGroupLabel.trim();
    if (!label) return;
    void runMutation('group:add', '/api/source-library/groups', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label }),
    }).then((payload) => {
      if (!payload) return;
      setIsAddingGroup(false);
      setNewGroupLabel('');
    });
  }

  function onStartRenameGroup(groupId: string, currentLabel: string) {
    setEditingGroupId(groupId);
    setEditingGroupLabel(currentLabel);
    setIsAddingGroup(false);
    setNewGroupLabel('');
    setConfirmingDeleteGroupId(null);
  }

  function onCancelRenameGroup() {
    setEditingGroupId(null);
    setEditingGroupLabel('');
  }

  function onSubmitRenameGroup(groupId: string, currentLabel: string) {
    const label = editingGroupLabel.trim();
    if (!label || label === currentLabel) return;
    void runMutation(`group:rename:${groupId}`, '/api/source-library/groups', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId, label }),
    }).then((payload) => {
      if (!payload) return;
      setEditingGroupId(null);
      setEditingGroupLabel('');
    });
  }

  function onRequestDeleteGroup(groupId: string) {
    setConfirmingDeleteGroupId(groupId);
    setEditingGroupId(null);
    setEditingGroupLabel('');
    setIsAddingGroup(false);
    setNewGroupLabel('');
  }

  function onCancelDeleteGroup() {
    setConfirmingDeleteGroupId(null);
  }

  function onConfirmDeleteGroup(groupId: string) {
    void runMutation(`group:delete:${groupId}`, '/api/source-library/groups', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId }),
    }).then((payload) => {
      if (!payload) return;
      setConfirmingDeleteGroupId(null);
    });
  }

  function onRequestHideCategory(categorySlug: string) {
    setConfirmingHideCategorySlug(categorySlug);
  }

  function onCancelHideCategory() {
    setConfirmingHideCategorySlug(null);
  }

  function onConfirmHideCategory(categorySlug: string) {
    void runMutation(`category:hide:${categorySlug}`, '/api/source-library/membership', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categorySlug }),
    }).then((payload) => {
      if (!payload) return;
      setConfirmingHideCategorySlug(null);
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
      isAddingGroup={isAddingGroup}
      newGroupLabel={newGroupLabel}
      onStartAddGroup={onStartAddGroup}
      onCancelAddGroup={onCancelAddGroup}
      onChangeNewGroupLabel={setNewGroupLabel}
      onSubmitNewGroup={onSubmitNewGroup}
      editingGroupId={editingGroupId}
      editingGroupLabel={editingGroupLabel}
      onStartRenameGroup={onStartRenameGroup}
      onCancelRenameGroup={onCancelRenameGroup}
      onChangeEditingGroupLabel={setEditingGroupLabel}
      onSubmitRenameGroup={onSubmitRenameGroup}
      confirmingDeleteGroupId={confirmingDeleteGroupId}
      onRequestDeleteGroup={onRequestDeleteGroup}
      onCancelDeleteGroup={onCancelDeleteGroup}
      onConfirmDeleteGroup={onConfirmDeleteGroup}
      confirmingHideCategorySlug={confirmingHideCategorySlug}
      onRequestHideCategory={onRequestHideCategory}
      onCancelHideCategory={onCancelHideCategory}
      onConfirmHideCategory={onConfirmHideCategory}
      onMoveCategory={onMoveCategory}
      busyKey={busyKey}
      isPending={isPending}
      errorMessage={errorMessage}
    />
  );
}
