'use client';
/**
 * VersionedAnchorCard · shared rendering for a single thought-anchor container.
 *
 * Used by both LiveArtifact (inline at doc bottom) and ReviewSheet (centered
 * glass panel on ⌘/). Handles:
 *
 *   - Section label with ◆ and version count badge (e.g. "◆ Section 3 · v5")
 *   - Latest version summary + quote + content (collapsible version picker
 *     when versionCount > 1)
 *   - Asymmetric delete: revert single version / delete whole container
 *   - Lock toggle (lock/unlock this local container)
 *
 * §X · The card embodies the iterative thought model: an anchor is a
 * CONTAINER of versions, not a static note. The latest version is the
 * default face; the history is one click away.
 */
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useAppendEvent, useRemoveEvents } from '../lib/trace';
import { passagePositionKey } from '../lib/passage-locator';
import { matchesThoughtContainerCrystallizeEvent } from '../lib/thought-containers';
import type { ThoughtAnchorView } from './thought-anchor-model';
import { locateAnchorElement } from './thought-anchor-model';

const NoteRenderer = dynamic(
  () => import('./NoteRenderer').then((m) => m.NoteRenderer),
  { ssr: false },
);

export function VersionedAnchorCard({
  item,
  dataReviewAnchorId,
  onSectionClick,
  emphasized = false,
}: {
  item: ThoughtAnchorView;
  /** Optional data-review-anchor-id attribute for ReviewSheet's IntersectionObserver */
  dataReviewAnchorId?: string;
  /** Optional override for what happens when the section label is clicked.
   *  Defaults to scrolling the doc to the anchor's source passage. */
  onSectionClick?: (item: ThoughtAnchorView) => void;
  emphasized?: boolean;
}) {
  const append = useAppendEvent();
  const removeEvents = useRemoveEvents();

  // null = viewing latest version. Otherwise, index into item.versions.
  const [viewingIdx, setViewingIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [pendingDeleteContainer, setPendingDeleteContainer] = useState(false);

  const versions = item.versions;
  const effectiveIdx = viewingIdx ?? versions.length - 1;
  const effectiveVersion = versions[effectiveIdx] ?? null;
  const hasHistory = item.versionCount > 1;
  const isViewingHistory = viewingIdx !== null && viewingIdx !== versions.length - 1;

  // Scale: for chains longer than VISIBLE_THRESHOLD versions, default to
  // showing only the most recent RECENT_WINDOW. Older versions collapse into
  // a "show N older" toggle. User can still view any specific version by
  // clicking it — the older-version button expands the list.
  const VISIBLE_THRESHOLD = 10;
  const RECENT_WINDOW = 5;
  const shouldCollapse = versions.length > VISIBLE_THRESHOLD && !showAllVersions;
  const visibleStartIdx = shouldCollapse ? versions.length - RECENT_WINDOW : 0;
  const hiddenOlderCount = shouldCollapse ? versions.length - RECENT_WINDOW : 0;

  const handleSectionClick = () => {
    if (onSectionClick) {
      onSectionClick(item);
    } else {
      locateAnchorElement(item.anchorId, item.anchorBlockId, item.anchorBlockText)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Delete a single version by timestamp match.
  const deleteVersion = async (versionAt: number) => {
    if (!item.traceId) return;
    await removeEvents(
      item.traceId,
      (e) => e.kind === 'thought-anchor' && e.anchorId === item.anchorId && e.at === versionAt,
    );
    // After deletion, viewingIdx may point past the new end — reset to latest
    setViewingIdx(null);
  };

  // Delete the entire container — all versions across matching anchorIds.
  // Uses a broader predicate (text fingerprint + char range) to ensure all
  // versions of this "position" are wiped, even if anchorIds drifted across
  // page reloads.
  const deleteContainer = async () => {
    if (!item.traceId) return;
    const key = passagePositionKey({
      anchorId: item.anchorId,
      blockId: item.anchorBlockId,
      blockText: item.anchorBlockText,
      charStart: item.anchorCharStart,
      charEnd: item.anchorCharEnd,
    });
    await removeEvents(
      item.traceId,
      (e) => {
        if (e.kind !== 'thought-anchor') return false;
        if (e.anchorId === item.anchorId) return true;
        return passagePositionKey({
          anchorId: e.anchorId,
          blockId: e.anchorBlockId,
          blockText: e.anchorBlockText,
          charStart: e.anchorCharStart,
          charEnd: e.anchorCharEnd,
        }) === key;
      },
    );
    // Also wipe any anchor-scoped crystallize events for this container
    await removeEvents(
      item.traceId,
      (e) => matchesThoughtContainerCrystallizeEvent(e, item.containerAnchorIds),
    );
    setPendingDeleteContainer(false);
  };

  const toggleCrystallize = async () => {
    if (!item.traceId) return;
    if (item.isLocked) {
      // Unlock: remove the anchor-scoped crystallize event
      await removeEvents(
        item.traceId,
        (e) => matchesThoughtContainerCrystallizeEvent(e, item.containerAnchorIds),
      );
    } else {
      // Lock: append an anchor-scoped crystallize event
      await append(item.traceId, {
        kind: 'crystallize',
        summary: item.summary,
        at: Date.now(),
        anchorId: item.anchorId,
      } as any);
    }
  };

  const displayContent = effectiveVersion?.content ?? item.content;
  const displaySummary = effectiveVersion?.summary ?? item.summary;

  return (
    <section
      data-review-anchor-id={dataReviewAnchorId}
      style={{
        paddingBottom: 14,
        borderBottom: '0.5px solid var(--mat-border)',
        opacity: item.isLocked ? 0.88 : 1,
        borderRadius: 12,
        paddingInline: 10,
        paddingTop: 10,
        marginInline: -10,
        background: emphasized ? 'color-mix(in srgb, var(--accent) 4%, transparent)' : 'transparent',
        boxShadow: emphasized ? 'inset 0 0 0 0.5px color-mix(in srgb, var(--accent) 24%, var(--mat-border))' : 'none',
        transition: 'background 0.18s var(--ease), box-shadow 0.18s var(--ease)',
      }}
    >
      {/* Header row: section label with ◆ + version count, crystallize toggle, delete-container button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div
          onClick={handleSectionClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleSectionClick();
            }
          }}
          style={{
            background: 'transparent',
            padding: 0,
            margin: 0,
            cursor: 'pointer',
            textAlign: 'left',
            width: '100%',
            flex: 1,
          }}
        >
          <div
            className="t-caption2"
            style={{
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <span>◆ {item.section}</span>
            {item.versionCount > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHistory((v) => !v);
                }}
                title={`${item.versionCount} iterations — click to ${showHistory ? 'collapse' : 'expand'} history`}
                style={{
                  background: showHistory ? 'var(--accent-soft)' : 'transparent',
                  color: 'var(--accent)',
                  border: '0.5px solid var(--accent)',
                  borderRadius: 999,
                  padding: '0 8px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  lineHeight: 1.5,
                }}
              >
                v{item.versionCount}
              </button>
            )}
            {item.isLocked && (
              <span
                title="This local thought is locked"
                style={{
                  color: 'var(--tint-indigo)',
                  fontSize: '0.72rem',
                  letterSpacing: '0.06em',
                }}
              >
                ◈ locked
              </span>
            )}
            {isViewingHistory && (
              <span
                style={{
                  color: 'var(--muted)',
                  fontFamily: 'var(--mono)',
                  fontSize: '0.68rem',
                }}
              >
                viewing v{effectiveIdx + 1}
              </span>
            )}
          </div>
          <div
            style={{
              color: 'var(--fg)',
              fontSize: '1.02rem',
              fontWeight: 600,
              lineHeight: 1.5,
              marginBottom: item.quote ? 8 : 0,
            }}
          >
            {displaySummary}
          </div>
        </div>

        {/* Crystallize / unlock button */}
        {item.traceId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleCrystallize();
            }}
            aria-label={item.isLocked ? 'Unlock this local thought' : 'Lock this local thought'}
            title={item.isLocked ? 'Unlock · allow new versions' : 'Lock · keep this local thread fixed while the panel stays open'}
            style={{
              background: 'transparent',
              border: 0,
              cursor: 'pointer',
              color: item.isLocked ? 'var(--tint-indigo)' : 'var(--muted)',
              fontSize: '0.92rem',
              lineHeight: 1,
              padding: '0 4px',
              opacity: item.isLocked ? 0.9 : 0.42,
              marginTop: 1,
              transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.opacity = item.isLocked ? '0.9' : '0.42';
            }}
          >
            ◈
          </button>
        )}

        {/* Delete entire container — two-step (click once to arm, click again to confirm) */}
        {item.traceId && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (pendingDeleteContainer) {
                deleteContainer();
              } else {
                setPendingDeleteContainer(true);
                window.setTimeout(() => setPendingDeleteContainer(false), 3000);
              }
            }}
            aria-label={pendingDeleteContainer ? 'Confirm delete entire container' : 'Delete entire container'}
            title={
              pendingDeleteContainer
                ? 'Click again to delete ALL versions of this thought'
                : 'Delete this anchor (all versions)'
            }
            style={{
              background: pendingDeleteContainer ? 'var(--tint-red)' : 'transparent',
              border: 0,
              borderRadius: 999,
              cursor: 'pointer',
              color: pendingDeleteContainer ? '#fff' : 'var(--muted)',
              fontSize: '0.82rem',
              lineHeight: 1,
              padding: pendingDeleteContainer ? '2px 7px' : '0 4px',
              opacity: pendingDeleteContainer ? 1 : 0.42,
              marginTop: 1,
              fontWeight: pendingDeleteContainer ? 700 : 400,
              transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease), background 0.18s var(--ease)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              if (!pendingDeleteContainer) {
                el.style.opacity = '1';
                el.style.color = 'var(--tint-red)';
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              if (!pendingDeleteContainer) {
                el.style.opacity = '0.42';
                el.style.color = 'var(--muted)';
              }
            }}
          >
            {pendingDeleteContainer ? 'delete all?' : '×'}
          </button>
        )}
      </div>

      {item.quote ? (
        <div
          style={{
            color: 'var(--fg-secondary)',
            fontSize: '0.82rem',
            fontStyle: 'italic',
            lineHeight: 1.5,
            marginBottom: 10,
          }}
        >
          &ldquo;{item.quote}&rdquo;
        </div>
      ) : null}

      <div className="note-rendered" style={{ color: 'var(--fg-secondary)' }}>
        <NoteRenderer source={displayContent} />
      </div>

      {/* Version history timeline — only visible when expanded */}
      {hasHistory && showHistory && (
        <div
          style={{
            marginTop: 16,
            paddingTop: 12,
            borderTop: '0.5px dashed var(--mat-border)',
          }}
        >
          <div
            className="t-caption2"
            style={{
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              marginBottom: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>History · {versions.length} version{versions.length === 1 ? '' : 's'}</span>
            {shouldCollapse && (
              <button
                type="button"
                onClick={() => setShowAllVersions(true)}
                style={{
                  background: 'transparent',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  fontSize: '0.68rem',
                  fontFamily: 'var(--mono)',
                  fontWeight: 600,
                  padding: 0,
                  letterSpacing: 0,
                  textTransform: 'none',
                }}
              >
                show {hiddenOlderCount} older
              </button>
            )}
            {!shouldCollapse && versions.length > VISIBLE_THRESHOLD && (
              <button
                type="button"
                onClick={() => setShowAllVersions(false)}
                style={{
                  background: 'transparent',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  fontSize: '0.68rem',
                  fontFamily: 'var(--mono)',
                  fontWeight: 600,
                  padding: 0,
                  letterSpacing: 0,
                  textTransform: 'none',
                }}
              >
                collapse older
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {versions.slice(visibleStartIdx).map((v, offset) => {
              const idx = visibleStartIdx + offset;
              const isCurrent = idx === effectiveIdx;
              return (
                <div
                  key={`${v.at}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 6,
                    background: isCurrent ? 'var(--accent-soft)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => setViewingIdx(idx === versions.length - 1 ? null : idx)}
                >
                  <span
                    className="t-caption2"
                    style={{
                      color: 'var(--muted)',
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      minWidth: 26,
                    }}
                  >
                    v{idx + 1}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: '0.78rem',
                      color: isCurrent ? 'var(--fg)' : 'var(--fg-secondary)',
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {v.summary}
                  </span>
                  <span
                    className="t-caption2"
                    style={{
                      color: 'var(--muted)',
                      fontFamily: 'var(--mono)',
                      fontSize: '0.68rem',
                      flexShrink: 0,
                    }}
                  >
                    {relativeTime(v.at)}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteVersion(v.at);
                    }}
                    aria-label="Delete this version"
                    title="Delete this version"
                    style={{
                      background: 'transparent',
                      border: 0,
                      cursor: 'pointer',
                      color: 'var(--muted)',
                      fontSize: '0.78rem',
                      lineHeight: 1,
                      padding: '0 4px',
                      opacity: 0.42,
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.opacity = '1';
                      el.style.color = 'var(--tint-red)';
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.opacity = '0.42';
                      el.style.color = 'var(--muted)';
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}
