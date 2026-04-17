'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LearningTarget } from '../../lib/learning-targets';
import type { LearningTargetQueue, LearningTargetQueueItem } from '../../lib/learning-target-state';
import type { QuietSceneAction } from '../QuietSceneIntro';
import { WorkAction, WorkEyebrow } from '../WorkSurface';
import type { WorkSessionOutcome } from '../../lib/work-session';

export type HomeResumeItem = {
  id: string;
  title: string;
  href: string;
  category: string;
};

export function HomeForegroundObject({
  eyebrow,
  title,
  meta,
  summary,
  detail,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  meta?: ReactNode;
  summary: ReactNode;
  detail?: ReactNode;
  actions: QuietSceneAction[];
}) {
  return (
    <section className="loom-home-foreground">
      <div className="loom-home-foreground__copy">
        <WorkEyebrow>{eyebrow}</WorkEyebrow>
        <div className="loom-home-foreground__title">{title}</div>
        {meta ? <div className="loom-home-foreground__meta t-caption2">{meta}</div> : null}
        <div className="loom-home-foreground__summary">{summary}</div>
        {detail ? <div className="loom-home-foreground__detail">{detail}</div> : null}
      </div>
      <div className="loom-home-foreground__actions">
        {actions.map((action) => (
          <WorkAction
            key={action.label}
            label={action.label}
            href={action.href}
            onClick={action.onClick}
            tone={action.primary ? 'primary' : 'secondary'}
          />
        ))}
      </div>
    </section>
  );
}

export function HomeSupportSection({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="loom-home-support-section">
      <div className="loom-home-support-section__header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <WorkEyebrow subtle>{eyebrow}</WorkEyebrow>
          <div className="loom-home-support-section__title">{title}</div>
        </div>
        {aside ? (
          <div className="t-caption2" style={{ color: 'var(--muted)' }}>
            {aside}
          </div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function HomeRecentThreadsList({ items }: { items: HomeResumeItem[] }) {
  return (
    <div className="loom-home-support-list">
      {items.map((item) => (
        <Link key={item.id} href={item.href} className="loom-home-support-row">
          <span className="loom-home-support-row__title">{item.title}</span>
          <span className="loom-home-support-row__meta">{item.category || 'Recent source'}</span>
        </Link>
      ))}
    </div>
  );
}

export function HomeQueueStateList({
  queue,
  onRestore,
  onTogglePinned,
}: {
  queue: LearningTargetQueue;
  onRestore: (target: LearningTarget) => void;
  onTogglePinned: (target: LearningTarget) => void;
}) {
  return (
    <div className="loom-home-support-list">
      {queue.pinned.length > 0 ? (
        <HomeQueueGroup
          label="Pinned"
          items={queue.pinned}
          actionLabel="Unpin"
          onAction={(item) => onTogglePinned(item.target)}
        />
      ) : null}
      {queue.snoozed.length > 0 ? (
        <HomeQueueGroup
          label="Not now"
          items={queue.snoozed}
          actionLabel="Restore"
          onAction={(item) => onRestore(item.target)}
        />
      ) : null}
      {queue.hiddenToday.length > 0 ? (
        <HomeQueueGroup
          label="Hidden today"
          items={queue.hiddenToday}
          actionLabel="Restore"
          onAction={(item) => onRestore(item.target)}
        />
      ) : null}
      {queue.done.length > 0 ? (
        <HomeQueueGroup
          label="Done recently"
          items={queue.done}
          actionLabel="Restore"
          onAction={(item) => onRestore(item.target)}
        />
      ) : null}
    </div>
  );
}

export function HomeResolvedList({ items }: { items: WorkSessionOutcome[] }) {
  return (
    <div className="loom-home-support-list">
      {items.map((item) => (
        <div key={`${item.targetId}:${item.handledAt}`} className="loom-home-support-row">
          <span className="loom-home-support-row__title">{item.targetSnapshot.title}</span>
          <span className="loom-home-support-row__meta">{item.resolvedLabel}</span>
        </div>
      ))}
    </div>
  );
}

function HomeQueueGroup({
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
    <div className="loom-home-support-group">
      <div className="loom-home-support-group__label t-caption2">{label}</div>
      <div className="loom-home-support-group__items">
        {items.map((item) => (
          <div key={`${label}:${item.target.id}`} className="loom-home-support-row loom-home-support-row--actionable">
            <div className="loom-home-support-row__copy">
              <span className="loom-home-support-row__title">{item.target.title}</span>
              <span className="loom-home-support-row__meta">{item.label}</span>
            </div>
            <button type="button" className="loom-home-support-row__action" onClick={() => onAction(item)}>
              {actionLabel}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
