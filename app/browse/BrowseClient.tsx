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

type DocCard = {
  id: string; title: string; href: string;
  ext: string; size: number; preview: string;
  subcategory: string;
};
type Category = { slug: string; label: string; count: number; docs: DocCard[] };
type LLMSection = { section: string; chapters: { slug: string; title: string }[] };

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

export function BrowseClient({
  categories,
  llmSections,
  totalDocs: _totalDocs,
}: {
  categories: Category[];
  llmSections: LLMSection[];
  totalDocs: number;
}) {
  const groups = groupTop(categories.filter((c) => c.docs.length > 0));

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
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
              </li>
            ))}
          </ul>
        </Block>
      ))}

      {llmSections.length > 0 && (
        <Block label="LLM">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {llmSections.map((s) => (
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
