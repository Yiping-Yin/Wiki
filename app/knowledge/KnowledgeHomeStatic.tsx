'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { QuietScene, QuietSceneColumn } from '../../components/QuietScene';
import { PageFrame } from '../../components/PageFrame';
import { StageShell } from '../../components/StageShell';

type SourceLibraryItem = {
  slug: string;
  label: string;
  count: number;
  groupId?: string;
};

type SourceLibraryGroup = {
  id?: string;
  label: string;
  items: SourceLibraryItem[];
};

type ResolvedSourceLibraryGroup = {
  id: string;
  label: string;
  items: Array<SourceLibraryItem & { groupId: string }>;
};

type MaterialProfile = {
  className: string;
  label: string;
  kind: string;
  origin: string;
};

const MATERIAL_PROFILES: MaterialProfile[] = [
  {
    className: 'loom-source-sample--bookcloth',
    label: 'bookcloth',
    kind: 'bound source',
    origin: 'library accession',
  },
  {
    className: 'loom-source-sample--paper',
    label: 'cotton paper',
    kind: 'notes and leaves',
    origin: 'working papers',
  },
  {
    className: 'loom-source-sample--wool',
    label: 'dark wool',
    kind: 'technical wiki',
    origin: 'deep reference',
  },
  {
    className: 'loom-source-sample--leather',
    label: 'leather edge',
    kind: 'curated source',
    origin: 'kept canon',
  },
];

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
  sourceLibraryGroups?: SourceLibraryGroup[];
  groups?: SourceLibraryGroup[];
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
  const resolvedGroups: ResolvedSourceLibraryGroup[] = (sourceLibraryGroups ?? groups ?? []).map(
    (group) => {
      const id =
        group.id ??
        (group.label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') ||
          'ungrouped');

      return {
        ...group,
        id,
        items: group.items.map((item) => ({
          ...item,
          groupId: item.groupId ?? id,
        })),
      };
    },
  );

  return (
    <StageShell
      variant="archive"
      contentVariant="archive"
      innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.5rem' }}
    >
      <QuietScene tone="atlas">
        <QuietSceneColumn style={{ width: 'min(100%, var(--archive-stage-width))' }}>
          <PageFrame
            eyebrow="Sources"
            title="Sources"
            description={
              <>
                <span>
                  {formatCount(totalCollections, 'shelf')} / {formatCount(totalDocs, 'indexed source')}
                </span>
                <br />
                Arrange source-library categories as archive shelves. Re-shelving changes Loom
                provenance only; original source files stay unchanged.
              </>
            }
          >
            <div className="loom-source-cabinet" aria-label="Sources archive cabinet">
              {errorMessage && (
                <div className="loom-source-cabinet__error" role="status">
                  {errorMessage}
                </div>
              )}

              {resolvedGroups.map((group, index) => {
                const empty = group.items.length === 0;
                const isEditing = editingGroupId === group.id;
                const isDeleting = confirmingDeleteGroupId === group.id;

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
                    <section
                      className={
                        empty ? 'loom-archive-shelf loom-archive-shelf--empty' : 'loom-archive-shelf'
                      }
                    >
                      <div className="loom-archive-shelf__spine" aria-hidden="true" />
                      <div className="loom-archive-shelf__body">
                        <header className="loom-archive-shelf__header">
                          <div className="loom-archive-shelf__identity">
                            <div className="loom-archive-shelf__accession">
                              <span>Shelf {formatOrdinal(index + 1)}</span>
                              <span>{empty ? 'open drawer' : 'accessioned drawer'}</span>
                            </div>

                            {isEditing ? (
                              <form
                                className="loom-shelf-editor"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  onSubmitRenameGroup(group.id, group.label);
                                }}
                              >
                                <input
                                  value={editingGroupLabel}
                                  onChange={(event) =>
                                    onChangeEditingGroupLabel(event.target.value)
                                  }
                                  aria-label={`Relabel ${group.label}`}
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
                              <>
                                <h2>{group.label}</h2>
                                <p>{shelfProvenance(group)}</p>
                              </>
                            )}
                          </div>

                          <div className="loom-archive-shelf__meta">
                            <span className="loom-archive-shelf__count">
                              {formatCount(group.items.length, 'collection')}
                            </span>
                            {group.id !== 'ungrouped' && !isEditing && (
                              <div
                                className={
                                  isDeleting
                                    ? 'loom-archive-shelf__actions loom-archive-shelf__actions--open'
                                    : 'loom-archive-shelf__actions'
                                }
                              >
                                {isDeleting ? (
                                  <>
                                    <span>Remove shelf? Items return to Ungrouped.</span>
                                    <button
                                      type="button"
                                      onClick={() => onConfirmDeleteGroup(group.id)}
                                      style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
                                      aria-busy={
                                        busyKey === `group:delete:${group.id}` || isPending
                                      }
                                    >
                                      Remove now
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
                                      aria-busy={
                                        busyKey === `group:rename:${group.id}` || isPending
                                      }
                                    >
                                      Relabel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onRequestDeleteGroup(group.id)}
                                      style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
                                      aria-busy={
                                        busyKey === `group:delete:${group.id}` || isPending
                                      }
                                    >
                                      Remove
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </header>

                        {empty ? (
                          <div data-atlas-empty-group className="loom-archive-shelf__empty">
                            <span className="loom-archive-shelf__empty-marker" aria-hidden />
                            <span>Awaiting material</span>
                            <span>Drop a sample strip here</span>
                          </div>
                        ) : (
                          <div className="loom-archive-shelf__samples">
                            {group.items.map((item, itemIndex) => (
                              <CollectionCard
                                key={item.slug}
                                item={item}
                                itemIndex={itemIndex}
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
                        )}
                      </div>
                    </section>
                  </div>
                );
              })}

              {isAddingGroup ? (
                <form
                  className="loom-new-shelf"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSubmitNewGroup();
                  }}
                >
                  <input
                    value={newGroupLabel}
                    onChange={(event) => onChangeNewGroupLabel(event.target.value)}
                    placeholder="New shelf name"
                    aria-label="New shelf name"
                    style={groupInputStyle}
                    autoFocus
                  />
                  <button
                    type="submit"
                    style={groupActionStyle}
                    aria-busy={busyKey === 'group:add' || isPending}
                  >
                    Create shelf
                  </button>
                  <button type="button" onClick={onCancelAddGroup} style={groupActionStyle}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={onStartAddGroup}
                  className="loom-new-shelf-button"
                  aria-busy={busyKey === 'group:add' || isPending}
                >
                  New shelf
                </button>
              )}
            </div>
          </PageFrame>
        </QuietSceneColumn>
      </QuietScene>
      <style>{`
        .loom-source-cabinet {
          --material-linen: #D8CEB8;
          --material-bookcloth: #B9A98C;
          --material-walnut: #6C432A;
          --material-oak: #A7794E;
          --material-brass: #B08A45;
          --material-parchment-edge: #D2C39F;
          --material-wool-shadow: rgba(58, 43, 31, 0.18);
          --material-thread-red: #7D2F2B;
          --material-horsehair: #2F2923;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .loom-source-cabinet__error {
          border-left: 2px solid var(--tint-red);
          color: var(--tint-red);
          font-size: var(--fs-small);
          padding: 0.4rem 0.7rem;
          background: color-mix(in srgb, var(--tint-red) 8%, transparent);
        }

        .loom-archive-shelf {
          position: relative;
          display: grid;
          grid-template-columns: 12px minmax(0, 1fr);
          min-height: 118px;
          border: 0.5px solid color-mix(in srgb, var(--mat-border) 82%, transparent);
          border-radius: 8px;
          overflow: hidden;
          background:
            linear-gradient(90deg, rgba(108, 67, 42, 0.12), transparent 18%),
            linear-gradient(180deg, color-mix(in srgb, var(--bg-elevated) 80%, var(--material-linen) 20%), color-mix(in srgb, var(--bg) 82%, var(--material-parchment-edge) 18%));
          box-shadow:
            inset 0 1px 0 rgba(255, 252, 238, 0.56),
            inset 0 -1px 0 rgba(108, 67, 42, 0.08),
            0 10px 28px rgba(42, 37, 32, 0.045);
          transition: border-color var(--dur-2) var(--ease), box-shadow var(--dur-2) var(--ease);
        }

        .loom-archive-shelf::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.18;
          background:
            repeating-linear-gradient(90deg, rgba(42, 37, 32, 0.08) 0 1px, transparent 1px 8px),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.2) 0 1px, transparent 1px 10px);
          mix-blend-mode: multiply;
        }

        .loom-archive-shelf__spine {
          position: relative;
          z-index: 1;
          background:
            linear-gradient(180deg, var(--material-walnut), var(--material-oak) 48%, var(--material-walnut)),
            repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.12) 0 1px, transparent 1px 7px);
          border-right: 0.5px solid rgba(42, 37, 32, 0.16);
        }

        .loom-archive-shelf__spine::after {
          content: "";
          position: absolute;
          top: 16px;
          bottom: 16px;
          right: -1px;
          width: 2px;
          background: linear-gradient(180deg, transparent, var(--material-brass), transparent);
          opacity: 0.72;
        }

        .loom-archive-shelf__body {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          gap: 14px;
          min-width: 0;
          padding: 1rem 1rem 0.9rem;
        }

        .loom-archive-shelf__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .loom-archive-shelf__identity {
          min-width: 0;
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 7px;
        }

        .loom-archive-shelf__accession {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          color: var(--accent-text);
          font-family: var(--mono);
          font-size: 0.64rem;
          line-height: 1.2;
          text-transform: uppercase;
          letter-spacing: 0;
        }

        .loom-archive-shelf__accession span + span {
          color: var(--muted);
        }

        .loom-archive-shelf h2 {
          margin: 0;
          color: var(--fg);
          font-family: var(--display);
          font-size: clamp(1.18rem, 2vw, 1.48rem);
          font-style: italic;
          font-weight: 500;
          line-height: 1.08;
          letter-spacing: 0;
        }

        .loom-archive-shelf p {
          margin: 0;
          max-width: 34rem;
          color: var(--fg-secondary);
          font-family: var(--serif);
          font-size: 0.83rem;
          font-style: italic;
          line-height: 1.45;
        }

        .loom-archive-shelf__meta {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          justify-content: flex-end;
          flex-wrap: wrap;
          flex-shrink: 0;
        }

        .loom-archive-shelf__count {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          border-top: 0.5px solid color-mix(in srgb, var(--material-brass) 48%, transparent);
          color: var(--muted);
          font-family: var(--serif);
          font-size: 0.75rem;
          font-style: italic;
          line-height: 1;
          white-space: nowrap;
        }

        .loom-archive-shelf__actions {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          opacity: 0;
          transition: opacity var(--dur-2) var(--ease);
        }

        .loom-archive-shelf__actions span {
          color: var(--muted);
          font-size: var(--fs-caption);
        }

        .loom-atlas-group:hover .loom-archive-shelf__actions,
        .loom-atlas-group:focus-within .loom-archive-shelf__actions,
        .loom-archive-shelf__actions--open {
          opacity: 1;
        }

        .loom-archive-shelf__samples {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .loom-archive-shelf__empty {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 52px;
          color: var(--muted);
          font-family: var(--serif);
          font-size: 0.82rem;
          font-style: italic;
          border-top: 0.5px solid color-mix(in srgb, var(--mat-border) 70%, transparent);
          padding-top: 0.55rem;
          flex-wrap: wrap;
        }

        .loom-archive-shelf__empty-marker {
          width: 26px;
          height: 7px;
          border-radius: 1px;
          background: linear-gradient(90deg, var(--material-brass), var(--material-parchment-edge));
          opacity: 0.72;
        }

        .loom-shelf-editor,
        .loom-new-shelf {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .loom-source-sample-card {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: stretch;
          border: 0.5px solid rgba(42, 37, 32, 0.055);
          border-radius: 6px;
          overflow: hidden;
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.42), transparent 30%),
            color-mix(in srgb, var(--bg-elevated) 82%, var(--material-linen) 18%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.48);
          transition:
            border-color var(--dur-2) var(--ease),
            transform var(--dur-2) var(--ease),
            background var(--dur-2) var(--ease);
          cursor: grab;
        }

        .loom-source-sample-card:hover,
        .loom-source-sample-card:focus-within {
          border-color: color-mix(in srgb, var(--material-brass) 38%, var(--mat-border));
          transform: translateY(-1px);
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.52), transparent 32%),
            color-mix(in srgb, var(--bg-elevated) 72%, var(--material-linen) 28%);
        }

        .loom-source-sample {
          position: relative;
          display: grid;
          grid-template-columns: 14px minmax(0, 1fr);
          gap: 12px;
          min-width: 0;
          color: inherit;
          text-decoration: none;
          padding: 0.74rem 1rem 0.74rem 0.68rem;
        }

        .loom-source-sample__swatch {
          position: relative;
          width: 14px;
          min-height: 52px;
          border-radius: 2px;
          background: var(--material-bookcloth);
          box-shadow:
            inset 0 0 0 0.5px rgba(42, 37, 32, 0.14),
            inset -3px 0 rgba(42, 37, 32, 0.08);
        }

        .loom-source-sample__swatch::after {
          content: "";
          position: absolute;
          inset: 4px 3px;
          border-left: 0.5px solid rgba(255, 255, 255, 0.36);
          border-right: 0.5px solid rgba(42, 37, 32, 0.14);
        }

        .loom-source-sample--paper .loom-source-sample__swatch {
          background:
            repeating-linear-gradient(0deg, rgba(42, 37, 32, 0.08) 0 1px, transparent 1px 8px),
            var(--material-linen);
        }

        .loom-source-sample--wool .loom-source-sample__swatch {
          background:
            repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 1px, transparent 1px 5px),
            var(--material-horsehair);
        }

        .loom-source-sample--leather .loom-source-sample__swatch {
          background:
            linear-gradient(90deg, rgba(255, 255, 255, 0.16), transparent),
            var(--material-walnut);
        }

        .loom-source-sample__body {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .loom-source-sample__title {
          min-width: 0;
        }

        .loom-source-sample__title strong {
          display: block;
          overflow-wrap: anywhere;
          color: var(--fg);
          font-family: var(--display);
          font-size: 1.08rem;
          font-style: italic;
          font-weight: 500;
          line-height: 1.14;
          letter-spacing: 0;
        }

        .loom-source-sample__title span {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          margin-top: 0.28rem;
          color: var(--muted);
          font-family: var(--serif);
          font-size: 0.75rem;
          font-style: italic;
          line-height: 1.35;
        }

        .loom-source-sample__count {
          justify-self: end;
          color: var(--fg-secondary);
          font-family: var(--mono);
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .loom-source-sample__tools {
          position: relative;
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: flex-end;
          min-width: 170px;
          padding: 0.7rem 0.7rem 0.7rem 0;
        }

        .loom-source-sample__remove {
          appearance: none;
          border: 0.5px solid transparent;
          background: transparent;
          color: var(--muted);
          width: 28px;
          height: 28px;
          border-radius: 999px;
          cursor: pointer;
          font-size: 1rem;
          line-height: 1;
          opacity: 0;
          transition:
            opacity var(--dur-2) var(--ease),
            color var(--dur-2) var(--ease),
            background var(--dur-2) var(--ease);
        }

        .loom-source-sample-card:hover .loom-source-sample__remove,
        .loom-source-sample-card:focus-within .loom-source-sample__remove {
          opacity: 1;
        }

        .loom-source-sample__remove:hover,
        .loom-source-sample__remove:focus-visible {
          color: var(--tint-red);
          background: color-mix(in srgb, var(--tint-red) 10%, transparent);
        }

        .loom-source-sample__confirm {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 7px;
          flex-wrap: wrap;
          color: var(--muted);
          font-size: var(--fs-caption);
        }

        .loom-source-sample__move {
          position: static;
          max-width: 10.5rem;
          border: 0.5px solid color-mix(in srgb, var(--material-brass) 26%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--bg-elevated) 76%, transparent);
          color: var(--muted);
          font-family: var(--serif);
          font-size: 0.72rem;
          font-style: italic;
          padding: 0.24rem 0.46rem;
          opacity: 0.82;
          pointer-events: auto;
          transition: opacity var(--dur-2) var(--ease);
        }

        .loom-source-sample-card:hover .loom-source-sample__move,
        .loom-source-sample-card:focus-within .loom-source-sample__move {
          opacity: 1;
        }

        .loom-new-shelf,
        .loom-new-shelf-button {
          width: 100%;
          min-height: 44px;
          border: 0.5px dashed color-mix(in srgb, var(--material-brass) 38%, var(--mat-border));
          border-radius: 8px;
          background:
            linear-gradient(90deg, rgba(176, 138, 69, 0.07), transparent),
            transparent;
          color: var(--muted);
          font-family: var(--serif);
          font-size: 0.82rem;
          font-style: italic;
        }

        .loom-new-shelf {
          padding: 0.58rem 0.75rem;
        }

        .loom-new-shelf-button {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.58rem 0.75rem;
          cursor: pointer;
          transition:
            border-color var(--dur-2) var(--ease),
            color var(--dur-2) var(--ease),
            background var(--dur-2) var(--ease);
        }

        .loom-new-shelf-button:hover,
        .loom-new-shelf-button:focus-visible {
          color: var(--fg-secondary);
          border-color: color-mix(in srgb, var(--material-brass) 72%, var(--mat-border));
          background: color-mix(in srgb, var(--material-brass) 8%, transparent);
        }

        .loom-atlas-group[data-drop-active="true"] .loom-archive-shelf {
          border-color: color-mix(in srgb, var(--material-brass) 72%, var(--mat-border));
          box-shadow:
            inset 0 1px 0 rgba(255, 252, 238, 0.62),
            0 0 0 2px color-mix(in srgb, var(--material-brass) 18%, transparent),
            0 16px 34px rgba(42, 37, 32, 0.075);
        }

        @media (max-width: 720px) {
          .loom-archive-shelf {
            grid-template-columns: 9px minmax(0, 1fr);
          }

          .loom-archive-shelf__body {
            padding: 0.85rem 0.78rem;
          }

          .loom-archive-shelf__header,
          .loom-source-sample__body {
            flex-direction: column;
            display: flex;
            align-items: stretch;
          }

          .loom-archive-shelf__meta {
            justify-content: flex-start;
          }

          .loom-source-sample-card {
            grid-template-columns: minmax(0, 1fr);
          }

          .loom-source-sample {
            grid-template-columns: 12px minmax(0, 1fr);
            padding-right: 0.78rem;
          }

          .loom-source-sample__tools {
            justify-content: flex-start;
            min-width: 0;
            padding: 0 0.78rem 0.7rem 2.45rem;
          }

          .loom-source-sample__count {
            justify-self: start;
          }

          .loom-source-sample__move {
            position: static;
            opacity: 1;
            pointer-events: auto;
          }
        }
      `}</style>
    </StageShell>
  );
}

