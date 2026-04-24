'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { QuietScene, QuietSceneColumn } from '../../components/QuietScene';
import { PageFrame } from '../../components/PageFrame';
import { StageShell } from '../../components/StageShell';
import { WorkEyebrow, WorkSurface } from '../../components/WorkSurface';

export function KnowledgeHomeStatic({
  sourceLibraryGroups,
  groups,
  totalCollections,
  totalDocs,
  isAddingGroup = false,
  newGroupLabel = '',
  onStartAddGroup = () => {},
  onCancelAddGroup = () => {},
  onChangeNewGroupLabel = () => {},
  onSubmitNewGroup = () => {},
  editingGroupId = null,
  editingGroupLabel = '',
  onStartRenameGroup = () => {},
  onCancelRenameGroup = () => {},
  onChangeEditingGroupLabel = () => {},
  onSubmitRenameGroup = () => {},
  confirmingDeleteGroupId = null,
  onRequestDeleteGroup = () => {},
  onCancelDeleteGroup = () => {},
  onConfirmDeleteGroup = () => {},
  confirmingHideCategorySlug = null,
  onRequestHideCategory = () => {},
  onCancelHideCategory = () => {},
  onConfirmHideCategory = () => {},
  onMoveCategory = () => {},
  busyKey = null,
  isPending = false,
  errorMessage = null,
}: {
  sourceLibraryGroups?: Array<{
    id: string;
    label: string;
    items: Array<{
      slug: string;
      label: string;
      count: number;
      groupId?: string;
    }>;
  }>;
  groups?: Array<{
    id?: string;
    label: string;
    items: Array<{
      slug: string;
      label: string;
      count: number;
      groupId?: string;
    }>;
  }>;
  totalCollections: number;
  totalDocs: number;
  isAddingGroup?: boolean;
  newGroupLabel?: string;
  onStartAddGroup?: () => void;
  onCancelAddGroup?: () => void;
  onChangeNewGroupLabel?: (value: string) => void;
  onSubmitNewGroup?: () => void;
  editingGroupId?: string | null;
  editingGroupLabel?: string;
  onStartRenameGroup?: (groupId: string, currentLabel: string) => void;
  onCancelRenameGroup?: () => void;
  onChangeEditingGroupLabel?: (value: string) => void;
  onSubmitRenameGroup?: (groupId: string, currentLabel: string) => void;
  confirmingDeleteGroupId?: string | null;
  onRequestDeleteGroup?: (groupId: string) => void;
  onCancelDeleteGroup?: () => void;
  onConfirmDeleteGroup?: (groupId: string) => void;
  confirmingHideCategorySlug?: string | null;
  onRequestHideCategory?: (categorySlug: string) => void;
  onCancelHideCategory?: () => void;
  onConfirmHideCategory?: (categorySlug: string) => void;
  onMoveCategory?: (categorySlug: string, groupId: string) => void;
  busyKey?: string | null;
  isPending?: boolean;
  errorMessage?: string | null;
}) {
  const resolvedGroups = (sourceLibraryGroups ?? groups ?? []).map((group) => ({
    ...group,
    id:
      group.id ??
      (group.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') ||
        'ungrouped'),
    items: group.items.map((item) => ({
      ...item,
      groupId: item.groupId ?? group.id ?? 'ungrouped',
    })),
  }));

  return (
    <StageShell
      variant="archive"
      contentVariant="archive"
      innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.5rem' }}
    >
      <QuietScene tone="atlas">
        <QuietSceneColumn>
          <PageFrame
            eyebrow="Sources"
            title="Sources"
            description={
              <>
                <span>
                  {totalCollections} collections · {totalDocs} docs
                </span>
                <br />
                Your sources, grouped. Grouping changes affect Loom metadata only. Original source
                files stay unchanged.
              </>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              {errorMessage && (
                <div className="t-caption2" style={{ color: 'var(--tint-red)' }}>
                  {errorMessage}
                </div>
              )}

              {resolvedGroups.map((group) => {
                const empty = group.items.length === 0;
                return (
                  <div
                    key={group.id}
                    className={
                      empty ? 'loom-atlas-group loom-atlas-group-empty' : 'loom-atlas-group'
                    }
                    data-group-drop-target={group.id}
                    onDragOver={(event) => {
                      if (!event.dataTransfer.types.includes('application/x-loom-category-slug'))
                        return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      event.currentTarget.setAttribute('data-drop-active', 'true');
                    }}
                    onDragLeave={(event) => {
                      const related = event.relatedTarget as Node | null;
                      if (related && event.currentTarget.contains(related)) return;
                      event.currentTarget.removeAttribute('data-drop-active');
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.currentTarget.removeAttribute('data-drop-active');
                      const slug = event.dataTransfer.getData('application/x-loom-category-slug');
                      if (slug) onMoveCategory(slug, group.id);
                    }}
                  >
                    {empty ? (
                      <div
                        data-atlas-empty-group
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '0.35rem 0.2rem',
                          borderRadius: 'var(--r-1)',
                          border: 0,
                          background: 'transparent',
                          color: 'var(--muted)',
                          flexWrap: 'wrap',
                        }}
                      >
                        <WorkEyebrow subtle>{group.label}</WorkEyebrow>
                        <span className="t-caption2" style={{ color: 'var(--muted)' }}>
                          empty · drop a card here
                        </span>
                        {group.id !== 'ungrouped' && editingGroupId !== group.id && (
                          <div
                            className="loom-atlas-group-actions"
                            style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}
                          >
                            <button
                              type="button"
                              onClick={() => onStartRenameGroup(group.id, group.label)}
                              style={groupActionStyle}
                              aria-busy={busyKey === `group:rename:${group.id}` || isPending}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              onClick={() => onRequestDeleteGroup(group.id)}
                              style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
                              aria-busy={busyKey === `group:delete:${group.id}` || isPending}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                        {editingGroupId === group.id && (
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              onSubmitRenameGroup(group.id, group.label);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              flexWrap: 'wrap',
                              marginLeft: 'auto',
                            }}
                          >
                            <input
                              value={editingGroupLabel}
                              onChange={(event) => onChangeEditingGroupLabel(event.target.value)}
                              aria-label={`Rename ${group.label}`}
                              style={groupInputStyle}
                              autoFocus
                            />
                            <button
                              type="submit"
                              style={groupActionStyle}
                              aria-busy={busyKey === `group:rename:${group.id}` || isPending}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={onCancelRenameGroup}
                              style={groupActionStyle}
                            >
                              Cancel
                            </button>
                          </form>
                        )}
                      </div>
                    ) : (
                      <WorkSurface
                        tone="flat"
                        density="regular"
                        style={{ paddingLeft: 0, paddingRight: 0 }}
                      >
                        <header
                          style={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'space-between',
                            gap: 16,
                            flexWrap: 'wrap',
                            marginBottom: 14,
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <WorkEyebrow subtle>{group.label}</WorkEyebrow>
                            {editingGroupId === group.id ? (
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  onSubmitRenameGroup(group.id, group.label);
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <input
                                  value={editingGroupLabel}
                                  onChange={(event) =>
                                    onChangeEditingGroupLabel(event.target.value)
                                  }
                                  aria-label={`Rename ${group.label}`}
                                  style={groupInputStyle}
                                  autoFocus
                                />
                                <button
                                  type="submit"
                                  style={groupActionStyle}
                                  aria-busy={busyKey === `group:rename:${group.id}` || isPending}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={onCancelRenameGroup}
                                  style={groupActionStyle}
                                >
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <div
                                style={{
                                  fontFamily: 'var(--display)',
                                  fontSize: '1.1rem',
                                  fontWeight: 600,
                                  letterSpacing: '-0.02em',
                                  color: 'var(--fg)',
                                }}
                              >
                                {formatCount(group.items.length, 'collection')}
                              </div>
                            )}
                          </div>
                          {group.id !== 'ungrouped' && editingGroupId !== group.id && (
                            <div
                              className="loom-atlas-group-actions"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                flexWrap: 'wrap',
                              }}
                            >
                              {confirmingDeleteGroupId === group.id ? (
                                <>
                                  <div className="t-caption2" style={{ color: 'var(--muted)' }}>
                                    Delete this group? Items move back to Ungrouped.
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => onConfirmDeleteGroup(group.id)}
                                    style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
                                    aria-busy={busyKey === `group:delete:${group.id}` || isPending}
                                  >
                                    Delete now
                                  </button>
                                  <button
                                    type="button"
                                    onClick={onCancelDeleteGroup}
                                    style={groupActionStyle}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => onStartRenameGroup(group.id, group.label)}
                                    style={groupActionStyle}
                                    aria-busy={busyKey === `group:rename:${group.id}` || isPending}
                                  >
                                    Rename
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onRequestDeleteGroup(group.id)}
                                    style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
                                    aria-busy={busyKey === `group:delete:${group.id}` || isPending}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </header>

                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                          }}
                        >
                          {group.items.map((item) => (
                            <CollectionCard
                              key={item.slug}
                              item={item}
                              allGroups={resolvedGroups}
                              onMoveCategory={onMoveCategory}
                              confirmingHide={confirmingHideCategorySlug === item.slug}
                              onRequestHideCategory={onRequestHideCategory}
                              onCancelHideCategory={onCancelHideCategory}
                              onConfirmHideCategory={onConfirmHideCategory}
                              busy={
                                busyKey === `membership:${item.slug}` ||
                                busyKey === `category:hide:${item.slug}` ||
                                isPending
                              }
                            />
                          ))}
                        </div>
                      </WorkSurface>
                    )}
                  </div>
                );
              })}

              {/* Add group as end-of-list affordance — not a floating button. */}
              {isAddingGroup ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSubmitNewGroup();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0.55rem 1rem',
                    borderRadius: 'var(--r-2)',
                    border: '0.5px dashed var(--mat-border)',
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    value={newGroupLabel}
                    onChange={(event) => onChangeNewGroupLabel(event.target.value)}
                    placeholder="New group name"
                    aria-label="New group name"
                    style={groupInputStyle}
                    autoFocus
                  />
                  <button
                    type="submit"
                    style={groupActionStyle}
                    aria-busy={busyKey === 'group:add' || isPending}
                  >
                    Create group
                  </button>
                  <button type="button" onClick={onCancelAddGroup} style={groupActionStyle}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={onStartAddGroup}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '0.55rem 1rem',
                    borderRadius: 'var(--r-2)',
                    border: '0.5px dashed var(--mat-border)',
                    background: 'transparent',
                    color: 'var(--muted)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    letterSpacing: '0.01em',
                    cursor: 'pointer',
                    transition: 'color 0.15s var(--ease), border-color 0.15s var(--ease)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--fg-secondary)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--fg-secondary)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--mat-border)';
                  }}
                  aria-busy={busyKey === 'group:add' || isPending}
                >
                  Add group
                </button>
              )}
            </div>
          </PageFrame>
        </QuietSceneColumn>
      </QuietScene>
      <style>{`
        .loom-atlas-group .loom-atlas-group-actions {
          opacity: 0;
          transition: opacity 0.16s var(--ease);
        }
        .loom-atlas-group:hover .loom-atlas-group-actions,
        .loom-atlas-group:focus-within .loom-atlas-group-actions {
          opacity: 1;
        }
        .loom-atlas-group[data-drop-active="true"] > :first-child {
          outline: 2px dashed var(--accent);
          outline-offset: -2px;
          background: color-mix(in srgb, var(--accent-soft) 60%, transparent);
          transition: outline 0.12s var(--ease), background 0.12s var(--ease);
        }
        .loom-atlas-card:hover .loom-atlas-card-remove,
        .loom-atlas-card:focus-within .loom-atlas-card-remove {
          opacity: 1;
          color: var(--tint-red);
          background: color-mix(in srgb, var(--tint-red) 10%, transparent);
        }
        .loom-atlas-card:hover .loom-atlas-card-move,
        .loom-atlas-card:focus-within .loom-atlas-card-move {
          opacity: 0.85;
          pointer-events: auto;
        }
      `}</style>
    </StageShell>
  );
}

