'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { isNativeMode } from '../lib/is-native-mode';

type KnowledgeCategory = {
  slug: string;
  label: string;
  count: number;
  kind: 'source' | 'wiki';
};

type KnowledgeDoc = {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  fileSlug: string;
  ext: string;
  preview: string;
};

type NavPayload = {
  knowledgeCategories: KnowledgeCategory[];
};

const NAV_URL = 'loom://content/knowledge/.cache/manifest/knowledge-nav.json';
const MANIFEST_URL = 'loom://content/knowledge/.cache/manifest/knowledge-manifest.json';

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function CollectionClient() {
  const params = useSearchParams();
  const slug = params?.get('slug') ?? '';
  const [category, setCategory] = useState<KnowledgeCategory | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading collection…');

  useEffect(() => {
    let cancelled = false;

    if (!slug) {
      setLoaded(true);
      return;
    }

    if (!isNativeMode()) {
      window.location.replace(`/knowledge/${encodeURIComponent(slug)}`);
      return;
    }

    setCategory(null);
    setDocs([]);
    setLoaded(false);
    setLoadingMessage('Loading collection…');

    (async () => {
      const [nav, manifest] = await Promise.all([
        fetchJson<NavPayload>(NAV_URL),
        fetchJson<KnowledgeDoc[]>(MANIFEST_URL),
      ]);
      if (cancelled) return;

      if (!nav || !manifest) {
        setCategory(null);
        setDocs([]);
        setLoaded(true);
        setLoadingMessage('Collection data did not arrive. Try Reload sources.');
        return;
      }

      const nextCategory = nav.knowledgeCategories.find((item) => item.slug === slug) ?? null;
      const nextDocs = manifest
        .filter((item) => item.categorySlug === slug)
        .sort((a, b) => a.title.localeCompare(b.title));

      setCategory(nextCategory);
      setDocs(nextDocs);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const title = useMemo(() => category?.label ?? slug, [category, slug]);

  if (!loaded) {
    return (
      <main className="prose-notion" style={{ paddingTop: '4rem' }}>
        <div className="loom-empty-state" role="status" aria-live="polite">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">{loadingMessage}</p>
        </div>
      </main>
    );
  }

  if (!slug || !category) {
    return (
      <main className="prose-notion" style={{ paddingTop: '4rem' }}>
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            This collection is not available in the current source set.
          </p>
          <Link href="/sources" className="loom-empty-state-action">
            Open Sources →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="prose-notion" style={{ paddingTop: '4rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
        <Link href="/desk">Desk</Link> › <span>Sources</span> › {title}
      </div>
      <h1 style={{ marginBottom: '0.4rem' }}>{title}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: '1.5rem' }}>
        {docs.length} {docs.length === 1 ? 'source' : 'sources'} in this collection.
      </p>

      {docs.length === 0 ? (
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            No readable sources have settled into this collection yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {docs.map((doc) => (
            <Link
              key={doc.id}
              href={`/doc?href=${encodeURIComponent(`/knowledge/${doc.categorySlug}/${doc.fileSlug}`)}`}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'baseline',
                padding: '0.75rem 0',
                borderBottom: '0.5px solid var(--mat-border)',
                textDecoration: 'none',
                color: 'var(--fg)',
              }}
            >
              <span
                style={{
                  flex: 1,
                  fontFamily: 'var(--display)',
                  fontSize: '1rem',
                  fontWeight: 500,
                }}
              >
                {doc.title}
              </span>
              <span className="t-caption2" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                {doc.ext.replace(/^\./, '').toUpperCase()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
