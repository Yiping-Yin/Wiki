'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { DocViewer } from '../components/DocViewer';
import { DocBodyProvider } from '../components/DocBodyProvider';
import { DocOutline } from '../components/DocOutline';
import { PinButton } from '../components/PinButton';
import { RehearseThisButton } from '../components/RehearseThisButton';
import { LiveArtifact } from '../components/LiveArtifact';
import { AnchorLayer } from '../components/AnchorLayer';
import { TrackView } from '../components/TrackView';
import { EmptyDocCaptureSurface } from '../components/knowledge/EmptyDocCaptureSurface';
import { categoryTheme } from '../lib/category-theme';
import { isEligibleCaptureDoc } from '../lib/knowledge-doc-state';
import { isNativeMode } from '../lib/is-native-mode';

type KnowledgeDoc = {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  subOrder?: number;
  fileSlug: string;
  sourcePath: string;
  ext: string;
  size: number;
  hasText: boolean;
  preview: string;
};

type KnowledgeDocBody = {
  id: string;
  title: string;
  body: string;
};

type ResolvedDoc =
  | {
      kind: 'knowledge';
      href: string;
      title: string;
      ext: string;
      sourceUrl: string;
      body: string;
      docId: string;
      trackId: string;
      pinHref: string;
      breadcrumbLabel: string;
      breadcrumbHref: string;
      subcategory?: string;
      categorySlug: string;
      categoryLabel: string;
      prevHref?: string;
      prevTitle?: string;
      nextHref?: string;
      nextTitle?: string;
      related: Array<{ href: string; title: string; category: string }>;
    }
  | {
      kind: 'upload';
      href: string;
      title: string;
      ext: string;
      sourceUrl: string;
      body: string;
      docId: string;
      trackId: string;
      pinHref: string;
      sizeLabel: string;
    };

function knowledgeManifestUrl() {
  return isNativeMode()
    ? 'loom://content/knowledge/.cache/manifest/knowledge-manifest.json'
    : null;
}

function knowledgeBodyUrl(id: string) {
  return isNativeMode()
    ? `loom://content/knowledge/.cache/docs/${encodeURIComponent(id)}.json`
    : null;
}

function nativeKnowledgeSourceUrl(sourcePath: string) {
  return `loom://content/knowledge/${encodeURI(sourcePath)}`;
}

function nativeUploadSourceUrl(name: string) {
  return `loom://content/knowledge/uploads/${encodeURIComponent(name)}`;
}

function extOf(name: string): string {
  const match = name.match(/(\.[^.]+)$/);
  return match?.[1]?.toLowerCase() ?? '';
}

