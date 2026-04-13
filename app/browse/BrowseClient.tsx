'use client';
/**
 * /browse — text index of all collections, by top-level group.
 *
 * §1, §11, §13 — the previous version was Apple TV streaming rows: aurora
 * hero, gradient cover tiles per doc, recently-viewed scroll-snap row,
 * file-type pills, "See all →" CTAs, internal horizontal scroll containers
 * (which §13 forbids). All chrome.
 *
 * /knowledge keeps the kesi-swatch grid view of the same data; /browse
 * is the text-list complement — strict typography, no visuals. Same
 * grammar as /notes /highlights /quizzes.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useHistory } from '../../lib/use-history';
import { useAllTraces, type Trace } from '../../lib/trace';
import { summarizeLearningSurface, type LearningNextAction } from '../../lib/learning-status';

type DocCard = {
  id: string; title: string; href: string;
  ext: string; size: number; preview: string;
  subcategory: string;
};
type Category = { slug: string; label: string; count: number; docs: DocCard[] };
type LLMSection = { section: string; chapters: { slug: string; title: string }[] };

function docIdForCategoryDoc(id: string) {
  return `know/${id}`;
}

function groupTop(cats: Category[]) {
  const groups = new Map<string, Category[]>();
  for (const c of cats) {
    const m = c.label.match(/^([^·]+?)\s*·/);
    const top = m ? m[1].trim() : 'Other';
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top)!.push(c);
  }
  return Array.from(groups.entries())
    .map(([label, items]) => ({
      label,
      count: items.reduce((s, c) => s + c.count, 0),
      items: items.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.count - a.count);
}

function displayLabel(label: string) {
  return label.replace(/^[^·]+·\s*/, '');
}

function categoryPreview(category: Category) {
  const subcategories = Array.from(
    new Set(category.docs.map((doc) => doc.subcategory.trim()).filter(Boolean)),
  );
  if (subcategories.length > 0) return subcategories.slice(0, 3).join(' · ');
  return category.docs.slice(0, 3).map((doc) => doc.title).join(' · ');
}

function llmPreview(section: LLMSection) {
  return section.chapters.slice(0, 3).map((chapter) => chapter.title).join(' · ');
}

