import type { ReactNode } from 'react';
import Link from 'next/link';
import { TableOfContents } from './TableOfContents';
import { PrevNext } from './PrevNext';
import { RelatedDocs } from './RelatedDocs';
import { DocNotes } from './DocNotes';
import { DocQuiz } from './DocQuiz';
import { chapters } from '../lib/nav';

const SECTION_EMOJI: Record<string, string> = {
  Start: '🏁',
  Foundations: '⚡',
  Transformer: '🧠',
  Architecture: '🏗',
  Training: '🔧',
  Inference: '⚡',
  Finetuning: '🎯',
  Data: '📊',
  Agents: '🤖',
  Evaluation: '📏',
  Frontier: '🚀',
  Safety: '🛡',
};

export function ChapterShell({
  slug,
  subtitle,
  tags,
  children,
}: {
  slug: string;
  subtitle?: string;
  tags?: string[];
  children: ReactNode;
}) {
  const ch = chapters.find((c) => c.slug === slug);
  const sectionEmoji = ch ? (SECTION_EMOJI[ch.section] ?? '📖') : '📖';

  return (
    <div className="with-toc">
      <div style={{ flex: 1, minWidth: 0 }} className="prose-notion">
        {/* Breadcrumb */}
        {ch && (
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.6rem' }}>
            <Link href="/">Home</Link>
            {' › '}
            <span>{sectionEmoji} {ch.section}</span>
          </div>
        )}

        {children}

        {/* Tag pills (auto-derived from section + slug) */}
        {ch && (
          <div className="tag-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0.4rem 0 1.2rem' }}>
            <Tag>{ch.section.toLowerCase()}</Tag>
            {tags?.map((t) => <Tag key={t}>{t}</Tag>)}
          </div>
        )}

        <div style={{ marginTop: '1rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
          <Link href={`/atlas?focus=${encodeURIComponent('wiki/' + slug)}`}>🗺 view on atlas</Link>
        </div>

        <DocQuiz id={`wiki/${slug}`} />
        <DocNotes id={`wiki/${slug}`} />
        <RelatedDocs id={`wiki/${slug}`} />
        <PrevNext slug={slug} />
      </div>

      <TableOfContents docId={`wiki/${slug}`} docTitle={ch?.title ?? slug} />
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      background: 'var(--accent-soft)',
      color: 'var(--accent)',
      borderRadius: 999,
      fontSize: '0.72rem',
      fontWeight: 600,
    }}>{children}</span>
  );
}