function readingMinutes(body: string) {
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

function sortDocs(a: KnowledgeDoc, b: KnowledgeDoc): number {
  return (a.subOrder ?? 9999) - (b.subOrder ?? 9999)
    || a.title.localeCompare(b.title);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function resolveKnowledgeDoc(href: string): Promise<ResolvedDoc | null> {
  const match = href.match(/^\/knowledge\/([^/]+)\/([^/?#]+)/);
  if (!match) return null;
  const manifestUrl = knowledgeManifestUrl();
  if (!manifestUrl) return null;

  const docs = await fetchJson<KnowledgeDoc[]>(manifestUrl);
  if (!docs) return null;

  const categorySlug = decodeURIComponent(match[1]);
  const fileSlug = decodeURIComponent(match[2]);
  const doc = docs.find((item) => item.categorySlug === categorySlug && item.fileSlug === fileSlug);
  if (!doc) return null;

  const bodyPayload = await fetchJson<KnowledgeDocBody>(knowledgeBodyUrl(doc.id)!);
  const body = bodyPayload?.body ?? '';
  const categoryDocs = docs.filter((item) => item.categorySlug === doc.categorySlug).sort(sortDocs);
  const index = categoryDocs.findIndex((item) => item.id === doc.id);
  const prev = index > 0 ? categoryDocs[index - 1] : null;
  const next = index >= 0 && index < categoryDocs.length - 1 ? categoryDocs[index + 1] : null;
  const related = docs
    .filter((item) => item.categorySlug !== doc.categorySlug)
    .slice(0, 4)
    .map((item) => ({
      href: `/doc?href=${encodeURIComponent(`/knowledge/${item.categorySlug}/${item.fileSlug}`)}`,
      title: item.title,
      category: item.category,
    }));

  return {
    kind: 'knowledge',
    href,
    title: doc.title,
    ext: doc.ext,
    sourceUrl: nativeKnowledgeSourceUrl(doc.sourcePath),
    body,
    docId: doc.id,
    trackId: `know/${doc.id}`,
    pinHref: href,
    breadcrumbLabel: doc.category,
    breadcrumbHref: `/knowledge/${doc.categorySlug}`,
    subcategory: doc.subcategory,
    categorySlug: doc.categorySlug,
    categoryLabel: doc.category,
    prevHref: prev ? `/doc?href=${encodeURIComponent(`/knowledge/${prev.categorySlug}/${prev.fileSlug}`)}` : undefined,
    prevTitle: prev?.title,
    nextHref: next ? `/doc?href=${encodeURIComponent(`/knowledge/${next.categorySlug}/${next.fileSlug}`)}` : undefined,
    nextTitle: next?.title,
    related,
  };
}

async function resolveUploadDoc(href: string): Promise<ResolvedDoc | null> {
  const match = href.match(/^\/uploads\/([^/?#]+)/);
  if (!match || !isNativeMode()) return null;
  const name = decodeURIComponent(match[1]);
  if (name.includes('/') || name.includes('..')) return null;

  const ext = extOf(name);
  const sourceUrl = nativeUploadSourceUrl(name);
  let body = '';
  if (['.txt', '.md', '.json', '.csv', '.tsv', '.ipynb'].includes(ext)) {
    try {
      body = await (await fetch(sourceUrl, { cache: 'no-store' })).text();
    } catch {
      body = '';
    }
  }

  return {
    kind: 'upload',
    href,
    title: name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '),
    ext,
    sourceUrl,
    body,
    docId: name,
    trackId: `upload/${name}`,
    pinHref: href,
    sizeLabel: 'uploaded source',
  };
}

export default function DocClient() {
  const params = useSearchParams();
  const href = params?.get('href') ?? '';
  const [doc, setDoc] = useState<ResolvedDoc | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!href) {
      setDoc(null);
      setLoaded(true);
      return;
    }

    if (!isNativeMode()) {
      window.location.replace(href);
      return;
    }

    (async () => {
      const resolved = href.startsWith('/knowledge/')
        ? await resolveKnowledgeDoc(href)
        : href.startsWith('/uploads/')
          ? await resolveUploadDoc(href)
          : null;
      if (cancelled) return;
      setDoc(resolved);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [href]);

  const minutes = useMemo(() => {
    if (!doc?.body) return 0;
    return readingMinutes(doc.body);
  }, [doc]);

  if (!loaded) {
    return <main className="prose-notion" style={{ minHeight: '60vh' }} />;
  }

  if (!href || !doc) {
    return (
      <main className="prose-notion" style={{ paddingTop: '4rem' }}>
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            No readable source is attached to this route.
          </p>
          <Link href="/sources" className="loom-empty-state-action">
            Open Sources →
          </Link>
        </div>
      </main>
    );
  }

  if (doc.kind === 'upload') {
    return (
      <main className="prose-notion">
        <TrackView id={doc.trackId} title={doc.title} href={doc.href} />
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          <Link href="/desk">Desk</Link> › <Link href="/uploads">Intake</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <h1 style={{ flex: 1 }}>{doc.title}</h1>
          <PinButton id={doc.trackId} title={doc.title} href={doc.pinHref} size="md" />
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          {doc.ext.slice(1).toUpperCase() || 'FILE'} · {doc.sizeLabel}
        </div>
        <DocBodyProvider body={doc.body} title={doc.title} />
        <DocViewer ext={doc.ext} sourceUrl={doc.sourceUrl} body={doc.body} title={doc.title} />
        <LiveArtifact docId={doc.trackId} />
      </main>
    );
  }

  const showCapture = isEligibleCaptureDoc({ title: doc.title, ext: doc.ext, body: doc.body });
  const theme = categoryTheme(doc.categorySlug);

  return (
    <div
      className="with-toc chapter-themed"
      style={{
        ['--accent' as never]: theme.accent,
        ['--accent-soft' as never]: theme.accentSoft,
        position: 'relative',
      }}
    >
      <DocOutline />
      <div className="doc-stage">
        <div style={{ minWidth: 0, position: 'relative' }} className="prose-notion loom-source-prose">
          <TrackView id={doc.trackId} title={doc.title} href={doc.href} />

          <nav
            aria-label="Breadcrumb"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-3)',
            }}
          >
            <Link href="/desk" className="t-caption" style={{ color: 'var(--muted)', textDecoration: 'none', fontWeight: 600 }}>
              Desk
            </Link>
            <span className="t-caption" style={{ color: 'var(--muted)' }}>›</span>
            <Link
              href={doc.breadcrumbHref}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 10px',
                borderRadius: 999,
                background: 'var(--accent-soft)',
                border: '0.5px solid var(--accent)',
                textDecoration: 'none',
              }}
            >
              <span
                className="loom-smallcaps"
                style={{
                  fontFamily: 'var(--serif)',
                  color: 'var(--accent)',
                  fontWeight: 500,
                  fontSize: '0.84rem',
                }}
              >
                {doc.breadcrumbLabel}
              </span>
            </Link>
            {doc.subcategory && (
              <>
                <span className="t-caption" style={{ color: 'var(--muted)' }}>›</span>
                <span className="t-caption" style={{ color: 'var(--fg-secondary)' }}>
                  {doc.subcategory}
                </span>
              </>
            )}
            {minutes > 0 && (
              <span className="t-caption" style={{ color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span aria-hidden>⏱</span> {minutes} min read
              </span>
            )}
          </nav>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <h1 style={{ flex: 1, margin: '0.6rem 0 1.4rem' }}>{doc.title}</h1>
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <RehearseThisButton
                docId={doc.docId}
                docTitle={doc.title}
                categorySlug={doc.categorySlug}
                categoryLabel={doc.categoryLabel}
                subcategory={doc.subcategory ?? ''}
                fileSlug={doc.href.split('/').pop() ?? ''}
              />
              <PinButton id={doc.trackId} title={doc.title} href={doc.pinHref} size="md" />
            </div>
          </div>

          {showCapture ? (
            <EmptyDocCaptureSurface docId={doc.docId} title={doc.title} categoryLabel={doc.categoryLabel} />
          ) : (
            <>
              <DocBodyProvider body={doc.body} title={doc.title} />
              <DocViewer ext={doc.ext} sourceUrl={doc.sourceUrl} body={doc.body} title={doc.title} />
            </>
          )}

          <div className="tag-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '1.4rem 0 0' }}>
            <span style={{
              display: 'inline-block',
              padding: '2px 10px',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              borderRadius: 999,
              fontSize: 'var(--fs-caption)',
              fontWeight: 600,
            }}>{doc.categoryLabel}</span>
            {doc.subcategory && (
              <span style={{
                display: 'inline-block',
                padding: '2px 10px',
                background: 'color-mix(in srgb, var(--mat-border) 40%, transparent)',
                color: 'var(--fg-secondary)',
                borderRadius: 999,
                fontSize: 'var(--fs-caption)',
                fontWeight: 500,
              }}>{doc.subcategory}</span>
            )}
            <span style={{
              display: 'inline-block',
              padding: '2px 10px',
              background: 'color-mix(in srgb, var(--mat-border) 30%, transparent)',
              color: 'var(--muted)',
              borderRadius: 999,
              fontSize: 'var(--fs-caption)',
              fontFamily: 'var(--mono)',
              fontWeight: 500,
            }}>{doc.ext || '.txt'}</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '1.5rem',
              marginTop: '3rem',
              borderTop: '0.5px solid var(--mat-border)',
              paddingTop: '1rem',
            }}
          >
            {doc.prevHref ? (
              <Link href={doc.prevHref} style={{ flex: 1, textDecoration: 'none', color: 'var(--fg)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 2 }}>Previous</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.45 }}>{doc.prevTitle}</div>
              </Link>
            ) : <div style={{ flex: 1 }} />}
            {doc.nextHref ? (
              <Link href={doc.nextHref} style={{ flex: 1, textDecoration: 'none', color: 'var(--fg)', textAlign: 'right' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 2 }}>Next</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.45 }}>{doc.nextTitle}</div>
              </Link>
            ) : <div style={{ flex: 1 }} />}
          </div>

          {doc.related.length > 0 && (
            <div style={{ marginTop: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
                <span className="loom-smallcaps" style={{ color: 'var(--muted)', fontFamily: 'var(--serif)', fontWeight: 500, fontSize: '0.84rem' }}>
                  Related
                </span>
                <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
              </div>
              {doc.related.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '0.45rem 0',
                    borderBottom: '0.5px solid var(--mat-border)',
                    textDecoration: 'none',
                    color: 'var(--fg)',
                  }}
                >
                  <span style={{
                    flex: 1,
                    fontFamily: 'var(--display)',
                    fontSize: '0.88rem',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{item.title}</span>
                  <span className="t-caption2" style={{ color: 'var(--muted)', flexShrink: 0 }}>
                    {item.category}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {!showCapture ? <LiveArtifact docId={doc.trackId} /> : null}
        {!showCapture ? <AnchorLayer docId={doc.trackId} /> : null}
      </div>
    </div>
  );
}
