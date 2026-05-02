'use client';
import type { ReactNode } from 'react';
import { Stack } from './Stack';
import { Display } from './Display';
import { Body } from './Body';
import { HairlineRule } from './HairlineRule';

export interface LayoutGalleryTOCEntry {
  slug: string;
  text: string;
}

export interface LayoutGalleryProps {
  breadcrumb?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  hero?: ReactNode;
  toc?: LayoutGalleryTOCEntry[];
  folio?: ReactNode;
  children: ReactNode;
}

export function LayoutGallery({
  breadcrumb,
  eyebrow,
  title,
  description,
  hero,
  toc,
  folio,
  children,
}: LayoutGalleryProps) {
  const showToc = toc && toc.length >= 2;
  return (
    <article className="loom-layout-gallery">
      <header className="loom-layout-gallery__header">
        <Stack gap="sm">
          {breadcrumb ? (
            <div className="loom-layout-gallery__breadcrumb">{breadcrumb}</div>
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

      {hero ? <div className="loom-layout-gallery__hero">{hero}</div> : null}

      {showToc ? (
        <nav className="loom-layout-gallery__toc" aria-label="Table of contents">
          <HairlineRule space="md" />
          <ul className="loom-layout-gallery__toc-list">
            {toc!.map((entry) => (
              <li key={entry.slug}>
                <a href={`#${entry.slug}`} className="loom-layout-gallery__toc-link">
                  {entry.text}
                </a>
              </li>
            ))}
          </ul>
          <HairlineRule space="md" />
        </nav>
      ) : null}

      <div className="loom-layout-gallery__body">{children}</div>

      {folio ? (
        <footer className="loom-layout-gallery__folio">
          <HairlineRule space="md" />
          <div className="loom-layout-gallery__folio-inner">{folio}</div>
        </footer>
      ) : null}

      <style jsx>{`
        .loom-layout-gallery {
          --measure-gallery: 60em;
          max-width: var(--measure-gallery);
          margin: 0 auto;
          padding: var(--space-2xl) var(--space-xl);
          color: var(--ink-1);
        }
        .loom-layout-gallery__header { margin-bottom: var(--space-xl); }
        .loom-layout-gallery__breadcrumb { color: var(--ink-3); }
        .loom-layout-gallery__hero {
          margin: 0 calc(var(--space-xl) * -1) var(--space-xl);
        }
        .loom-layout-gallery__toc { margin: var(--space-lg) 0 var(--space-xl); }
        .loom-layout-gallery__toc-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        .loom-layout-gallery__toc-link {
          font-family: var(--font-serif);
          color: var(--ink-2);
          text-decoration: none;
          transition: var(--motion-fast);
        }
        .loom-layout-gallery__toc-link:hover { color: var(--thread); }
        .loom-layout-gallery__body :global(.loom-img-gallery) {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-md);
        }
        .loom-layout-gallery__folio { margin-top: var(--space-2xl); }
        .loom-layout-gallery__folio-inner { color: var(--ink-3); }
      `}</style>
    </article>
  );
}
