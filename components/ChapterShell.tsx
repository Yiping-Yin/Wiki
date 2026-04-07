import type { ReactNode } from 'react';
import { TableOfContents } from './TableOfContents';
import { PrevNext } from './PrevNext';

export function ChapterShell({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <div className="with-toc">
      <div style={{ flex: 1, minWidth: 0 }} className="prose-notion">
        {children}
        <PrevNext slug={slug} />
      </div>
      <TableOfContents />
    </div>
  );
}
