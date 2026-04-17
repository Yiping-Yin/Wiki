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

export type HomeForegroundContent = {
  eyebrow: string;
  title: ReactNode;
  meta?: ReactNode;
  summary: ReactNode;
  detail?: ReactNode;
  actions: QuietSceneAction[];
};

export function HomeForegroundObject({
  eyebrow,
  title,
  meta,
  summary,
  detail,
  actions,
}: HomeForegroundContent) {
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
        <HomeSupportRow
          key={item.id}
          href={item.href}
          title={item.title}
          meta={item.category || 'Recent source'}
        />
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
        <HomeSupportRow
          key={`${item.targetId}:${item.handledAt}`}
          title={item.targetSnapshot.title}
          meta={item.resolvedLabel}
        />
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
          <HomeSupportRow
            key={`${label}:${item.target.id}`}
            title={item.target.title}
            meta={item.label}
            actionLabel={actionLabel}
            onAction={() => onAction(item)}
          />
        ))}
      </div>
    </div>
  );
}

function HomeSupportRow({
  title,
  meta,
  href,
  actionLabel,
  onAction,
}: {
  title: string;
  meta: string;
  href?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const actionable = Boolean(actionLabel && onAction);

  if (href) {
    return (
      <Link href={href} className="loom-home-support-row">
        <span className="loom-home-support-row__title">{title}</span>
        <span className="loom-home-support-row__meta">{meta}</span>
      </Link>
    );
  }

  return (
    <div className={actionable ? 'loom-home-support-row loom-home-support-row--actionable' : 'loom-home-support-row'}>
      <div className={actionable ? 'loom-home-support-row__copy' : undefined}>
        <span className="loom-home-support-row__title">{title}</span>
        <span className="loom-home-support-row__meta">{meta}</span>
      </div>
      {actionable ? (
        <button type="button" className="loom-home-support-row__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
