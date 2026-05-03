'use client';
import type { ReactNode } from 'react';
import { Stack } from './Stack';
import { Display } from './Display';
import { Body } from './Body';

export interface LayoutIndexProps {
  breadcrumb?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function LayoutIndex({
  breadcrumb,
  eyebrow,
  title,
  description,
  toolbar,
  children,
}: LayoutIndexProps) {
  return (
    <section className="loom-layout-index">
      <header className="loom-layout-index__header">
        <Stack gap="sm">
          {breadcrumb ? (
            <div className="loom-layout-index__breadcrumb">{breadcrumb}</div>
          ) : null}
          {eyebrow ? <div>{eyebrow}</div> : null}
          <Display level="1">{title}</Display>
          {description ? (
            <Body tone="secondary" as="div">
              {description}
            </Body>
          ) : null}
        </Stack>
      </header>

      {toolbar ? (
        <div className="loom-layout-index__toolbar">{toolbar}</div>
      ) : null}

      <div className="loom-layout-index__body">{children}</div>

      <style jsx>{`
        .loom-layout-index {
          max-width: 56em;
          margin: 0 auto;
          padding: var(--space-2xl) var(--space-lg);
          color: var(--ink-1);
        }
        .loom-layout-index__header { margin-bottom: var(--space-xl); }
        .loom-layout-index__breadcrumb { color: var(--ink-3); }
        /*
         * Sticky toolbar — solid paper-deep bg.
         * NEVER add backdrop-filter here (constitutional rule 1).
         */
        .loom-layout-index__toolbar {
          position: sticky;
          top: 0;
          z-index: 5;
          background: var(--paper-deep);
          border-bottom: 0.5px solid var(--hair);
          padding: var(--space-sm) 0;
          margin-bottom: var(--space-md);
        }
        .loom-layout-index__body {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }
      `}</style>
    </section>
  );
}
