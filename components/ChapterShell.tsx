import type { ReactNode } from 'react';
import Link from 'next/link';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DocOutline } from './DocOutline';
import { PrevNext } from './PrevNext';
import { LiveArtifact } from './LiveArtifact';
import { AnchorLayer } from './AnchorLayer';
import { PinButton } from './PinButton';
import Ornament from './Ornament';
import { chapters } from '../lib/nav';

// Vellum tokens keyed by section. accent/accentSoft cascade into .prose-notion.
const SECTION_META: Record<string, { accent: string; accentSoft: string }> = {
  Start:       { accent: 'var(--tint-blue)',   accentSoft: 'color-mix(in srgb, var(--tint-blue) 14%, transparent)'   },
  Foundations: { accent: 'var(--tint-orange)', accentSoft: 'color-mix(in srgb, var(--tint-orange) 14%, transparent)' },
  Transformer: { accent: 'var(--tint-purple)', accentSoft: 'color-mix(in srgb, var(--tint-purple) 14%, transparent)' },
  Architecture:{ accent: 'var(--tint-cyan)',   accentSoft: 'color-mix(in srgb, var(--tint-cyan) 14%, transparent)'   },
  Training:    { accent: 'var(--tint-green)',  accentSoft: 'color-mix(in srgb, var(--tint-green) 14%, transparent)'  },
  Inference:   { accent: 'var(--tint-indigo)', accentSoft: 'color-mix(in srgb, var(--tint-indigo) 14%, transparent)' },
  Finetuning:  { accent: 'var(--tint-pink)',   accentSoft: 'color-mix(in srgb, var(--tint-pink) 14%, transparent)'   },
  Data:        { accent: 'var(--tint-teal)',   accentSoft: 'color-mix(in srgb, var(--tint-teal) 14%, transparent)'   },
  Agents:      { accent: 'var(--tint-yellow)', accentSoft: 'color-mix(in srgb, var(--tint-yellow) 14%, transparent)' },
  Evaluation:  { accent: 'var(--tint-mint)',   accentSoft: 'color-mix(in srgb, var(--tint-mint) 14%, transparent)'   },
  Frontier:    { accent: 'var(--tint-purple)', accentSoft: 'color-mix(in srgb, var(--tint-purple) 14%, transparent)' },
  Safety:      { accent: 'var(--tint-red)',    accentSoft: 'color-mix(in srgb, var(--tint-red) 14%, transparent)'    },
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
  // Chapter ordinal within its section — "iii of vii" reads as the
  // running head of a book, whereas "chapter 3 of 7" reads as a UI.
  // Uses the same lowercase roman convention as FolioMarker below.
  const sectionChapters = ch ? chapters.filter((c) => c.section === ch.section) : [];
  const chapterIdx = ch ? sectionChapters.findIndex((c) => c.slug === slug) : -1;
  const showOrdinal = sectionChapters.length >= 2 && chapterIdx >= 0;
  const chapterOrdinal = showOrdinal
    ? `${toLowerRoman(chapterIdx + 1)} of ${toLowerRoman(sectionChapters.length)}`
    : null;

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
      {ch && <EdgeRail section={ch.section} />}
      <Ribbon />

      <div className="doc-stage">
        <div style={{ minWidth: 0, position: 'relative' }} className="prose-notion loom-source-prose">
          {ch && (
            // Running head — same info the breadcrumb carried (home ·
            // section · minutes), restyled as italic serif small-caps
            // throughout so the whole row reads as the top margin of a
            // book page, not as web breadcrumbs. Follows the mockup's
            // `RunningHead` primitive (loom-tokens.jsx:133).
            <div className="loom-running-head" style={runningHeadStyle}>
              <Link
                href="/"
                style={{
                  ...runningHeadItem,
                  textDecoration: 'none',
                }}
              >
                loom
              </Link>
              <span style={runningHeadSep}>·</span>
              <span style={runningHeadItem}>{ch.section.toLowerCase()}</span>
              {chapterOrdinal && (
                <>
                  <span style={runningHeadSep}>·</span>
                  <span style={runningHeadItem} title="Chapter within section">
                    {chapterOrdinal}
                  </span>
                </>
              )}
              {minutes > 0 && (
                <>
                  <span style={runningHeadSep}>·</span>
                  <span style={runningHeadItem} title="Estimated reading time">
                    {minutes} min
                  </span>
                </>
              )}
            </div>
          )}

          <div style={{ position: 'absolute', top: '4rem', right: '2rem' }}>
            <PinButton id={`wiki/${slug}`} title={ch?.title ?? slug} href={`/wiki/${slug}`} size="md" />
          </div>

          {children}

          {ch && (
            <>
              {/* End-of-chapter breath mark — a classic book convention.
                  Uses the Ornament primitive (mockup loom-tokens.jsx:106)
                  for a proper SVG fleuron instead of a unicode star, so
                  the line-weights and vesica shape render identically
                  across macOS/iOS font stacks. */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  margin: '2.4rem 0 1.4rem',
                }}
              >
                <Ornament color="var(--accent)" size={14} />
              </div>
              <div className="tag-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0.4rem 0 1.2rem' }}>
                <span style={pillStyle}>{ch.section.toLowerCase()}</span>
                {tags?.map((t) => <span key={t} style={pillStyle}>{t}</span>)}
              </div>
              {/* Folio — small centered chapter marker at the foot of
                  the prose column. Mirrors loom-tokens.jsx:150 Folio
                  primitive, with `n` = chapter's ordinal within its
                  section rendered in lowercase Roman. Web pages have no
                  page-numbers, but ordinal-within-section reads as a
                  book's chapter-level Folio and signals "end of this
                  chapter" as the eye drops toward PrevNext. */}
              <FolioMarker ch={ch} slug={slug} />
            </>
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
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  color: 'var(--fg-secondary)',
  fontSize: '0.78rem',
  fontWeight: 400,
};

const runningHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
  marginBottom: '1rem',
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  fontSize: '0.78rem',
  color: 'var(--muted)',
  fontVariant: 'small-caps',
  letterSpacing: '0.03em',
  textTransform: 'lowercase',
};

