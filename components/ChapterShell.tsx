import type { ReactNode } from 'react';
import Link from 'next/link';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { TableOfContents } from './TableOfContents';
import { PrevNext } from './PrevNext';
import { RelatedDocs } from './RelatedDocs';
import { DocNotes } from './DocNotes';
import { DocQuiz } from './DocQuiz';
import { chapters } from '../lib/nav';

const SECTION_META: Record<string, { emoji: string; accent: string; accentSoft: string }> = {
  Start:       { emoji: '🏁', accent: '#2563eb', accentSoft: 'rgba(37,99,235,0.12)' },
  Foundations: { emoji: '⚡', accent: '#f97316', accentSoft: 'rgba(249,115,22,0.12)' },
  Transformer: { emoji: '🧠', accent: '#a855f7', accentSoft: 'rgba(168,85,247,0.12)' },
  Architecture:{ emoji: '🏗', accent: '#06b6d4', accentSoft: 'rgba(6,182,212,0.12)' },
  Training:    { emoji: '🔧', accent: '#10b981', accentSoft: 'rgba(16,185,129,0.12)' },
  Inference:   { emoji: '⚡', accent: '#7c3aed', accentSoft: 'rgba(124,58,237,0.12)' },
  Finetuning:  { emoji: '🎯', accent: '#ec4899', accentSoft: 'rgba(236,72,153,0.12)' },
  Data:        { emoji: '📊', accent: '#0ea5e9', accentSoft: 'rgba(14,165,233,0.12)' },
  Agents:      { emoji: '🤖', accent: '#f59e0b', accentSoft: 'rgba(245,158,11,0.12)' },
  Evaluation:  { emoji: '📏', accent: '#84cc16', accentSoft: 'rgba(132,204,22,0.12)' },
  Frontier:    { emoji: '🚀', accent: '#a78bfa', accentSoft: 'rgba(167,139,250,0.12)' },
  Safety:      { emoji: '🛡', accent: '#dc2626', accentSoft: 'rgba(220,38,38,0.12)' },
};

async function readingTime(slug: string): Promise<number> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'app', 'wiki', slug, 'page.mdx'), 'utf-8');
    const stripped = raw
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/\$[^$\n]*\$/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/export\s+const[^;]+;/g, ' ')
      .replace(/import[^;]+;/g, ' ')
      .replace(/[#*_`>\-]/g, ' ');
    const words = stripped.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220)); // ~220 wpm reading
  } catch { return 0; }
}

export async function ChapterShell({
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
  const meta = ch ? (SECTION_META[ch.section] ?? SECTION_META.Start) : SECTION_META.Start;
  const minutes = await readingTime(slug);

  return (
    <div
      className="with-toc chapter-themed"
      style={{
        // Per-section accent override — cascades through .prose-notion children
        ['--accent' as any]: meta.accent,
        ['--accent-soft' as any]: meta.accentSoft,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }} className="prose-notion">
        {/* Breadcrumb + meta strip */}
        {ch && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
            <Link href="/">Home</Link>
            <span>›</span>
            <span style={{ color: meta.accent, fontWeight: 600 }}>{meta.emoji} {ch.section}</span>
            {minutes > 0 && (
              <>
                <span>·</span>
                <span title="Estimated reading time">⏱ {minutes} min read</span>
              </>
            )}
          </div>
        )}

        {children}

        {/* Tag pills */}
        {ch && (
          <div className="tag-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0.4rem 0 1.2rem' }}>
            <span style={pillStyle}>{ch.section.toLowerCase()}</span>
            {tags?.map((t) => <span key={t} style={pillStyle}>{t}</span>)}
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

const pillStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 10px',
  background: 'var(--accent-soft)',
  color: 'var(--accent)',
  borderRadius: 999,
  fontSize: '0.72rem',
  fontWeight: 600,
};
