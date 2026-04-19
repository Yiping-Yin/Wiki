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
            title="Raw sources stay quiet until a thread warms them."
            meta={
              <span>
                {totalCollections} collections · {totalDocs} docs
              </span>
            }
            summary="Browse the grouped raw-source library below. Each swatch is woven from actual panel and weave activity, so the Atlas stays grounded in work rather than decorative chrome."
          />
        </QuietSceneColumn>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 4 }}>
          <WorkSurface tone="quiet" density="regular">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div className="t-caption2" style={{ color: 'var(--muted)' }}>
                Grouping changes affect Loom metadata only. Original source files stay unchanged.
              </div>
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
                    placeholder="New source-library group"
                    aria-label="New source-library group"
                    style={groupInputStyle}
                  />
                  <button type="submit" style={groupActionStyle} aria-busy={busyKey === 'group:add' || isPending}>
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
                  style={groupActionStyle}
                  aria-busy={busyKey === 'group:add' || isPending}
                >
                  Add group
                </button>
              )}
            </div>
            {errorMessage && (
              <div className="t-caption2" style={{ color: 'var(--tint-red)', marginTop: 10 }}>
                {errorMessage}
              </div>
            )}
          </WorkSurface>

          {resolvedGroups.map((group) => (
            <WorkSurface key={group.id} tone="quiet" density="regular">
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {group.id !== 'ungrouped' && (
                    <button
                      type="button"
                      onClick={() => onStartRenameGroup(group.id, group.label)}
                      style={groupActionStyle}
                      aria-busy={busyKey === `group:rename:${group.id}` || isPending}
                    >
                      Rename group
                    </button>
                  )}
                  {group.id !== 'ungrouped' &&
                    (confirmingDeleteGroupId === group.id ? (
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
                      <button
                        type="button"
                        onClick={() => onRequestDeleteGroup(group.id)}
                        style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
                        aria-busy={busyKey === `group:delete:${group.id}` || isPending}
                      >
                        Delete group
                      </button>
                    ))}
                  <div className="t-caption2" style={{ color: 'var(--muted)' }}>
                    Start anywhere. Return when a thread changes.
                  </div>
                </div>
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
                    busy={busyKey === `membership:${item.slug}` || isPending}
                  />
                ))}
              </div>
            </WorkSurface>
          ))}
        </div>
      </QuietScene>
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
  onMoveCategory: (categorySlug: string, groupId: string) => void;
  busy: boolean;
}) {
  return (
    <div
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
        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div className="t-caption2" style={{ color: 'var(--muted)' }}>
            Open collection
          </div>
          <span style={textActionStyle(true)}>Enter</span>
        </div>
      </Link>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
        <label className="t-caption2" style={{ color: 'var(--muted)' }}>
          Move to group
        </label>
        <select
          value={item.groupId ?? 'ungrouped'}
          onChange={(event) => onMoveCategory(item.slug, event.target.value)}
          disabled={busy}
          style={groupSelectStyle}
        >
          {allGroups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label}
            </option>
          ))}
        </select>
      </div>
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
