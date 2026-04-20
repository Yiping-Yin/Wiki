'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { PatternSwatch } from '../../components/PatternSwatch';
import { QuietScene, QuietSceneColumn } from '../../components/QuietScene';
import { QuietSceneIntro } from '../../components/QuietSceneIntro';
import { StageShell } from '../../components/StageShell';
import { WorkEyebrow, textActionStyle, WorkSurface } from '../../components/WorkSurface';

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
    id: group.id ?? (group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ungrouped'),
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
          <QuietSceneIntro
            eyebrow="Atlas"
            title="Sources"
            meta={
              <span>
                {totalCollections} collections · {totalDocs} docs
              </span>
            }
            summary="Your source library, grouped. Grouping changes only affect Loom metadata — original files are untouched."
          />
        </QuietSceneColumn>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 4 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {isAddingGroup ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onSubmitNewGroup();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
              >
                <input
                  value={newGroupLabel}
                  onChange={(event) => onChangeNewGroupLabel(event.target.value)}
                  placeholder="New group name"
                  aria-label="New group name"
                  style={groupInputStyle}
                  autoFocus
                />
                <button type="submit" style={groupActionStyle} aria-busy={busyKey === 'group:add' || isPending}>
                  Create
                </button>
                <button type="button" onClick={onCancelAddGroup} style={groupActionStyle}>
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={onStartAddGroup}
                style={groupActionStyle}
                aria-busy={busyKey === 'group:add' || isPending}
              >
                + Add group
              </button>
            )}
          </div>
          {errorMessage && (
            <div className="t-caption2" style={{ color: 'var(--tint-red)' }}>
              {errorMessage}
            </div>
          )}

          {resolvedGroups.map((group) => (
            <div key={group.id} className="loom-atlas-group">
            <WorkSurface tone="quiet" density="regular">
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
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
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
                      <button type="button" onClick={onCancelRenameGroup} style={groupActionStyle}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <div
                      style={{
                        fontFamily: 'var(--display)',
                        fontSize: '1.1rem',
                        fontWeight: 620,
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
                    style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
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
                        <button type="button" onClick={onCancelDeleteGroup} style={groupActionStyle}>
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
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 12,
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
                      busyKey === `membership:${item.slug}`
                      || busyKey === `category:hide:${item.slug}`
                      || isPending
                    }
                  />
                ))}
              </div>
            </WorkSurface>
            </div>
          ))}
        </div>
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
        .loom-atlas-card .loom-atlas-card-actions {
          opacity: 0;
          transition: opacity 0.16s var(--ease);
          pointer-events: none;
        }
        .loom-atlas-card:hover .loom-atlas-card-actions,
        .loom-atlas-card:focus-within .loom-atlas-card-actions {
          opacity: 1;
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '0.92rem 0.98rem',
        color: 'var(--fg)',
        borderRadius: 'var(--r-3)',
        border: '0.5px solid color-mix(in srgb, var(--mat-border) 84%, transparent)',
        background: 'color-mix(in srgb, var(--mat-thick-bg) 78%, transparent)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.28)',
        transition: 'transform 0.18s var(--ease), border-color 0.18s var(--ease), box-shadow 0.18s var(--ease)',
      }}
    >
      <Link
        href={`/knowledge/${item.slug}`}
        style={{ display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'inherit' }}
      >
        <PatternSwatch categorySlug={item.slug} height={32} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              color: 'var(--fg)',
              fontFamily: 'var(--display)',
              fontSize: '0.98rem',
              fontWeight: 560,
              letterSpacing: '-0.015em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </div>
          <div className="t-caption2" style={{ color: 'var(--muted)' }}>
            {formatCount(item.count, 'doc')}
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          <span style={textActionStyle(true)}>Open →</span>
        </div>
      </Link>

      {confirmingHide ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, paddingTop: 8, borderTop: '0.5px solid var(--mat-border)' }}>
          <div className="t-caption2" style={{ color: 'var(--muted)' }}>
            Remove this source from Atlas? Original files stay unchanged.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => onConfirmHideCategory(item.slug)}
              style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
            >
              Remove now
            </button>
            <button type="button" onClick={onCancelHideCategory} style={groupActionStyle}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="loom-atlas-card-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            paddingTop: 8,
            borderTop: '0.5px solid var(--mat-border)',
            flexWrap: 'wrap',
          }}
        >
          <select
            value={item.groupId ?? 'ungrouped'}
            onChange={(event) => onMoveCategory(item.slug, event.target.value)}
            disabled={busy}
            aria-label="Move to group"
            style={{ ...groupSelectStyle, flex: 1, minWidth: 110 }}
          >
            {allGroups.map((group) => (
              <option key={group.id} value={group.id}>
                Move → {group.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onRequestHideCategory(item.slug)}
            style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
          >
            Remove
          </button>
        </div>
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
