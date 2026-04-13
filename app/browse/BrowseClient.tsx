'use client';
/**
 * /browse — secondary reference index.
 *
 * §1, §11, §13 — the previous version was Apple TV streaming rows: aurora
 * hero, gradient cover tiles per doc, recently-viewed scroll-snap row,
 * file-type pills, "See all →" CTAs, internal horizontal scroll containers
 * (which §13 forbids). All chrome.
 *
 * /knowledge is the primary collection entry. /browse is the quieter,
 * secondary reference surface: text lists, direct chapter finding, no
 * "continue this collection" framing.
 */
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useHistory } from '../../lib/use-history';
import { useAllTraces, type Trace } from '../../lib/trace';
import { summarizeLearningSurface } from '../../lib/learning-status';

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
    const map = new Map<string, { touched: number; crystallized: number; examined: number; stale: number }>();
    for (const category of categories) {
      let touched = 0;
      let crystallized = 0;
      let examined = 0;
      let stale = 0;
      for (const doc of category.docs) {
        const docId = docIdForCategoryDoc(doc.id);
        const viewedAt = viewedByDocId.get(docId) ?? 0;
        const traceSet = tracesByDocId.get(docId) ?? [];
        const learning = summarizeLearningSurface(traceSet, viewedAt);
        if (learning.opened) touched += 1;
        if (learning.crystallized) crystallized += 1;
        if (learning.examinerCount > 0) examined += 1;
        if (learning.opened && learning.recency === 'stale') stale += 1;
      }
      map.set(category.slug, { touched, crystallized, examined, stale });
    }
    return map;
  }, [categories, tracesByDocId, viewedByDocId]);

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) return llmSections;
    return llmSections.filter((section) => matchesSection(section, normalizedQuery));
  }, [llmSections, normalizedQuery]);

  const groups = useMemo(() => groupTop(filteredCategories), [filteredCategories]);
  const hasResults = groups.length > 0 || filteredSections.length > 0;

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
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
          Reference
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a chapter or collection…"
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
          Nothing in the reference index matches “{query}”.
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
