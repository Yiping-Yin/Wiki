'use client';

import type { LearningTarget } from '../lib/learning-targets';
import type { LearningTargetQueue, LearningTargetQueueItem } from '../lib/learning-target-state';
import { WorkAction, WorkEyebrow, WorkSurface } from './WorkSurface';

export function LearningTargetQueueState({
  queue,
  onRestore,
  onTogglePinned,
}: {
  queue: LearningTargetQueue;
  onRestore: (target: LearningTarget) => void;
  onTogglePinned: (target: LearningTarget) => void;
}) {
  const hasAny =
    queue.pinned.length > 0
    || queue.snoozed.length > 0
    || queue.hiddenToday.length > 0
    || queue.done.length > 0;

  if (!hasAny) return null;

  return (
    <WorkSurface tone="quiet" density="compact" style={{ marginTop: 18 }}>
      <WorkEyebrow subtle style={{ marginBottom: 8 }}>Queue state</WorkEyebrow>
      <div
        className="t-caption2"
        style={{
          color: 'var(--muted)',
          lineHeight: 1.45,
          marginBottom: 8,
        }}
      >
        Targets return when the underlying panel or weave changes. `Not now` snoozes briefly. `Hide today` suppresses until tomorrow.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {queue.pinned.length > 0 && (
          <QueueGroup
            label="Pinned"
            items={queue.pinned}
            actionLabel="Unpin"
            onAction={(item) => onTogglePinned(item.target)}
          />
        )}
        {queue.snoozed.length > 0 && (
          <QueueGroup
            label="Not now"
            items={queue.snoozed}
            actionLabel="Restore"
            onAction={(item) => onRestore(item.target)}
          />
        )}
        {queue.hiddenToday.length > 0 && (
          <QueueGroup
            label="Hidden today"
            items={queue.hiddenToday}
            actionLabel="Restore"
            onAction={(item) => onRestore(item.target)}
          />
        )}
        {queue.done.length > 0 && (
          <QueueGroup
            label="Done recently"
            items={queue.done}
            actionLabel="Restore"
            onAction={(item) => onRestore(item.target)}
          />
        )}
      </div>
    </WorkSurface>
  );
}

function QueueGroup({
  label,
  items,
  actionLabel,
  onAction,
}: {
  label: string;
  items: LearningTargetQueueItem[];
  actionLabel: string;
  onAction: (item: LearningTargetQueueItem) => void;
}) {
  return (
    <div>
      <div
        className="t-caption2"
        style={{
          color: 'var(--muted)',
          letterSpacing: '0.05em',
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item) => (
          <div
            key={`${label}:${item.target.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              justifyContent: 'space-between',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  color: 'var(--fg)',
                  fontSize: '0.88rem',
                  lineHeight: 1.45,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.target.title}
              </div>
              <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 2 }}>
                {item.label}
              </div>
            </div>
            <WorkAction
              label={actionLabel}
              onClick={() => onAction(item)}
              style={{
                flexShrink: 0,
                padding: '0.36rem 0.7rem',
                fontSize: '0.72rem',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
