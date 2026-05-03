'use client';
import type { ReactNode } from 'react';
import { Stack } from './Stack';
import { Display } from './Display';
import { Body } from './Body';

export interface LayoutMagazineProps {
  breadcrumb?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  hero?: ReactNode;
  children: ReactNode;
}

export function LayoutMagazine({
  breadcrumb,
  eyebrow,
  title,
  description,
  hero,
  children,
}: LayoutMagazineProps) {
  return (
    <section className="loom-layout-magazine">
      <header className="loom-layout-magazine__header">
        <Stack gap="sm">
          {breadcrumb ? (
            <div className="loom-layout-magazine__breadcrumb">{breadcrumb}</div>
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

      {hero ? <div className="loom-layout-magazine__hero">{hero}</div> : null}

      <div className="loom-layout-magazine__grid">{children}</div>

      <style jsx>{`
        .loom-layout-magazine {
          width: 100%;
          padding: var(--space-xl) var(--space-lg);
          color: var(--ink-1);
        }
        .loom-layout-magazine__header { margin-bottom: var(--space-xl); }
        .loom-layout-magazine__breadcrumb { color: var(--ink-3); }
        .loom-layout-magazine__hero {
          width: 100%;
          margin-bottom: var(--space-xl);
        }
        .loom-layout-magazine__grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: var(--space-md);
        }
      `}</style>
    </section>
  );
}