const groupActionStyle = {
  border: '0.5px solid var(--mat-border)',
  background: 'transparent',
  color: 'var(--muted)',
  borderRadius: 999,
  padding: '0.34rem 0.7rem',
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.01em',
  cursor: 'default',
  opacity: 0.76,
} satisfies CSSProperties;

const groupInputStyle = {
  minWidth: 220,
  border: '0.5px solid var(--mat-border)',
  background: 'color-mix(in srgb, var(--bg) 90%, transparent)',
  color: 'var(--fg)',
  borderRadius: 'var(--r-2)',
  padding: '0.42rem 0.62rem',
  fontSize: '0.8rem',
} satisfies CSSProperties;

function CollectionCard({
  item,
  allGroups,
  confirmingHide,
  onRequestHideCategory,
  onCancelHideCategory,
  onConfirmHideCategory,
  onMoveCategory,
  busy,
}: {
  item: {
    slug: string;
    label: string;
    count: number;
    groupId?: string;
  };
  allGroups: Array<{
    id: string;
    label: string;
  }>;
  confirmingHide: boolean;
  onRequestHideCategory: (categorySlug: string) => void;
  onCancelHideCategory: () => void;
  onConfirmHideCategory: (categorySlug: string) => void;
  onMoveCategory: (categorySlug: string, groupId: string) => void;
  busy: boolean;
}) {
  return (
    <div
      className="loom-atlas-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-loom-category-slug', item.slug);
        e.dataTransfer.setData('text/plain', item.label);
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).style.opacity = '0.5';
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '';
      }}
      style={{
        position: 'relative',
        display: 'block',
        color: 'var(--fg)',
        borderBottom: '0.5px solid var(--hair, rgba(26,23,18,0.06))',
        background: 'transparent',
        transition: 'color 200ms ease-out, padding-left 200ms ease-out',
        cursor: 'grab',
      }}
    >
      <button
        type="button"
        className="loom-atlas-card-remove"
        onClick={() => onConfirmHideCategory(item.slug)}
        aria-label={`Remove ${item.label} from Sources`}
        title="Remove from Sources (original file stays)"
        style={{
          position: 'absolute',
          top: '0.9rem',
          right: 0,
          appearance: 'none',
          border: 0,
          background: 'transparent',
          color: 'var(--muted)',
          cursor: 'pointer',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.9rem',
          lineHeight: 1,
          opacity: 0.32,
          transition: 'opacity 0.15s var(--ease), color 0.15s var(--ease)',
          zIndex: 2,
        }}
      >
        ×
      </button>

      <Link
        href={`/knowledge/${item.slug}`}
        style={{
          display: 'block',
          textDecoration: 'none',
          color: 'inherit',
          padding: '0.875rem 2rem 0.875rem 0',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: '1.25rem',
            lineHeight: 1.18,
            color: 'var(--fg)',
            letterSpacing: '-0.015em',
          }}
        >
          {item.label}
        </div>
        <div
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: '0.82rem',
            color: 'var(--muted)',
            marginTop: '0.35rem',
          }}
        >
          {formatCount(item.count, 'doc')}
          <span style={{ margin: '0 0.4em' }}>·</span>
          <span>Open collection</span>
        </div>
      </Link>

      {allGroups.length > 1 && (
        <select
          className="loom-atlas-card-move"
          value={item.groupId ?? 'ungrouped'}
          onChange={(event) => onMoveCategory(item.slug, event.target.value)}
          disabled={busy}
          aria-label="Move to group"
          style={{
            position: 'absolute',
            bottom: '0.6rem',
            right: 0,
            border: 0,
            background: 'transparent',
            color: 'var(--muted)',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: '0.72rem',
            padding: '2px 4px',
            cursor: 'pointer',
            opacity: 0,
            pointerEvents: 'none',
            transition: 'opacity 0.15s var(--ease)',
            zIndex: 2,
          }}
        >
          {allGroups.map((group) => (
            <option key={group.id} value={group.id}>
              Move → {group.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

const groupSelectStyle = {
  width: '100%',
  border: '0.5px solid var(--mat-border)',
  background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
  color: 'var(--fg)',
  borderRadius: 'var(--r-2)',
  padding: '0.42rem 0.55rem',
  fontSize: '0.78rem',
} satisfies CSSProperties;
