'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY, type LoomPanelRecord } from '../lib/loom-panel-records';
import LoomDiagram from '../components/LoomDiagram';

/**
 * AtelierClient — writing across sources with real held material.
 *
 * This is intentionally modest but honest:
 * - source cards come from the native panels endpoint in the macOS shell
 * - the draft persists under `loom.atelier.current`
 * - when no held panels exist, the route renders a true empty state
 *
 * The full "pull a weft into the draft" interaction can still arrive later.
 * What ships here is a durable composition surface, not a fake showroom.
 */

type StoredPanel = Pick<LoomPanelRecord, 'id' | 'title' | 'sub' | 'body' | 'color'>;

type AtelierSource = {
  id: string;
  title: string;
  sub: string;
  excerpt: string;
  color: string;
};

const DRAFT_STORAGE_KEY = 'loom.atelier.current';
const MAX_SOURCES = 4;

function readDraft(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(next: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, next);
  } catch {
    // Non-fatal: the draft still lives in-memory for this session.
  }
}

/**
 * Draft → weft depth. Upgrade beyond the mockup's static LoomDiagram:
 * as the writer drafts more, the weave grows more rows. Empty draft
 * shows no wefts (just the warp waiting); first ~40 chars adds one;
 * a paragraph break adds the second; a third paragraph adds the
 * third. More than three is represented by still three rows — the
 * fourth pick would need a wider diagram, out of scope here.
 */
function weftCountForDraft(draft: string): number {
  const trimmed = draft.trim();
  if (trimmed.length < 40) return 0;
  const paragraphs = trimmed.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 3) return 3;
  if (paragraphs.length === 2) return 2;
  return 1;
}

function weftTonesForDraft(draft: string): string[] {
  const ALL = [
    'var(--accent)',
    'var(--tint-orange, #A8783E)',
    'var(--tint-green, #5C6E4E)',
  ];
  return ALL.slice(0, weftCountForDraft(draft));
}

/**
 * Cited range — a character span in the draft that matches a source.
 * Drives three synchronized UIs: the in-draft ProvHi overlay, the
 * warp-tint in LoomDiagram upstairs, and the numbered ProvenanceLedger
 * below. `start`/`end` are indices into the raw draft string (not the
 * lowercased haystack), so `draft.slice(start, end)` reproduces the
 * actual phrase as the writer typed it.
 */
type CitedRange = {
  source: AtelierSource;
  start: number;
  end: number;
  phrase: string;
  /** 1-indexed provenance number — stable across the sorted list. */
  n: number;
};

/**
 * Find cited ranges in the draft for each held source. Returns a
 * start-sorted, non-overlapping list. Case-insensitive substring
 * match; tries full excerpt first, falls back to a 40-char windowed
 * slide so the writer still gets credit for partial quotes.
 *
 * Non-overlap guarantee: if two sources' excerpts both land on the
 * same stretch of text (rare — they'd need near-identical phrasing),
 * only the first match wins, preventing double-highlight.
 */
function findCitedRanges(draft: string, sources: AtelierSource[]): CitedRange[] {
  const haystack = draft.toLowerCase();
  if (haystack.trim().length < 20) return [];
  const hits: Omit<CitedRange, 'n'>[] = [];
  for (const source of sources) {
    const excerpt = source.excerpt.trim();
    if (excerpt.length < 24) continue;
    const needle = excerpt.toLowerCase();
    let start = haystack.indexOf(needle);
    let phrase = excerpt;
    if (start < 0) {
      const WINDOW = 40;
      for (let i = 0; i + WINDOW <= needle.length; i += 8) {
        const slice = needle.slice(i, i + WINDOW);
        const s = haystack.indexOf(slice);
        if (s >= 0) {
          start = s;
          phrase = draft.slice(s, s + WINDOW);
          break;
        }
      }
    } else {
      phrase = draft.slice(start, start + needle.length);
    }
    if (start < 0) continue;
    const end = start + phrase.length;
    // Skip if this range overlaps any already-captured range.
    if (hits.some((h) => !(end <= h.start || start >= h.end))) continue;
    hits.push({ source, start, end, phrase });
  }
  hits.sort((a, b) => a.start - b.start);
  return hits.map((h, i) => ({ ...h, n: i + 1 }));
}

