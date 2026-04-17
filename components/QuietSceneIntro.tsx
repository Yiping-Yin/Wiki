'use client';

import type { ReactNode } from 'react';
import { WorkAction, WorkEyebrow } from './WorkSurface';

export type QuietSceneAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
};

export function QuietSceneIntro({
  eyebrow,
  title,
  meta,
  summary,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  meta?: ReactNode;
  summary?: ReactNode;
  actions?: QuietSceneAction[];
}) {
  return (
    <section className="loom-quiet-scene__intro">
      <WorkEyebrow>{eyebrow}</WorkEyebrow>
      <div className="loom-quiet-scene__intro-title">{title}</div>
      {meta ? <div className="loom-quiet-scene__intro-meta t-caption2">{meta}</div> : null}
      {summary ? <div className="loom-quiet-scene__intro-summary">{summary}</div> : null}
      {actions && actions.length > 0 ? (
        <div className="loom-quiet-scene__intro-actions">
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
      ) : null}
    </section>
  );
}
