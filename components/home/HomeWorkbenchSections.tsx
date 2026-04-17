'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { QuietGuideCard } from '../QuietGuideCard';
import { WorkEyebrow } from '../WorkSurface';
import type { WorkSessionOutcome } from '../../lib/work-session';

export type HomeResumeItem = {
  id: string;
  title: string;
  href: string;
  viewedAt: number;
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
  title: string;
  meta?: ReactNode;
  summary: ReactNode;
  detail?: ReactNode;
  actions: Array<{ label: string; href?: string; onClick?: () => void; primary?: boolean }>;
}) {
  return (
    <QuietGuideCard
      eyebrow={eyebrow}
      title={title}
      tone="primary"
      density="roomy"
      meta={meta}
      summary={summary}
      detail={detail}
      actions={actions}
    />
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
