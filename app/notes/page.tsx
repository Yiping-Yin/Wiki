'use client';

/**
 * /notes — committed anchored notes, grouped by source.
 *
 * The old route was a static explanation that "notes are now anchored notes".
 * That claim is now true enough that the route should show the notes
 * themselves: the latest pieces of understanding the user has actually
 * woven, with a direct path back into review at the exact anchor.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QuietGuideCard } from '../../components/QuietGuideCard';
import { openPanelReview } from '../../lib/panel-resume';
import { useAllTraces } from '../../lib/trace';

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
    const r = await fetch('/api/search-index');
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

  const notes = useMemo(() => {
    const docsById = new Map<string, IndexDoc>();
    for (const doc of indexDocs) docsById.set(doc.id, doc);

    const items: NoteItem[] = [];
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const meta = docsById.get(trace.source.docId);
      for (const event of trace.events) {
        if (event.kind !== 'thought-anchor') continue;
        if (!event.content.trim() && !event.summary.trim()) continue;
        items.push({
          docId: trace.source.docId,
          href: meta?.href ?? inferHrefFromId(trace.source.docId),
          title: meta?.title ?? trace.source.sourceTitle ?? trace.source.docId,
          anchorId: event.anchorId,
          section: event.anchorType === 'heading' ? event.anchorId : undefined,
          summary: event.summary || event.content,
          quote: event.quote,
          at: event.at,
        });
      }
    }

    items.sort((a, b) => b.at - a.at);
    return items;
  }, [indexDocs, traces]);

  const grouped = useMemo(() => {
    const byDoc = new Map<string, { href: string; title: string; items: NoteItem[] }>();
    for (const note of notes) {
      const existing = byDoc.get(note.docId);
      if (existing) {
        existing.items.push(note);
      } else {
        byDoc.set(note.docId, {
          href: note.href,
          title: note.title,
          items: [note],
        });
      }
    }
    return Array.from(byDoc.entries())
      .map(([docId, value]) => ({ docId, ...value }))
      .sort((a, b) => (b.items[0]?.at ?? 0) - (a.items[0]?.at ?? 0));
  }, [notes]);

  if (!mounted) return null;
  if (grouped.length === 0) return null;

  const focus = grouped[0]?.items[0] ?? null;

  const openReview = (note: NoteItem) => {
    openPanelReview(router, { href: note.href, anchorId: note.anchorId });
  };

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 18,
            height: 1,
            background: 'var(--accent)',
            opacity: 0.55,
          }}
        />
        <span
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            fontWeight: 700,
          }}
        >
          Anchored Notes
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
      </div>

      {focus && (
        <QuietGuideCard
          eyebrow="Return to this note"
          title={focus.title}
          meta={<span>{formatWhen(focus.at)}</span>}
          summary={focus.summary}
          mode="inline"
          actions={[
            { label: 'Return to note', onClick: () => openReview(focus), primary: true },
          ]}
        />
      )}

      {grouped.map((doc) => (
        <section key={doc.docId} style={{ marginBottom: '2rem' }}>
          <Link
            href={doc.href}
            style={{
              display: 'block',
              color: 'var(--accent)',
              textDecoration: 'none',
              fontFamily: 'var(--display)',
              fontSize: '0.92rem',
              fontWeight: 600,
              letterSpacing: '-0.005em',
              marginBottom: 8,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {doc.title}
          </Link>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {doc.items.slice(0, 6).map((note, index) => (
              <li
                key={`${note.anchorId}-${note.at}`}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '0.55rem 0',
                  borderBottom: index < Math.min(doc.items.length, 6) - 1 ? '0.5px solid var(--mat-border)' : 'none',
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
                    fontSize: '0.94rem',
                    lineHeight: 1.6,
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
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatWhen(ts: number) {
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < day * 2) return 'yesterday';
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 30) return `${Math.floor(diff / (day * 7))}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
