'use client';

import type { CSSProperties } from 'react';
import { QuietScene, QuietSceneColumn } from '../../components/QuietScene';
import { PageFrame } from '../../components/PageFrame';
import { StageShell } from '../../components/StageShell';

type SourceLibraryItem = {
  slug: string;
  label: string;
  count: number;
  groupId?: string;
  href?: string;
  extractedCount?: number;
  pendingCount?: number;
  latestDocTitle?: string;
  latestDocHref?: string;
};

type SourceLibraryGroup = {
  id?: string;
  label: string;
  items: SourceLibraryItem[];
};

type ResolvedSourceLibraryItem = SourceLibraryItem & {
  groupId: string;
  href: string;
  extractedCount: number;
  pendingCount: number;
};

type ResolvedSourceLibraryGroup = {
  id: string;
  label: string;
  items: ResolvedSourceLibraryItem[];
};

type SourceRecentItem = {
  href: string;
  title: string;
  at?: number | string;
};

type SourceWritingEntry = {
  id: string;
  title: string;
  href: string;
  categoryLabel?: string;
  updatedAt?: number;
  hasTidyDraft?: boolean;
  materialCount?: number;
};

export function KnowledgeHomeStatic({
  sourceLibraryGroups,
  groups,
  totalCollections,
  totalDocs,
  recentReading = [],
  writingEntries = [],
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
  recentReading?: SourceRecentItem[];
  writingEntries?: SourceWritingEntry[];
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
        items: group.items.map((item) => {
          const extractedCount = item.extractedCount ?? item.count;
          return {
            ...item,
            groupId: item.groupId ?? id,
            href: item.href ?? `#${item.slug}`,
            extractedCount,
            pendingCount: item.pendingCount ?? Math.max(0, item.count - extractedCount),
          };
        }),
      };
    },
  );

  const unorganizedItems = resolvedGroups.find((group) => group.id === 'ungrouped')?.items ?? [];
  const extractedTotal = resolvedGroups
    .flatMap((group) => group.items)
    .reduce((sum, item) => sum + item.extractedCount, 0);
  const pendingTotal = resolvedGroups
    .flatMap((group) => group.items)
    .reduce((sum, item) => sum + item.pendingCount, 0);

  return (
    <StageShell
      variant="archive"
      contentVariant="archive"
      innerStyle={{ minHeight: '100vh', paddingTop: '4.75rem', paddingBottom: '2.5rem' }}
    >
      <QuietScene tone="atlas">
        <QuietSceneColumn style={{ width: 'min(100%, var(--archive-stage-width))' }}>
          <PageFrame
            eyebrow="Archive Work Surface"
            title="Source Index"
            description={
              <>
                <span>
                  {formatCount(totalCollections, 'collection')} / {formatCount(totalDocs, 'indexed source')}
                </span>
                <br />
                A working index for read → organize → write. Grouping changes Loom
                provenance only; original source files stay unchanged.
              </>
            }
            actions={<PrimaryWritingAction writingEntries={writingEntries} />}
          >
            <div className="loom-source-index" aria-label="Source Index">
              {errorMessage && (
                <div className="loom-source-index__error" role="status">
                  {errorMessage}
                </div>
              )}

              <section className="loom-source-index__status" aria-label="Source status">
                <StatusCell label="Sources" value={formatCount(totalDocs, 'indexed source')} />
                <StatusCell label="Extracted" value={formatCount(extractedTotal, 'source')} />
                <StatusCell label="Needs review" value={formatCount(pendingTotal, 'source')} />
                <StatusCell label="Unorganized" value={formatCount(unorganizedItems.length, 'collection')} />
              </section>

              <section className="loom-source-worklist" aria-label="Current work">
                <WorkPanel title="Recent reading" empty="No recent source opened yet.">
                  {recentReading.slice(0, 5).map((item) => (
                    <WorkLink
                      key={`${item.href}:${item.at ?? ''}`}
                      href={item.href}
                      title={item.title}
                      meta={relativeTime(item.at)}
                    />
                  ))}
                </WorkPanel>

                <WorkPanel title="Unorganized" empty="No loose collections.">
                  {unorganizedItems.slice(0, 5).map((item) => (
                    <WorkLink
                      key={item.slug}
                      href={item.href}
                      title={item.label}
                      meta={`${formatCount(item.count, 'source')} · ${extractionLabel(item)}`}
                    />
                  ))}
                </WorkPanel>

                <WorkPanel title="Continue writing" empty="No writing surface waiting.">
                  {writingEntries.slice(0, 5).map((entry) => (
                    <WorkLink
                      key={entry.id}
                      href={entry.href}
                      title={entry.title}
                      meta={writingMeta(entry)}
                    />
                  ))}
                </WorkPanel>
              </section>

              <section className="loom-source-index__groups" aria-label="Source groups">
                {resolvedGroups.map((group) => {
                  const empty = group.items.length === 0;
                  const isEditing = editingGroupId === group.id;
                  const isDeleting = confirmingDeleteGroupId === group.id;

                  return (
                    <div
                      key={group.id}
                      className="loom-source-group"
                      data-group-drop-target={group.id}
                      onDragOver={(event) => {
                        if (!event.dataTransfer.types.includes('application/x-loom-category-slug')) return;
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
                      <header className="loom-source-group__header">
                        <div className="loom-source-group__identity">
                          {isEditing ? (
                            <form
                              className="loom-group-editor"
                              onSubmit={(event) => {
                                event.preventDefault();
                                onSubmitRenameGroup(group.id, group.label);
                              }}
                            >
                              <input
                                value={editingGroupLabel}
                                onChange={(event) => onChangeEditingGroupLabel(event.target.value)}
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
                              <button type="button" onClick={onCancelRenameGroup} style={groupActionStyle}>
                                Cancel
                              </button>
                            </form>
                          ) : (
                            <>
                              <h2>{group.label}</h2>
                              <p>{groupProvenance(group)}</p>
                            </>
                          )}
                        </div>

                        <div className="loom-source-group__meta">
                          <span>{formatCount(group.items.length, 'collection')}</span>
                          {group.id !== 'ungrouped' && !isEditing && (
                            <div className="loom-source-group__actions">
                              {isDeleting ? (
                                <>
                                  <span>Remove group? Collections return to Unorganized.</span>
                                  <button
                                    type="button"
                                    style={groupActionStyle}
                                    onClick={() => onConfirmDeleteGroup(group.id)}
                                    aria-busy={busyKey === `group:delete:${group.id}` || isPending}
                                  >
                                    Remove now
                                  </button>
                                  <button type="button" style={groupActionStyle} onClick={onCancelDeleteGroup}>
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    style={groupActionStyle}
                                    onClick={() => onStartRenameGroup(group.id, group.label)}
                                  >
                                    Relabel
                                  </button>
                                  <button
                                    type="button"
                                    style={groupActionStyle}
                                    onClick={() => onRequestDeleteGroup(group.id)}
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
                        <p className="loom-source-group__empty">No collections assigned here.</p>
                      ) : (
                        <div className="loom-source-group__rows">
                          {group.items.map((item) => (
                            <CollectionRow
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
                      )}
                    </div>
                  );
                })}
              </section>

              {isAddingGroup ? (
                <form
                  className="loom-new-group"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSubmitNewGroup();
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
                  className="loom-new-group-button"
                  aria-busy={busyKey === 'group:add' || isPending}
                >
                  New group
                </button>
              )}
            </div>
          </PageFrame>
        </QuietSceneColumn>
      </QuietScene>
      <style>{`
        .loom-source-index {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .loom-source-index__error {
          border-left: 2px solid var(--tint-red);
          color: var(--tint-red);
          font-size: var(--fs-small);
          padding: 0.45rem 0.75rem;
          background: color-mix(in srgb, var(--tint-red) 8%, transparent);
        }

        .loom-source-index__status,
        .loom-source-worklist {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .loom-source-status-cell,
        .loom-source-work-panel,
        .loom-source-group {
          border: 0.5px solid color-mix(in srgb, var(--mat-border) 78%, transparent);
          border-radius: 8px;
          background: color-mix(in srgb, var(--bg-elevated) 82%, transparent);
          box-shadow: 0 10px 28px rgba(42, 37, 32, 0.035);
        }

        .loom-source-status-cell {
          min-height: 74px;
          padding: 0.86rem 0.95rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 8px;
        }

        .loom-source-status-cell span:first-child,
        .loom-source-work-panel__title,
        .loom-source-row__label,
        .loom-source-row__move-label {
          color: var(--muted);
          font-family: var(--mono);
          font-size: 0.66rem;
          line-height: 1.2;
          text-transform: uppercase;
          letter-spacing: 0;
        }

        .loom-source-status-cell strong {
          color: var(--fg);
          font-family: var(--serif);
          font-size: 1.08rem;
          font-style: italic;
          font-weight: 500;
          line-height: 1.15;
        }

        .loom-source-worklist {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .loom-source-work-panel {
          min-height: 176px;
          padding: 1rem;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .loom-source-work-panel__body {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .loom-source-work-panel__empty {
          margin: 0;
          color: var(--fg-secondary);
          font-family: var(--serif);
          font-size: 0.9rem;
          font-style: italic;
          line-height: 1.45;
        }

        .loom-source-work-link {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: baseline;
          color: inherit;
          text-decoration: none;
          padding: 0.38rem 0;
          border-bottom: 0.5px solid color-mix(in srgb, var(--mat-border) 46%, transparent);
        }

        .loom-source-work-link strong {
          min-width: 0;
          overflow-wrap: anywhere;
          color: var(--fg);
          font-family: var(--serif);
          font-size: 0.96rem;
          font-weight: 500;
          line-height: 1.25;
        }

        .loom-source-work-link span {
          color: var(--muted);
          font-family: var(--serif);
          font-size: 0.76rem;
          font-style: italic;
          line-height: 1.2;
          white-space: nowrap;
        }

        .loom-source-index__groups {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .loom-source-group {
          padding: 1rem;
          transition:
            border-color var(--dur-2) var(--ease),
            background var(--dur-2) var(--ease);
        }

        .loom-source-group[data-drop-active="true"] {
          border-color: color-mix(in srgb, var(--accent) 52%, var(--mat-border));
          background: color-mix(in srgb, var(--accent) 7%, var(--bg-elevated));
        }

        .loom-source-group__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 12px;
        }

        .loom-source-group__identity {
          min-width: 0;
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 6px;
        }

        .loom-source-group h2 {
          margin: 0;
          color: var(--fg);
          font-family: var(--display);
          font-size: clamp(1.12rem, 1.8vw, 1.36rem);
          font-style: italic;
          font-weight: 500;
          line-height: 1.12;
          letter-spacing: 0;
        }

        .loom-source-group p {
          margin: 0;
          max-width: 44rem;
          color: var(--fg-secondary);
          font-family: var(--serif);
          font-size: 0.84rem;
          font-style: italic;
          line-height: 1.45;
        }

        .loom-source-group__meta,
        .loom-source-group__actions,
        .loom-group-editor,
        .loom-new-group {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        .loom-source-group__meta > span {
          color: var(--muted);
          font-family: var(--serif);
          font-size: 0.78rem;
          font-style: italic;
          white-space: nowrap;
        }

        .loom-source-group__actions span {
          color: var(--muted);
          font-size: var(--fs-caption);
        }

        .loom-source-group__rows {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .loom-source-group__empty {
          padding: 0.7rem 0;
        }

        .loom-source-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 14px;
          align-items: stretch;
          border-top: 0.5px solid color-mix(in srgb, var(--mat-border) 52%, transparent);
          padding-top: 0.72rem;
        }

        .loom-source-row[draggable="true"] {
          cursor: grab;
        }

        .loom-source-row__main {
          min-width: 0;
          color: inherit;
          text-decoration: none;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          padding: 0.16rem 0;
        }

        .loom-source-row__title {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .loom-source-row__title strong {
          overflow-wrap: anywhere;
          color: var(--fg);
          font-family: var(--serif);
          font-size: 1rem;
          font-weight: 500;
          line-height: 1.22;
        }

        .loom-source-row__title span,
        .loom-source-row__state,
        .loom-source-row__confirm {
          color: var(--fg-secondary);
          font-family: var(--serif);
          font-size: 0.78rem;
          font-style: italic;
          line-height: 1.35;
        }

        .loom-source-row__extract {
          justify-self: end;
          color: var(--muted);
          font-family: var(--mono);
          font-size: 0.66rem;
          line-height: 1.2;
          text-transform: uppercase;
          letter-spacing: 0;
          white-space: nowrap;
        }

        .loom-source-row__tools {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          min-width: 178px;
        }

        .loom-source-row__move {
          display: grid;
          gap: 4px;
          pointer-events: auto;
        }

        .loom-source-row__move select {
          min-width: 138px;
          border: 0.5px solid color-mix(in srgb, var(--mat-border) 82%, transparent);
          border-radius: 6px;
          background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
          color: var(--fg-secondary);
          font-family: var(--serif);
          font-size: 0.78rem;
          font-style: italic;
          padding: 0.28rem 0.48rem;
        }

        .loom-source-row__remove {
          appearance: none;
          border: 0.5px solid transparent;
          background: transparent;
          color: var(--muted);
          width: 30px;
          height: 30px;
          border-radius: 6px;
          cursor: pointer;
          font-family: var(--serif);
          font-size: 0.76rem;
          font-style: italic;
          transition:
            color var(--dur-2) var(--ease),
            border-color var(--dur-2) var(--ease),
            background var(--dur-2) var(--ease);
        }

        .loom-source-row__remove:hover,
        .loom-source-row__remove:focus-visible {
          color: var(--accent-text);
          border-color: color-mix(in srgb, var(--accent) 38%, transparent);
          background: color-mix(in srgb, var(--accent) 6%, transparent);
        }

        .loom-source-row__confirm {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        .loom-new-group,
        .loom-new-group-button {
          align-self: flex-start;
        }

        .loom-new-group-button {
          appearance: none;
          border: 0.5px solid color-mix(in srgb, var(--mat-border) 78%, transparent);
          border-radius: 7px;
          background: transparent;
          color: var(--fg-secondary);
          cursor: pointer;
          font-family: var(--serif);
          font-size: 0.88rem;
          font-style: italic;
          padding: 0.42rem 0.68rem;
        }

        .loom-new-group-button:hover,
        .loom-new-group-button:focus-visible {
          color: var(--accent-text);
          border-color: color-mix(in srgb, var(--accent) 42%, var(--mat-border));
        }

        @media (max-width: 900px) {
          .loom-source-index__status,
          .loom-source-worklist {
            grid-template-columns: 1fr;
          }

          .loom-source-row,
          .loom-source-row__main,
          .loom-source-group__header {
            grid-template-columns: 1fr;
            display: grid;
          }

          .loom-source-row__tools,
          .loom-source-group__meta {
            justify-content: flex-start;
            min-width: 0;
          }

          .loom-source-row__extract {
            justify-self: start;
          }
        }
      `}</style>
    </StageShell>
  );
}

function StatusCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="loom-source-status-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WorkPanel({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <section className="loom-source-work-panel">
      <div className="loom-source-work-panel__title">{title}</div>
      <div className="loom-source-work-panel__body">
        {items.length > 0 ? items : <p className="loom-source-work-panel__empty">{empty}</p>}
      </div>
    </section>
  );
}

function WorkLink({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <a className="loom-source-work-link" href={href}>
      <strong>{title}</strong>
      <span>{meta}</span>
    </a>
  );
}

function PrimaryWritingAction({ writingEntries }: { writingEntries: SourceWritingEntry[] }) {
  const href = writingEntries[0]?.href ?? '/coworks';
  return (
    <a className="loom-link" href={href}>
      Continue writing
    </a>
  );
}

function CollectionRow({
  item,
  allGroups,
  onMoveCategory,
  confirmingHide,
  onRequestHideCategory,
  onCancelHideCategory,
  onConfirmHideCategory,
  busy,
}: {
  item: ResolvedSourceLibraryItem;
  allGroups: ResolvedSourceLibraryGroup[];
  onMoveCategory: (categorySlug: string, groupId: string) => void;
  confirmingHide: boolean;
  onRequestHideCategory: (categorySlug: string) => void;
  onCancelHideCategory: () => void;
  onConfirmHideCategory: (categorySlug: string) => void;
  busy: boolean;
}) {
  return (
    <article
      id={item.slug}
      className="loom-source-row"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-loom-category-slug', item.slug);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <a className="loom-source-row__main" href={item.href} aria-label={`Open collection ${item.label}`}>
        <span className="loom-source-row__title">
          <strong>{item.label}</strong>
          <span>{item.latestDocTitle ? `Recent: ${item.latestDocTitle}` : `${formatCount(item.count, 'source')} indexed`}</span>
        </span>
        <span className="loom-source-row__extract">
          {item.extractedCount}/{item.count} Extracted
        </span>
      </a>

      <div className="loom-source-row__tools">
        <label className="loom-source-row__move">
          <span className="loom-source-row__move-label">Move</span>
          <select
            value={item.groupId}
            onChange={(event) => onMoveCategory(item.slug, event.target.value)}
            disabled={busy}
            title="Move this collection to another group."
            aria-label={`Move ${item.label} to another group`}
          >
            {allGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="loom-source-row__remove"
          onClick={() => onRequestHideCategory(item.slug)}
          aria-busy={busy}
          title="Hide from Source Index (original files stay read-only)"
        >
          Hide
        </button>
      </div>

      {confirmingHide && (
        <div className="loom-source-row__confirm">
          <span>Hide this collection from the index? Original files stay untouched.</span>
          <button
            type="button"
            style={groupActionStyle}
            onClick={() => onConfirmHideCategory(item.slug)}
            aria-busy={busy}
          >
            Remove now
          </button>
          <button type="button" style={groupActionStyle} onClick={onCancelHideCategory}>
            Cancel
          </button>
        </div>
      )}
    </article>
  );
}

function formatCount(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function groupProvenance(group: ResolvedSourceLibraryGroup) {
  const sourceCount = group.items.reduce((sum, item) => sum + item.count, 0);
  if (group.items.length === 0) return 'Ready for collections that need a working context.';
  return `${formatCount(sourceCount, 'source')} across ${formatCount(group.items.length, 'collection')}.`;
}

function extractionLabel(item: ResolvedSourceLibraryItem) {
  if (item.count === 0) return 'empty';
  if (item.pendingCount === 0) return 'extracted';
  return `${formatCount(item.pendingCount, 'source')} needs extraction`;
}

function writingMeta(entry: SourceWritingEntry) {
  const bits = [
    entry.categoryLabel,
    entry.hasTidyDraft ? 'draft ready' : 'scratch',
    typeof entry.materialCount === 'number' ? formatCount(entry.materialCount, 'source') : null,
    relativeTime(entry.updatedAt),
  ].filter(Boolean);
  return bits.join(' · ');
}

function relativeTime(at: number | string | undefined) {
  if (at === undefined) return 'recent';
  const t = typeof at === 'number' ? at : Date.parse(String(at));
  if (!Number.isFinite(t)) return 'recent';
  const diff = Math.max(0, Date.now() - t);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

const groupInputStyle: CSSProperties = {
  minWidth: '13rem',
  border: '0.5px solid color-mix(in srgb, var(--mat-border) 82%, transparent)',
  borderRadius: 6,
  background: 'color-mix(in srgb, var(--bg-elevated) 88%, transparent)',
  color: 'var(--fg)',
  fontFamily: 'var(--serif)',
  fontSize: '0.86rem',
  fontStyle: 'italic',
  padding: '0.42rem 0.56rem',
};

const groupActionStyle: CSSProperties = {
  appearance: 'none',
  border: '0.5px solid color-mix(in srgb, var(--mat-border) 78%, transparent)',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--fg-secondary)',
  cursor: 'pointer',
  fontFamily: 'var(--serif)',
  fontSize: '0.78rem',
  fontStyle: 'italic',
  padding: '0.28rem 0.5rem',
};
