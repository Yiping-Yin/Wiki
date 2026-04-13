import type { ReactNode } from 'react';
import Link from 'next/link';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DocOutline } from './DocOutline';
import { PrevNext } from './PrevNext';
import { LiveArtifact } from './LiveArtifact';
import { AnchorLayer } from './AnchorLayer';
import { PinButton } from './PinButton';
import { chapters } from '../lib/nav';

// Apple system colors keyed by section. accent/accentSoft cascade into .prose-notion.
const SECTION_META: Record<string, { emoji: string; accent: string; accentSoft: string }> = {
  Start:       { emoji: '✦', accent: 'var(--tint-blue)',   accentSoft: 'color-mix(in srgb, var(--tint-blue) 14%, transparent)'   },
  Foundations: { emoji: '◆', accent: 'var(--tint-orange)', accentSoft: 'color-mix(in srgb, var(--tint-orange) 14%, transparent)' },
  Transformer: { emoji: '◉', accent: 'var(--tint-purple)', accentSoft: 'color-mix(in srgb, var(--tint-purple) 14%, transparent)' },
  Architecture:{ emoji: '◧', accent: 'var(--tint-cyan)',   accentSoft: 'color-mix(in srgb, var(--tint-cyan) 14%, transparent)'   },
  Training:    { emoji: '◑', accent: 'var(--tint-green)',  accentSoft: 'color-mix(in srgb, var(--tint-green) 14%, transparent)'  },
  Inference:   { emoji: '✧', accent: 'var(--tint-indigo)', accentSoft: 'color-mix(in srgb, var(--tint-indigo) 14%, transparent)' },
  Finetuning:  { emoji: '◈', accent: 'var(--tint-pink)',   accentSoft: 'color-mix(in srgb, var(--tint-pink) 14%, transparent)'   },
  Data:        { emoji: '▦', accent: 'var(--tint-teal)',   accentSoft: 'color-mix(in srgb, var(--tint-teal) 14%, transparent)'   },
  Agents:      { emoji: '◊', accent: 'var(--tint-yellow)', accentSoft: 'color-mix(in srgb, var(--tint-yellow) 14%, transparent)' },
  Evaluation:  { emoji: '◐', accent: 'var(--tint-mint)',   accentSoft: 'color-mix(in srgb, var(--tint-mint) 14%, transparent)'   },
  Frontier:    { emoji: '✦', accent: 'var(--tint-purple)', accentSoft: 'color-mix(in srgb, var(--tint-purple) 14%, transparent)' },
  Safety:      { emoji: '◆', accent: 'var(--tint-red)',    accentSoft: 'color-mix(in srgb, var(--tint-red) 14%, transparent)'    },
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
    return Math.max(1, Math.round(words / 220));
  } catch {
    return 0;
  }
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
        ['--accent' as any]: meta.accent,
        ['--accent-soft' as any]: meta.accentSoft,
        position: 'relative',
      }}
    >
      <DocOutline />

      <div className="doc-stage">
        <div style={{ minWidth: 0, position: 'relative' }} className="prose-notion loom-source-prose">
          {ch && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: '0.7rem',
              }}
            >
              <Link
                href="/"
                className="t-caption"
                style={{ color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}
              >
                Home
              </Link>
              <span className="t-caption" style={{ color: 'var(--muted)' }}>›</span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 10px',
                  borderRadius: 999,
                  background: meta.accentSoft,
                  border: `0.5px solid ${meta.accent}`,
                }}
              >
                <span style={{ color: meta.accent }}>{meta.emoji}</span>
                <span
                  className="t-caption2"
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: meta.accent,
                    fontWeight: 700,
                  }}
                >
                  {ch.section}
                </span>
              </span>
              {minutes > 0 && (
                <span
                  className="t-caption"
                  style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  title="Estimated reading time"
                >
                  <span aria-hidden>⏱</span> {minutes} min read
                </span>
              )}
            </div>
          )}

          <div style={{ position: 'absolute', top: '4rem', right: '2rem' }}>
            <PinButton id={`wiki/${slug}`} title={ch?.title ?? slug} href={`/wiki/${slug}`} size="md" />
          </div>

          {children}

          {ch && (
            <div className="tag-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0.4rem 0 1.2rem' }}>
              <span style={pillStyle}>{ch.section.toLowerCase()}</span>
              {tags?.map((t) => <span key={t} style={pillStyle}>{t}</span>)}
            </div>
          )}
        </div>

        <LiveArtifact docId={`wiki/${slug}`} />
        <AnchorLayer docId={`wiki/${slug}`} />
        <PrevNext slug={slug} />
      </div>
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