const runningHeadItem: React.CSSProperties = {
  color: 'var(--muted)',
};

const runningHeadSep: React.CSSProperties = {
  color: 'var(--muted)',
  opacity: 0.6,
};

const folioStyle: React.CSSProperties = {
  marginTop: '1.8rem',
  textAlign: 'center',
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  fontSize: '0.78rem',
  color: 'var(--muted)',
  fontVariantNumeric: 'oldstyle-nums',
  letterSpacing: '0.02em',
};

/**
 * Folio marker · chapter's ordinal within its section, rendered as
 * `·  iii  ·` in lowercase roman per the mockup's "chapter vii"
 * convention. Returns nothing for section-of-one chapters so the
 * Folio stays quiet on one-off pages. Single component avoids the
 * double-call pattern that the previous inline `folioMarker(ch, slug)
 * && <div>{folioMarker(ch, slug)}</div>` produced.
 */
function FolioMarker({ ch, slug }: { ch: { slug: string; section: string }; slug: string }) {
  const sectionChapters = chapters.filter((c) => c.section === ch.section);
  if (sectionChapters.length < 2) return null;
  const idx = sectionChapters.findIndex((c) => c.slug === slug);
  if (idx < 0) return null;
  return (
    <div style={folioStyle} aria-hidden="true">
      ·&nbsp;&nbsp;{toLowerRoman(idx + 1)}&nbsp;&nbsp;·
    </div>
  );
}

/**
 * EdgeRail · quiet left-margin strip on reading pages.
 *
 * Matches loom-tokens.jsx:162 EdgeRail primitive — a 76px vertical
 * column pinned to the page's left gutter with:
 *   - The "L" wordmark at top
 *   - A short bronze horizontal separator
 *   - A vertical serif small-caps section label at bottom (rotated so
 *     the baseline reads up the spine — classic book-edge convention)
 *   - A ⌘K kbd chip as the last element, quietly reminding that the
 *     search palette is one keystroke away
 *
 * Fixed position so it doesn't steal reading width. Hidden on screens
 * narrower than 1024px (the prose column takes priority when space is
 * tight — EdgeRail is atmosphere, not navigation).
 */
function EdgeRail({ section }: { section: string }) {
  return (
    <aside
      aria-hidden="true"
      className="loom-edge-rail"
    >
      <span className="loom-edge-rail-mark">L</span>
      <span className="loom-edge-rail-rule" />
      <span className="loom-edge-rail-spacer" />
      <span className="loom-edge-rail-section">{section}</span>
      <span className="loom-edge-rail-kbd">⌘K</span>
    </aside>
  );
}

/**
 * Ribbon · silk bookmark hanging from top-right of reading page.
 *
 * Matches loom-tokens.jsx:205 Ribbon primitive — a 14×110 bronze
 * strip with a triangular notch at its tail, clipped via polygon.
 * Purely decorative (pointerEvents none). Hidden on narrow screens
 * so it doesn't crowd the prose column.
 */
function Ribbon() {
  return (
    <span className="loom-ribbon" aria-hidden="true">
      <span className="loom-ribbon-silk" />
    </span>
  );
}

function toLowerRoman(n: number): string {
  if (n < 1 || n > 3999) return String(n);
  const table: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'],  [90, 'xc'],  [50, 'l'],  [40, 'xl'],
    [10, 'x'],   [9, 'ix'],   [5, 'v'],   [4, 'iv'],
    [1, 'i'],
  ];
  let remaining = n;
  let out = '';
  for (const [value, glyph] of table) {
    while (remaining >= value) {
      out += glyph;
      remaining -= value;
    }
  }
  return out;
}