const groupActionStyle = {
  border: '0.5px solid var(--mat-border)',
  background: 'color-mix(in srgb, var(--bg-elevated) 70%, transparent)',
  color: 'var(--muted)',
  borderRadius: 6,
  padding: '0.34rem 0.62rem',
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: 0,
  cursor: 'pointer',
} satisfies CSSProperties;

const groupInputStyle = {
  minWidth: 220,
  border: '0.5px solid var(--mat-border)',
  background: 'color-mix(in srgb, var(--bg) 90%, transparent)',
  color: 'var(--fg)',
  borderRadius: 6,
  padding: '0.42rem 0.62rem',
  fontSize: '0.8rem',
} satisfies CSSProperties;

function CollectionCard({
  item,
  itemIndex,
  allGroups,
  confirmingHide,
  onRequestHideCategory,
  onCancelHideCategory,
  onConfirmHideCategory,
  onMoveCategory,
  busy,
}: {
  item: SourceLibraryItem & { groupId: string };
  itemIndex: number;
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
  const material = materialForItem(item);

  return (
    <div
      className="loom-source-sample-card loom-atlas-card"
      draggable
      title="Drag to another shelf, or use the Re-shelve menu."
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-loom-category-slug', item.slug);
        e.dataTransfer.setData('text/plain', item.label);
        e.dataTransfer.effectAllowed = 'move';
        (e.currentTarget as HTMLElement).style.opacity = '0.5';
      }}
      onDragEnd={(e) => {
        (e.currentTarget as HTMLElement).style.opacity = '';
      }}
    >
      <Link
        href={`/knowledge/${item.slug}`}
        className={`loom-source-sample ${material.className}`}
        aria-label={`Open shelf ${item.label}`}
      >
        <span className="loom-source-sample__swatch" aria-label={`${material.label} sample`} />
        <span className="loom-source-sample__body">
          <span className="loom-source-sample__title">
            <strong>{item.label}</strong>
            <span>
              <span>{material.origin}</span>
              <span>{material.kind}</span>
              <span>sample {formatOrdinal(itemIndex + 1)}</span>
            </span>
          </span>
          <span className="loom-source-sample__count">{formatCount(item.count, 'source')}</span>
        </span>
      </Link>

      <div className="loom-source-sample__tools">
        {confirmingHide ? (
          <div className="loom-source-sample__confirm">
            <span>Hide from shelves?</span>
            <button
              type="button"
              onClick={() => onConfirmHideCategory(item.slug)}
              style={{ ...groupActionStyle, color: 'var(--tint-red)' }}
              aria-busy={busy}
            >
              Hide
            </button>
            <button type="button" onClick={onCancelHideCategory} style={groupActionStyle}>
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="loom-source-sample__remove"
            onClick={() => onRequestHideCategory(item.slug)}
            aria-label={`Hide ${item.label} from shelves`}
            title="Hide from shelves (original files stay read-only)"
            aria-busy={busy}
          >
            x
          </button>
        )}

        {allGroups.length > 1 && (
          <select
            className="loom-source-sample__move loom-atlas-card-move"
            value={item.groupId ?? 'ungrouped'}
            onChange={(event) => onMoveCategory(item.slug, event.target.value)}
            disabled={busy}
            aria-label="Re-shelve source"
          >
            {allGroups.map((group) => (
              <option key={group.id} value={group.id}>
                Re-shelve to {group.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function materialForItem(item: SourceLibraryItem): MaterialProfile {
  const key = `${item.slug} ${item.label}`.toLowerCase();
  if (/wiki|llm|model|transformer|attention|reason|react|tool|agent/.test(key)) {
    return MATERIAL_PROFILES[2];
  }
  if (/pdf|book|paper|chapter|course|reading|reader/.test(key)) {
    return MATERIAL_PROFILES[0];
  }
  if (/canon|brief|curated|manual|guide|spec|design/.test(key)) {
    return MATERIAL_PROFILES[3];
  }

  return MATERIAL_PROFILES[stableHash(key) % MATERIAL_PROFILES.length];
}

function shelfProvenance(group: ResolvedSourceLibraryGroup) {
  if (group.items.length === 0) {
    return 'No source category is shelved here yet. Original files remain in their source locations.';
  }

  return `${formatCount(group.items.length, 'category')} held as material samples. Counts stay trailing; provenance stays foreground.`;
}

function stableHash(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function formatOrdinal(value: number) {
  return value.toString().padStart(2, '0');
}

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
