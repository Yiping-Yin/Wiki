'use client';

import Link from 'next/link';

/**
 * ContentsClient — Loom's table of contents (front matter).
 *
 * A reader's map of all the surfaces. Italic Cormorant chapter numbers
 * (I, II, …) + chapter title + subtitle + a row of italic serif links
 * to the surfaces that belong to the chapter.
 *
 * Eight chapters + front + back matter. Rhymes with the bound-volume
 * metaphor: Atlas is the map, Pursuits is the mind-room, Entry is the
 * first door, Reading is the book itself, Actions is the correspondence
 * drawer, Thinking is the draft table, The Desk is the between-reading
 * state, Habitat is the library.
 *
 * Surface names that don't (yet) have their own route (e.g. "interlace",
 * "review", "compose", "shuttle", "import", "evening") render as plain
 * italic labels — they exist as overlays or ⌘-shortcuts, not pages.
 */

type Surface = { label: string; href?: string };
type Chapter = {
  numeral: string;
  title: string;
  subtitle: string;
  surfaces: Surface[];
};

const chapters: Chapter[] = [
  {
    numeral: 'I.',
    title: 'Atlas',
    subtitle: 'the system on one page',
    surfaces: [
      { label: 'system', href: '/system' },
      { label: 'atlas of the Loom', href: '/system' },
    ],
  },
  {
    numeral: 'II.',
    title: 'Pursuits',
    subtitle: 'the mind-room',
    surfaces: [
      { label: 'pursuits', href: '/pursuits' },
      { label: 'pursuit detail', href: '/pursuits' },
    ],
  },
  {
    numeral: 'III.',
    title: 'Entry',
    subtitle: 'the first door',
    surfaces: [
      { label: 'frontispiece', href: '/frontispiece' },
      { label: 'home', href: '/' },
    ],
  },
  {
    numeral: 'IV.',
    title: 'Reading',
    subtitle: 'the book itself',
    surfaces: [
      { label: 'cover', href: '/cover' },
      { label: 'reading', href: '/wiki' },
      { label: 'interlace' },
      { label: 'review' },
      { label: 'compose' },
      { label: 'crystallize' },
      { label: 'panel', href: '/patterns' },
    ],
  },
  {
    numeral: 'V.',
    title: 'Actions',
    subtitle: 'arriving, keeping, sending',
    surfaces: [
      { label: 'import (ingestion)', href: '/uploads' },
      { label: 'panel detail', href: '/patterns' },
      { label: 'letter', href: '/letter' },
      { label: 'atelier', href: '/atelier' },
      { label: 'salon', href: '/salon' },
    ],
  },
  {
    numeral: 'VI.',
    title: 'Thinking',
    subtitle: "the mind's draft table",
    surfaces: [
      { label: 'sōan', href: '/soan' },
      { label: 'constellation', href: '/constellation' },
      { label: 'diagrams', href: '/diagrams' },
      { label: 'branching', href: '/branching' },
      { label: 'palimpsest', href: '/palimpsest' },
    ],
  },
  {
    numeral: 'VII.',
    title: 'The Desk',
    subtitle: 'between readings',
    surfaces: [
      { label: 'home', href: '/' },
      { label: 'shuttle' },
      { label: 'workbench', href: '/workbench' },
      { label: 'evening' },
    ],
  },
  {
    numeral: 'VIII.',
    title: 'Habitat',
    subtitle: 'sources and archive',
    surfaces: [
      { label: 'atlas', href: '/atlas' },
      { label: 'patterns', href: '/patterns' },
      { label: 'weaves', href: '/weaves' },
    ],
  },
];

export default function ContentsClient() {
  return (
    <main className="loom-contents">
      <div className="loom-contents-eyebrow">Contents</div>
      <h1 className="loom-contents-title">A reader’s map</h1>

      {chapters.map((ch) => (
        <section key={ch.numeral} className="loom-contents-chapter">
          <div className="loom-contents-chapter-num">{ch.numeral}</div>
          <div>
            <h2 className="loom-contents-chapter-title">{ch.title}</h2>
            <p className="loom-contents-chapter-subtitle">{ch.subtitle}</p>
            <div className="loom-contents-surfaces">
              {ch.surfaces.map((s, i) => (
                <span key={`${ch.numeral}-${s.label}`} style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.625rem' }}>
                  {s.href ? (
                    <Link href={s.href} className="loom-contents-surface-link">
                      {s.label}
                    </Link>
                  ) : (
                    <span
                      className="loom-contents-surface-link"
                      style={{ cursor: 'default', opacity: 0.7 }}
                    >
                      {s.label}
                    </span>
                  )}
                  {i < ch.surfaces.length - 1 && (
                    <span className="loom-contents-surface-sep">·</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* Back matter pointer — Colophon is the matching bookend. */}
      <section className="loom-contents-chapter">
        <div className="loom-contents-chapter-num">—</div>
        <div>
          <h2 className="loom-contents-chapter-title">Colophon</h2>
          <p className="loom-contents-chapter-subtitle">the type, the palette, the hand</p>
          <div className="loom-contents-surfaces">
            <Link href="/colophon" className="loom-contents-surface-link">
              colophon
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