/**
 * Pull-into-draft — append a source's held excerpt to the draft as a
 * plain-text blockquote + attribution. Real functional upgrade over
 * the mockup: the mockup could only *show* a "pull weft" affordance,
 * Loom actually performs the pull. Keeps the draft plain text so the
 * contenteditable's paste / ::first-letter pipelines don't need to
 * negotiate HTML — the caller passes the new string to setDraft the
 * same way typing would.
 *
 * Spacing: we separate the appended block by a blank line so it sits
 * as its own paragraph. If the draft is empty, no leading newlines.
 */
function pullSourceIntoDraft(
  source: AtelierSource,
  current: string,
  setDraft: (next: string) => void,
): void {
  const quoted = `> ${source.excerpt.replace(/\s+$/g, '')}\n— ${source.title}`;
  const next = current.trim().length === 0 ? quoted + '\n\n' : `${current.replace(/\n+$/, '')}\n\n${quoted}\n\n`;
  setDraft(next);
}

function firstExcerpt(body: string | undefined): string {
  const text = (body ?? '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find(Boolean) ?? '';
  if (!text) return 'No written body yet. Hold this panel and begin drafting from it.';
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

async function loadAtelierSources(): Promise<AtelierSource[]> {
  const records = await loadPanelRecords();
  const out: AtelierSource[] = [];
  for (const entry of records as StoredPanel[]) {
    if (typeof entry.id !== 'string' || typeof entry.title !== 'string' || !entry.title) continue;
    out.push({
      id: entry.id,
      title: entry.title,
      sub: typeof entry.sub === 'string' ? entry.sub : 'held panel',
      excerpt: firstExcerpt(entry.body),
      color:
        typeof entry.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(entry.color)
          ? entry.color
          : '#9E7C3E',
    });
    if (out.length >= MAX_SOURCES) break;
  }
  return out;
}

export default function AtelierClient() {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [sources, setSources] = useState<AtelierSource[]>([]);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await loadAtelierSources();
      if (!cancelled) setSources(next);
    };
    setDraft(readDraft());
    void refresh();
    const dispose = subscribeLoomMirror(PANEL_RECORDS_KEY, 'loom-panels-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  useEffect(() => {
    writeDraft(draft);
  }, [draft]);

  const eyebrow = useMemo(() => {
    if (sources.length === 0) return 'Atelier · waiting for held material';
    return `Atelier · ${sources.length} ${sources.length === 1 ? 'panel' : 'panels'} open on the table`;
  }, [sources.length]);

  // Quiet writing stats — word + paragraph counts for the status
  // line. Oldstyle-nums CSS settings in .loom-atelier-wordcount give
  // them the manuscript look: numbers that sit on the baseline like
  // Garamond small-caps, not dashboard tabulars.
  const draftStats = useMemo(() => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) return { words: 0, paragraphs: 0 };
    const words = trimmed.split(/\s+/).filter(Boolean).length;
    const paragraphs = trimmed
      .split(/\n{2,}/)
      .filter((p) => p.trim().length > 0).length;
    return { words, paragraphs };
  }, [draft]);

  // Cited ranges in the draft — the single derivation that drives
  // three synchronized UIs at once: the in-draft ProvHi overlay,
  // the warp-tint upstairs, and the numbered ProvenanceLedger below.
  // One source of truth keeps the three layers honest.
  const citedRanges = useMemo(() => findCitedRanges(draft, sources), [draft, sources]);
  const citedIds = useMemo(
    () => new Set(citedRanges.map((r) => r.source.id)),
    [citedRanges],
  );
  const activeWarps = useMemo(
    () =>
      sources
        .slice(0, 9)
        .map((s, i) => (citedIds.has(s.id) ? i : -1))
        .filter((i) => i >= 0),
    [sources, citedIds],
  );

  // autosavedAt must live above the empty-state early return so the
  // hook count stays constant across renders. Previously sat inside
  // the non-empty branch — when sources flipped 0→1 React threw on
  // the hook-order mismatch. Depends on `draft` (not just time) so
  // the clock ticks forward every time the writer types, matching
  // the mockup's "autosaved 11:47" feel. New Date() runs at render
  // time so the clock always shows the actual wall time at the
  // last keystroke, not a stale cached value.
  const autosavedAt = useMemo(() => {
    const d = new Date();
    return `${d.getHours().toString().padStart(2, '0')}:${d
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (sources.length === 0) {
    return (
      <main className="loom-atelier">
        <div className="loom-example-eyebrow">{eyebrow}</div>
        <div className="loom-empty-state" role="note">
          {/* Unarmed loom — five warp threads waiting, no weft. A
              visual echo of what the Atelier *will* look like once
              panels are held; turns the empty page into an image of
              the thing, not a paragraph about it. */}
          <div
            className="loom-atelier-empty-loom"
            aria-hidden="true"
          >
            <LoomDiagram
              warpCount={5}
              weftTones={[]}
              height={72}
            />
          </div>
          <p className="loom-empty-state-copy">
            Atelier opens when a few held panels are ready to be written across at once.
            Keep a panel in Patterns, then return here to draft from the loom.
          </p>
          <Link href="/patterns" className="loom-empty-state-action">
            Open Patterns →
          </Link>
        </div>
      </main>
    );
  }

  // LEFT column shows the two panels closest at hand (first two in
  // the mirror); RIGHT column lists every held panel as a compact
  // chip so the writer sees what else is available without leaving
  // the surface. Mockup places up to 2 source panes on the left
  // (loom-atelier.jsx:46) and a chip stack on the right (:177).
  const leftPanes = sources.slice(0, 2);
  const rightChips = sources;

  return (
    <main className="loom-atelier">
      <section
        className="loom-atelier-sources"
        aria-label="two sources open on the table"
      >
        <div className="loom-atelier-held-label">sources · on the table</div>
        {leftPanes.map((source) => (
          <article
            key={source.id}
            className={
              'loom-atelier-source-card' +
              (flashId === source.id ? ' loom-atelier-source-card--pulled' : '')
            }
          >
            <div className="loom-atelier-source-title">{source.title}</div>
            <div
              style={{
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: '0.72rem',
                color: 'var(--muted)',
                marginBottom: '0.5rem',
              }}
            >
              — {source.sub}
            </div>
            <blockquote
              className="loom-atelier-source-quote"
              style={{ borderLeftColor: source.color }}
            >
              {source.excerpt}
            </blockquote>
            {/* Pull-into-draft — the mockup couldn't do this (static
                JSX). Clicking quietly appends the quote + attribution
                to the draft and briefly flashes the card so the user
                sees which source they just pulled from. */}
            <button
              type="button"
              className="loom-atelier-pull"
              onClick={() => {
                pullSourceIntoDraft(source, draft, setDraft);
                setFlashId(source.id);
                window.setTimeout(() => setFlashId((cur) => (cur === source.id ? null : cur)), 650);
              }}
              aria-label={`Pull passage from ${source.title} into draft`}
            >
              pull into draft →
            </button>
          </article>
        ))}
      </section>

      <section className="loom-atelier-compose" aria-label="draft">
        <div className="loom-atelier-toolbar" aria-hidden="true">
          {/* Removed the decorative "weave | quote note link hold" pill
              row: per the mockup those named five tool modes, but none
              were wired up so they read as non-functional chrome —
              confusing next to the real `pull into draft →` button
              above. The status line carries the actually-true things:
              draft state, autosave time, live word + paragraph count. */}
          <span className="loom-atelier-toolbar-status">
            draft · in your own hand ·{' '}
            <span className="loom-atelier-autosave">autosaved {autosavedAt}</span>
            {draftStats.words > 0 && (
              <>
                {' · '}
                <span className="loom-atelier-wordcount">
                  {draftStats.words}{' '}
                  {draftStats.words === 1 ? 'word' : 'words'}
                  {draftStats.paragraphs > 1 && (
                    <>
                      {' · '}
                      {draftStats.paragraphs} ¶
                    </>
                  )}
                </span>
              </>
            )}
          </span>
        </div>
        <AtelierDraft draft={draft} setDraft={setDraft} citedRanges={citedRanges} />
        <ProvenanceLedger matches={citedRanges} />
      </section>

      <aside
        className="loom-atelier-held"
        aria-label="every held panel, compact"
      >
        {/* Weave indicator — the held panels as warp, the draft's
            voices as weft. Mockup is static (loom-work.jsx:586).
            Upgraded here: warp count follows sources.length, weft
            rows follow draft depth (empty → no weft; ~40 chars → 1;
            ¶ → 2; 3¶ → 3). Each warp is also clickable — hovering
            shows the source title, clicking opens its panel. A
            static SVG mockup couldn't do this; live SVG is the
            surplus. */}
        <div className="loom-atelier-loom-wrap">
          <LoomDiagram
            warpCount={Math.max(3, Math.min(sources.length, 9))}
            weftTones={weftTonesForDraft(draft)}
            warpLabels={sources.slice(0, 9).map((s) => s.title)}
            activeWarps={activeWarps}
            onWarpClick={(i) => {
              const source = sources[i];
              if (source) {
                router.push(`/panel/${encodeURIComponent(source.id)}`);
              }
            }}
            height={96}
          />
          <div className="loom-atelier-loom-caption" aria-hidden="true">
            warp · weft · {weftCountForDraft(draft)}
          </div>
        </div>
        <div className="loom-atelier-held-label">held · {sources.length}</div>
        {rightChips.map((chip) => (
          <Link
            key={chip.id}
            href={`/panel/${encodeURIComponent(chip.id)}`}
            className={
              'loom-atelier-held-chip' +
              (citedIds.has(chip.id) ? ' loom-atelier-held-chip--cited' : '')
            }
            title={chip.excerpt}
          >
            <span className="loom-atelier-held-chip-title">{chip.title}</span>
            <span className="loom-atelier-held-chip-sub">{chip.sub}</span>
          </Link>
        ))}
      </aside>
    </main>
  );
}

/**
 * ProvenanceLedger · numbered cite-check below the draft.
 *
 * Now driven by the shared `findCitedRanges` pipeline — the numbering
 * here matches the superscript `¹ ² ³` marks that ProvOverlay paints
 * inline with the draft, so the reader can scan from a bronze
 * highlighted phrase directly to its source line below. Empty list →
 * component omits itself entirely (silent during first-draft writing).
 */
function ProvenanceLedger({ matches }: { matches: CitedRange[] }) {
  if (matches.length === 0) return null;

  return (
    <section className="loom-atelier-provenance" aria-label="provenance ledger">
      <div className="loom-atelier-provenance-rule" aria-hidden="true" />
      <div className="loom-atelier-provenance-label">provenance</div>
      <ol className="loom-atelier-provenance-list">
        {matches.map((m) => (
          <li key={`${m.source.id}-${m.n}`} className="loom-atelier-provenance-item">
            <span className="loom-atelier-provenance-n">{m.n}</span>
            <span className="loom-atelier-provenance-phrase">“{m.phrase}”</span>
            <span className="loom-atelier-provenance-source">— {m.source.title}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * AtelierDraft · contenteditable draft surface.
 *
 * Replaces the prior textarea so `::first-letter` can render a
 * genuine drop cap (browsers don't apply ::first-letter to form
 * fields). Kept minimal on purpose — this is plain text editing
 * with a single typographic flourish, not a rich-text editor:
 *
 *   - `contentEditable="plaintext-only"` strips incoming rich-text
 *     paste formatting (bold / fonts / colors that WYSIWYG paste
 *     would otherwise drag in from Word etc).
 *   - We only sync `innerText` back to state, so line breaks survive
 *     but no HTML leaks. The autosaved value in localStorage stays
 *     plain text, keeping it forward-compatible with a future
 *     rich-text upgrade.
 *   - Cursor-preservation: we only rewrite the DOM when an external
 *     change makes our innerText diverge (e.g., restored draft on
 *     mount). Mid-typing, we let the browser own the DOM so the
 *     caret doesn't jump — a classic contenteditable footgun.
 */
function AtelierDraft({
  draft,
  setDraft,
  citedRanges,
}: {
  draft: string;
  setDraft: (next: string) => void;
  citedRanges: CitedRange[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prevLen = useRef<number>(draft.length);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerText !== draft) {
      el.innerText = draft;
      // Big growth between renders = a pull-into-draft happened.
      // Bring the new tail into view so the writer sees the appended
      // quote land. Typing (1 char at a time) never trips this; only
      // large structural inserts do.
      const grew = draft.length - prevLen.current;
      if (grew >= 20) {
        try {
          el.scrollIntoView({ block: 'end', behavior: 'smooth' });
        } catch {
          /* old engines: no smooth scroll, no scroll at all is fine */
        }
      }
    }
    prevLen.current = draft.length;
  }, [draft]);

  return (
    <div className="loom-atelier-editor-wrap">
      <ProvOverlay draft={draft} citedRanges={citedRanges} />
      <div
        ref={ref}
        className="loom-atelier-editor"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="draft"
        data-placeholder="Begin writing. This draft persists, and every held panel stays visible while you compose."
        onInput={(e) => {
          const next = (e.currentTarget as HTMLDivElement).innerText;
          setDraft(next);
        }}
        // Plain-text paste — strip any rich content so copy/paste from
        // web pages or Word never drags font families in alongside the
        // words. The browser's default paste handler would otherwise
        // inject <span style="font-family:Calibri"> etc.
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
      />
    </div>
  );
}

/**
 * ProvOverlay · in-draft ProvHi painting layer.
 *
 * The mockup's inline `<ProvHi n="1">…</ProvHi>` (loom-atelier.jsx:110-123)
 * needed a rich-text editor to survive edits. Here, a read-only layer
 * sits pixel-aligned behind the plain-text contenteditable, rendering
 * the same text but with matched ranges wrapped in `<mark>` (bronze
 * tint + underline) and followed by a tiny bronze superscript numeral
 * `¹ ² ³` that cross-references the ProvenanceLedger below.
 *
 * Alignment math: overlay and editor share the same font-family, size,
 * line-height, padding, and whitespace handling (`white-space: pre-wrap`,
 * `word-break: break-word`), so a character at position `n` in the
 * editor lands at the same screen position in the overlay. The overlay
 * text itself is transparent; only the `<mark>` backgrounds and the
 * `<sup>` numerals show ink.
 *
 * This keeps the localStorage pipeline plain text, the `::first-letter`
 * drop cap still fires on the editor, and the paste handler still
 * strips rich content. The overlay is purely a painting layer.
 */
function ProvOverlay({
  draft,
  citedRanges,
}: {
  draft: string;
  citedRanges: CitedRange[];
}) {
  if (draft.length === 0 || citedRanges.length === 0) {
    // No ranges → render empty; saves DOM when the draft is fresh.
    return null;
  }
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  for (const r of citedRanges) {
    if (r.start > cursor) pieces.push(draft.slice(cursor, r.start));
    pieces.push(
      <mark key={`m-${r.n}`} className="loom-atelier-prov-hi">
        {draft.slice(r.start, r.end)}
        <sup className="loom-atelier-prov-hi-n">{r.n}</sup>
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < draft.length) pieces.push(draft.slice(cursor));
  return (
    <div className="loom-atelier-editor-overlay" aria-hidden="true">
      {pieces}
    </div>
  );
}
