import type { ReactNode } from 'react';
import { TableOfContents } from './TableOfContents';
import { PrevNext } from './PrevNext';
import { RelatedDocs } from './RelatedDocs';

export function ChapterShell({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <div className="with-toc">
      <div style={{ flex: 1, minWidth: 0 }} className="prose-notion">
        {children}
        <RelatedDocs id={`wiki/${slug}`} />
        <PrevNext slug={slug} />
      </div>
      <TableOfContents />
    </div>
  );
}