function matchesCategory(category: Category, query: string) {
  const hay = [
    category.label,
    ...category.docs.map((doc) => `${doc.title} ${doc.subcategory}`),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}

function matchesSection(section: LLMSection, query: string) {
  const hay = [section.section, ...section.chapters.map((chapter) => chapter.title)]
    .join(' ')
    .toLowerCase();
  return hay.includes(query);
}

export function BrowseClient({
  categories,
  llmSections,
  totalDocs,
}: {
  categories: Category[];
  llmSections: LLMSection[];
  totalDocs: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [history] = useHistory();
  const { traces } = useAllTraces();
  const normalizedQuery = query.trim().toLowerCase();

  const viewedByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      map.set(entry.id, Math.max(map.get(entry.id) ?? 0, entry.viewedAt));
    }
    return map;
  }, [history]);

  const tracesByDocId = useMemo(() => {
    const map = new Map<string, Trace[]>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const existing = map.get(trace.source.docId) ?? [];
      existing.push(trace);
      map.set(trace.source.docId, existing);
    }
    return map;
  }, [traces]);

  const filteredCategories = useMemo(() => {
    const base = categories.filter((category) => category.docs.length > 0);
    if (!normalizedQuery) return base;
    return base.filter((category) => matchesCategory(category, normalizedQuery));
  }, [categories, normalizedQuery]);

  const categoryProgress = useMemo(() => {
    const map = new Map<string, { touched: number; crystallized: number; examined: number; stale: number; latestTouched: number; nextAction: LearningNextAction }>();
    for (const category of categories) {
      let touched = 0;
      let crystallized = 0;
      let examined = 0;
      let stale = 0;
      let latestTouched = 0;
      let nextAction: LearningNextAction = 'capture';
      for (const doc of category.docs) {
        const docId = docIdForCategoryDoc(doc.id);
        const viewedAt = viewedByDocId.get(docId) ?? 0;
        const traceSet = tracesByDocId.get(docId) ?? [];
        const learning = summarizeLearningSurface(traceSet, viewedAt);
        if (learning.opened) touched += 1;
        if (learning.crystallized) crystallized += 1;
        if (learning.examinerCount > 0) examined += 1;
        if (learning.opened && learning.recency === 'stale') stale += 1;
        latestTouched = Math.max(latestTouched, learning.touchedAt);
        if (browseNextActionRank[learning.nextAction] < browseNextActionRank[nextAction]) {
          nextAction = learning.nextAction;
        }
      }
      map.set(category.slug, { touched, crystallized, examined, stale, latestTouched, nextAction });
    }
    return map;
  }, [categories, tracesByDocId, viewedByDocId]);

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return llmSections;
    return llmSections.filter((section) => matchesSection(section, normalizedQuery));
  }, [llmSections, normalizedQuery]);

  const focusCollection = useMemo(() => {
    return filteredCategories
      .filter((category) => (categoryProgress.get(category.slug)?.touched ?? 0) > 0)
      .sort((a, b) => {
        const ap = categoryProgress.get(a.slug)!;
        const bp = categoryProgress.get(b.slug)!;
        if (browseNextActionRank[ap.nextAction] !== browseNextActionRank[bp.nextAction]) {
          return browseNextActionRank[ap.nextAction] - browseNextActionRank[bp.nextAction];
        }
        return bp.latestTouched - ap.latestTouched;
      })[0] ?? null;
  }, [filteredCategories, categoryProgress]);

  const groups = useMemo(() => groupTop(filteredCategories), [filteredCategories]);
  const hasResults = groups.length > 0 || filteredSections.length > 0;

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      {focusCollection && (() => {
        const progress = categoryProgress.get(focusCollection.slug)!;
        return (
          <section
            style={{
              padding: '0.1rem 0 1rem',
              marginBottom: 20,
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.65 }} />
              <span
                className="t-caption2"
                style={{
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
            >
                Keep this collection warm
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div
                  style={{
                    fontFamily: 'var(--display)',
                    fontSize: '1.18rem',
                    fontWeight: 650,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.25,
                    marginBottom: 6,
                  }}
                >
                  {displayLabel(focusCollection.label)}
                </div>

                <div
                  className="t-caption2"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    color: 'var(--muted)',
                    letterSpacing: '0.04em',
                    marginBottom: 8,
                  }}
                >
                  <span>{focusCollection.count} docs</span>
                  <span aria-hidden>·</span>
                  <span>{progress.touched} touched</span>
                  {progress.examined > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{progress.examined} examined</span>
                    </>
                  )}
                  {progress.crystallized > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{progress.crystallized} settled</span>
                    </>
                  )}
                  {progress.stale > 0 && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{progress.stale} stale</span>
                    </>
                  )}
                </div>

                <div
                  style={{
                    color: 'var(--fg-secondary)',
                    fontSize: '0.9rem',
                    lineHeight: 1.55,
                  }}
                >
                  {browseFocusLine(progress.nextAction)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexShrink: 0, alignSelf: 'center' }}>
                <button
                  type="button"
                  onClick={() => router.push(`/knowledge/${focusCollection.slug}`)}
                  style={browseActionStyle(true)}
                >
                  {browsePrimaryLabel(progress.nextAction)}
                </button>
              </div>
            </div>
          </section>
        );
      })()}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0.25rem 0 0.65rem',
          marginBottom: 24,
          borderBottom: '0.5px solid var(--mat-border)',
        }}
      >
        <span
          aria-hidden
          style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1 }}
        >
          Browse
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a collection or chapter…"
          style={{
            flex: 1,
            minWidth: 0,
            border: 0,
            outline: 'none',
            background: 'transparent',
            color: 'var(--fg)',
            fontFamily: 'var(--display)',
            fontSize: '0.92rem',
            letterSpacing: '-0.01em',
          }}
        />
        <span
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            fontFamily: 'var(--mono)',
            fontVariantNumeric: 'tabular-nums',
            flexShrink: 0,
          }}
        >
          {normalizedQuery ? `${filteredCategories.length + filteredSections.length}` : totalDocs}
        </span>
      </div>

      {!hasResults && (
        <div
          style={{
            padding: '0.8rem 0',
            color: 'var(--muted)',
            fontStyle: 'italic',
            marginBottom: 24,
            borderBottom: '0.5px solid var(--mat-border)',
          }}
        >
          Nothing in Loom matches “{query}”.
        </div>
      )}

      {groups.map((g) => (
        <Block key={g.label} label={g.label}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {g.items.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/knowledge/${c.slug}`}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 14,
                    padding: '0.6rem 0',
                    color: 'var(--fg)', textDecoration: 'none',
                    borderBottom: '0.5px solid var(--mat-border)',
                  }}
                >
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontFamily: 'var(--display)',
                    fontSize: '1rem',
                    fontWeight: 500,
                    letterSpacing: '-0.012em',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{c.label.replace(/^[^·]+·\s*/, '')}</span>
                  <span className="t-caption" style={{
                    color: 'var(--muted)', flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'var(--mono)',
                  }}>{c.count}</span>
                </Link>
                <div
                  className="t-caption2"
                  style={{
                    color: 'var(--muted)',
                    marginTop: -4,
                    marginBottom: 10,
                    marginLeft: 2,
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {categoryPreview(c)}
                </div>
                {categoryProgress.get(c.slug)?.touched ? (
                  <div
                    className="t-caption2"
                    style={{
                      color: 'var(--muted)',
                      marginTop: -4,
                      marginBottom: 10,
                      marginLeft: 2,
                      lineHeight: 1.5,
                      letterSpacing: '0.04em',
                    }}
                  >
                    {categoryProgress.get(c.slug)!.touched} touched
                    {categoryProgress.get(c.slug)!.examined > 0 && ` · ${categoryProgress.get(c.slug)!.examined} examined`}
                    {categoryProgress.get(c.slug)!.crystallized > 0 && ` · ${categoryProgress.get(c.slug)!.crystallized} finished`}
                    {categoryProgress.get(c.slug)!.stale > 0 && ` · ${categoryProgress.get(c.slug)!.stale} stale`}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </Block>
      ))}

      {filteredSections.length > 0 && (
        <Block label="LLM">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {filteredSections.map((s) => (
              <li key={s.section}>
                <Link
                  href={`/wiki/${s.chapters[0]?.slug ?? 'llm101n'}`}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 14,
                    padding: '0.6rem 0',
                    color: 'var(--fg)', textDecoration: 'none',
                    borderBottom: '0.5px solid var(--mat-border)',
                  }}
                >
                  <span style={{
                    flex: 1, minWidth: 0,
                    fontFamily: 'var(--display)',
                    fontSize: '1rem',
                    fontWeight: 500,
                    letterSpacing: '-0.012em',
                  }}>{s.section}</span>
                  <span className="t-caption" style={{
                    color: 'var(--muted)', flexShrink: 0,
                    fontVariantNumeric: 'tabular-nums',
                    fontFamily: 'var(--mono)',
                  }}>{s.chapters.length}</span>
                </Link>
                <div
                  className="t-caption2"
                  style={{
                    color: 'var(--muted)',
                    marginTop: -4,
                    marginBottom: 10,
                    marginLeft: 2,
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {llmPreview(s)}
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

const browseNextActionRank: Record<LearningNextAction, number> = {
  refresh: 0,
  examine: 1,
  rehearse: 2,
  revisit: 3,
  capture: 4,
};

function browsePrimaryLabel(nextAction: LearningNextAction) {
  switch (nextAction) {
    case 'refresh':
      return 'Return';
    case 'examine':
      return 'Ask';
    case 'rehearse':
      return 'Write';
    case 'capture':
      return 'Open';
    default:
      return 'Review';
  }
}

function browseFocusLine(nextAction: LearningNextAction) {
  switch (nextAction) {
    case 'refresh':
      return 'This collection has cooled. Re-enter it and warm the weave back up.';
    case 'examine':
      return 'This collection is ready to verify. Move from rehearsal into examiner while it is still coherent.';
    case 'rehearse':
      return 'This collection has captures that still need shaping into stronger understanding.';
    case 'capture':
      return 'You have opened this collection before, but the weave has barely started. Return and capture the live passages.';
    default:
      return 'This collection is already in motion. Return to review and keep the weave coherent.';
  }
}

function browseActionStyle(primary: boolean) {
  return {
    appearance: 'none' as const,
    border: 0,
    borderBottom: `0.5px solid ${primary ? 'var(--accent)' : 'var(--mat-border)'}`,
    background: 'transparent',
    color: primary ? 'var(--accent)' : 'var(--fg-secondary)',
    borderRadius: 999,
    padding: '0.3rem 0',
    fontSize: '0.82rem',
    fontWeight: 650,
    letterSpacing: '-0.01em',
    lineHeight: 1,
    cursor: 'pointer',
  };
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2.4rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 14,
      }}>
        <span aria-hidden style={{
          width: 18, height: 1,
          background: 'var(--accent)', opacity: 0.55,
        }} />
        <span className="t-caption2" style={{
          color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.10em',
          fontWeight: 700,
        }}>{label}</span>
        <span aria-hidden style={{
          flex: 1, height: 1, background: 'var(--mat-border)',
        }} />
      </div>
      {children}
    </section>
  );
}
