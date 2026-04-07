import type { ReactNode } from 'react';
import Link from 'next/link';
import { TableOfContents } from './TableOfContents';
import { PrevNext } from './PrevNext';
import { RelatedDocs } from './RelatedDocs';
import { DocNotes } from './DocNotes';

export function ChapterShell({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <div className="with-toc">
      <div style={{ flex: 1, minWidth: 0 }} className="prose-notion">
        {children}
        <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
          <Link href={`/atlas?focus=${encodeURIComponent('wiki/' + slug)}`}>🗺 view on atlas</Link>
        </div>
        <DocNotes id={`wiki/${slug}`} />
        <RelatedDocs id={`wiki/${slug}`} />
        <PrevNext slug={slug} />
      </div>
      <TableOfContents />
    </div>
  );
}
