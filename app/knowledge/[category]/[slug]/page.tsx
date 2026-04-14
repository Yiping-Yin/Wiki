import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findDoc, getKnowledgeCategories, neighborsInCategory, relatedDocs } from '../../../../lib/knowledge-store';
import { TrackView } from '../../../../components/TrackView';
import { DocViewer } from '../../../../components/DocViewer';
import { DocBodyProvider } from '../../../../components/DocBodyProvider';
import { DocOutline } from '../../../../components/DocOutline';
import { PinButton } from '../../../../components/PinButton';
import { LiveArtifact } from '../../../../components/LiveArtifact';
import { AnchorLayer } from '../../../../components/AnchorLayer';
import { readKnowledgeDocBody } from '../../../../lib/knowledge-doc-cache';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  const categorySlug = decodeURIComponent(category);
  const fileSlug = decodeURIComponent(slug);
  const doc = await findDoc(categorySlug, fileSlug);
  return { title: doc ? `${doc.title} · ${doc.category}` : 'Knowledge' };
}

async function loadBody(id: string): Promise<string> {
  return (await readKnowledgeDocBody(id))?.body ?? '';
}

export default async function DocPage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  const categorySlug = decodeURIComponent(category);
  const fileSlug = decodeURIComponent(slug);
  const [doc, knowledgeCategories] = await Promise.all([
    findDoc(categorySlug, fileSlug),
    getKnowledgeCategories(),
  ]);
  if (!doc) notFound();

  const body = await loadBody(doc.id);
  const cat = knowledgeCategories.find((c) => c.slug === categorySlug);
  const { prev, next } = await neighborsInCategory(categorySlug, fileSlug);
  const sourceUrl = `/api/source?p=${encodeURIComponent(doc.sourcePath)}`;

  return (
    <div className="with-toc">
      <DocOutline />

      <div className="doc-stage">
        <div style={{ minWidth: 0, position: 'relative' }} className="prose-notion loom-source-prose">
          <TrackView id={`know/${doc.id}`} title={doc.title} href={`/knowledge/${doc.categorySlug}/${doc.fileSlug}`} />

          <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
            <Link href={`/knowledge/${categorySlug}`}>{cat?.label}</Link>
            {doc.subcategory && <> › <span style={{ color: 'var(--fg-secondary)' }}>{doc.subcategory}</span></>}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <h1 style={{ flex: 1, margin: '0.6rem 0 1.4rem' }}>{doc.title}</h1>
            <div style={{ marginTop: '1rem' }}>
              <PinButton
                id={`know/${doc.id}`}
                title={doc.title}
                href={`/knowledge/${doc.categorySlug}/${doc.fileSlug}`}
                size="md"
              />
            </div>
          </div>

          <DocBodyProvider body={body} title={doc.title} />
          <DocViewer ext={doc.ext} sourceUrl={sourceUrl} body={body} title={doc.title} />
        </div>

        <LiveArtifact docId={`know/${doc.id}`} />
        <AnchorLayer docId={`know/${doc.id}`} />

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
          {prev ? (
            <Link
              href={`/knowledge/${categorySlug}/${prev.fileSlug}`}
              style={{ flex: 1, textDecoration: 'none', color: 'var(--fg)' }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 2 }}>Previous</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.45 }}>{prev.title}</div>
            </Link>
          ) : <div style={{ flex: 1 }} />}
          {next ? (
            <Link
              href={`/knowledge/${categorySlug}/${next.fileSlug}`}
              style={{ flex: 1, textDecoration: 'none', color: 'var(--fg)', textAlign: 'right' }}
            >
              <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 2 }}>Next</div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.45 }}>{next.title}</div>
            </Link>
          ) : <div style={{ flex: 1 }} />}
        </div>
      </div>

      <RelatedDocs docId={doc.id} />
    </div>
  );
}

async function RelatedDocs({ docId }: { docId: string }) {
  const related = await relatedDocs(docId, 4);
  if (related.length === 0) return null;
  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 10,
      }}>
        <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
        <span className="t-caption2" style={{
          color: 'var(--muted)', textTransform: 'uppercase',
          letterSpacing: '0.10em', fontWeight: 700,
        }}>Related</span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
      </div>
      {related.map((d) => (
        <Link
          key={d.id}
          href={`/knowledge/${d.categorySlug}/${d.fileSlug}`}
          style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            padding: '0.45rem 0',
            borderBottom: '0.5px solid var(--mat-border)',
            textDecoration: 'none', color: 'var(--fg)',
          }}
        >
          <span style={{
            flex: 1, fontFamily: 'var(--display)', fontSize: '0.88rem',
            fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{d.title}</span>
          <span className="t-caption2" style={{ color: 'var(--muted)', flexShrink: 0 }}>
            {d.category}
          </span>
        </Link>
      ))}
    </div>
  );
}
