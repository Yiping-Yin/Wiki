'use client';
import type { ReactNode } from 'react';
import { Stack } from './Stack';
import { Display } from './Display';
import { Body } from './Body';
import { HairlineRule } from './HairlineRule';

export interface LayoutArticleTOCEntry {
  slug: string;
  text: string;
}

export interface LayoutArticleProps {
  breadcrumb?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  toc?: LayoutArticleTOCEntry[];
  showDropCap?: boolean;
  folio?: ReactNode;
  children: ReactNode;
}

export function LayoutArticle({
  breadcrumb,
  eyebrow,
  title,
  description,
  toc,
  showDropCap = false,
  folio,
  children,
}: LayoutArticleProps) {
  const showToc = toc && toc.length >= 2;
  const cls = `loom-layout-article${showDropCap ? ' loom-layout-article--dropcap' : ''}`;
  return (
    <article className={cls}>
      <header className="loom-layout-article__header">
        <Stack gap="sm">
          {breadcrumb ? (
            <div className="loom-layout-article__breadcrumb">{breadcrumb}</div>
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

      {showToc ? (
        <nav className="loom-layout-article__toc" aria-label="Table of contents">
          <HairlineRule space="md" />
          <ul className="loom-layout-article__toc-list">
            {toc!.map((entry) => (
              <li key={entry.slug}>
                <a href={`#${entry.slug}`} className="loom-layout-article__toc-link">
                  {entry.text}
                </a>
              </li>
            ))}
          </ul>
          <HairlineRule space="md" />
        </nav>
      ) : null}

      <div className="loom-layout-article__body">{children}</div>

      {folio ? (
        <footer className="loom-layout-article__folio">
          <HairlineRule space="md" />
          <div className="loom-layout-article__folio-inner">{folio}</div>
        </footer>
      ) : null}

      <style jsx>{`
        .loom-layout-article {
          --measure-prose: 36em;
          max-width: var(--measure-prose);
          margin: 0 auto;
          padding: var(--space-2xl) var(--space-lg);
          color: var(--ink-1);
        }
        .loom-layout-article__header { margin-bottom: var(--space-xl); }
        .loom-layout-article__breadcrumb { color: var(--ink-3); }
        .loom-layout-article__toc { margin: var(--space-lg) 0 var(--space-xl); }
        .loom-layout-article__toc-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }
        .loom-layout-article__toc-link {
          font-family: var(--font-serif);
          color: var(--ink-2);
          text-decoration: none;
          transition: var(--motion-fast);
        }
        .loom-layout-article__toc-link:hover { color: var(--thread); }
        .loom-layout-article__body { font-family: var(--font-serif); }
        .loom-layout-article--dropcap
          :global(.loom-layout-article__body p:first-of-type::first-letter) {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 3.4em;
          line-height: 0.9;
          float: left;
          padding: 0.06em var(--space-xs) 0 0;
          color: var(--thread);
        }
        .loom-layout-article__folio { margin-top: var(--space-2xl); }
        .loom-layout-article__folio-inner { color: var(--ink-3); }
      `}</style>
    </article>
  );
}
