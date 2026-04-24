'use client';

/**
 * /notes — committed anchored notes, grouped by source.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageFrame } from '../../components/PageFrame';
import { openPanelReview } from '../../lib/panel-resume';
import { useAllTraces } from '../../lib/trace';
import { fetchSearchIndex } from '../../lib/search-index-client';

type IndexDoc = { id: string; title: string; href: string; category: string };
type NoteItem = {
  docId: string;
  href: string;
  title: string;
  anchorId: string;
  section?: string;
  summary: string;
  quote?: string;
  at: number;
};

let _idxCache: IndexDoc[] | null = null;
async function loadDocs(): Promise<IndexDoc[]> {
  if (_idxCache) return _idxCache;
  try {
    const r = await fetchSearchIndex();
    if (!r.ok) return [];
    const payload = await r.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const out: IndexDoc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      out.push({
        id: String(docIds[internal] ?? internal),
        title: fields.title,
        href: fields.href,
        category: fields.category ?? '',
      });
    }
    _idxCache = out;
    return out;
  } catch {
    return [];
  }
}

function inferHrefFromId(id: string): string {
  const w = id.match(/^wiki\/(.+)$/);
  if (w) return `/wiki/${w[1]}`;
  const k = id.match(/^know\/([^_]+(?:_[^_]+)*)__(.+)$/);
  if (k) return `/knowledge/${k[1]}/${k[2]}`;
  return '#';
}

export default function NotesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [indexDocs, setIndexDocs] = useState<IndexDoc[]>([]);
  const { traces } = useAllTraces();

  useEffect(() => {
    setMounted(true);
    loadDocs().then(setIndexDocs);
  }, []);

  const grouped = useMemo(() => {
    const docsById = new Map<string, IndexDoc>();
    for (const doc of indexDocs) docsById.set(doc.id, doc);

    const byDoc = new Map<string, { href: string; title: string; items: NoteItem[] }>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const meta = docsById.get(trace.source.docId);
      for (const event of trace.events) {
        if (event.kind !== 'thought-anchor') continue;
        if (!event.content.trim() && !event.summary.trim()) continue;
        const note: NoteItem = {
          docId: trace.source.docId,
          href: meta?.href ?? inferHrefFromId(trace.source.docId),
          title: meta?.title ?? trace.source.sourceTitle ?? trace.source.docId,
          anchorId: event.anchorId,
          section: event.anchorType === 'heading' ? event.anchorId : undefined,
          summary: event.summary || event.content,
          quote: event.quote,
          at: event.at,
        };
        const existing = byDoc.get(note.docId);
        if (existing) {
          existing.items.push(note);
        } else {
          byDoc.set(note.docId, { href: note.href, title: note.title, items: [note] });
        }
      }
    }
    return Array.from(byDoc.entries())
      .map(([docId, value]) => ({
        docId,
        ...value,
        items: value.items.sort((a, b) => b.at - a.at),
      }))
      .sort((a, b) => (b.items[0]?.at ?? 0) - (a.items[0]?.at ?? 0));
  }, [indexDocs, traces]);

  const openReview = (note: NoteItem) => {
    openPanelReview(router, { href: note.href, anchorId: note.anchorId });
  };

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: 'var(--space-7)' }}>
      <PageFrame
        eyebrow="Notes"
        title="Anchored notes."
        description="Every understanding you've woven, grouped by source."
      >
        {!mounted ? null : grouped.length === 0 ? (
          <div
            style={{
              padding: 'clamp(2rem, 6vh, 4rem) 0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
              alignItems: 'flex-start',
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            <p style={{
              margin: 0,
              fontFamily: 'var(--display)',
              fontStyle: 'italic',
              fontSize: 'clamp(1.1rem, 1.1vw + 0.6rem, 1.4rem)',
              lineHeight: 1.4,
              color: 'var(--fg)',
            }}>
              No anchored notes yet.
            </p>
            <p style={{
              margin: 0,
              fontFamily: 'var(--serif)',
              fontSize: '0.92rem',
              lineHeight: 1.5,
              color: 'var(--fg-secondary)',
              maxWidth: '32em',
            }}>
              Open a source and anchor your first thought to a passage. Notes here are by-products of reading — not the reason to read.
            </p>
          </div>
        ) : (
          grouped.map((doc) => (
            <section key={doc.docId} style={{ marginBottom: 'var(--space-7)' }}>
              <Link
                href={doc.href}
                style={{
                  display: 'block',
                  color: 'var(--accent)',
                  textDecoration: 'none',
                  fontFamily: 'var(--display)',
                  fontSize: 'var(--fs-body)',
                  fontStyle: 'italic',
                  fontWeight: 500,
                  letterSpacing: '-0.012em',
                  marginBottom: 'var(--space-2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {doc.title}
              </Link>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {doc.items.slice(0, 6).map((note, index) => {
                  const isLast = index === Math.min(doc.items.length, 6) - 1;
                  return (
                    <li
                      key={`${note.anchorId}-${note.at}`}
                      style={{
                        display: 'flex',
                        gap: 'var(--space-3)',
                        padding: '0.55rem 0',
                        borderBottom: isLast ? 'none' : '0.5px solid var(--mat-border)',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 2,
                          alignSelf: 'stretch',
                          background: 'var(--accent)',
                          borderRadius: 999,
                          flexShrink: 0,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => openReview(note)}
                        style={{
                          margin: 0,
                          flex: 1,
                          color: 'var(--fg)',
                          textDecoration: 'none',
                          fontSize: 'var(--fs-body-lg)',
                          lineHeight: 'var(--lh-relaxed)',
                          textAlign: 'left',
                          background: 'transparent',
                          border: 0,
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        {note.summary}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </PageFrame>
    </div>
  );
}
