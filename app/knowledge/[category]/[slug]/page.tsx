import Link from 'next/link';
import { notFound } from 'next/navigation';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { findDoc, neighborsInCategory } from '../../../../lib/knowledge';
import { knowledgeCategories } from '../../../../lib/knowledge-nav';
import { DocSummary } from '../../../../components/DocSummary';
import { RelatedDocs } from '../../../../components/RelatedDocs';
import { TrackView } from '../../../../components/TrackView';

// Dynamic by design — 454 docs would balloon build time. SSR per-request is fine.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  const doc = findDoc(category, slug);
  return { title: doc ? `${doc.title} · ${doc.category}` : 'Knowledge' };
}

async function loadBody(id: string): Promise<string> {
  try {
    const p = path.join(process.cwd(), 'public', 'knowledge', 'docs', `${id}.json`);
    const raw = await fs.readFile(p, 'utf-8');
    return JSON.parse(raw).body ?? '';
  } catch {
    return '';
  }
}

export default async function DocPage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  const doc = findDoc(category, slug);
  if (!doc) notFound();
  const body = await loadBody(doc.id);
  const cat = knowledgeCategories.find((c) => c.slug === category);
  const { prev, next } = neighborsInCategory(category, slug);

  const isPDF = doc.ext === '.pdf';
  const sourceUrl = `/api/source?p=${encodeURIComponent(doc.sourcePath)}`;

  // split body into paragraphs for nicer rendering
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <div className="prose-notion">
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
        <Link href="/knowledge">📚 Knowledge</Link> ›{' '}
        <Link href={`/knowledge/${category}`}>{cat?.label}</Link> ›
      </div>
      <h1>{doc.title}</h1>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem' }}>
        {doc.ext.slice(1).toUpperCase()} · {(doc.size / 1024).toFixed(0)} KB ·{' '}
        <a href={sourceUrl} target="_blank" rel="noreferrer">open original</a>
      </div>

      <TrackView id={`know/${doc.id}`} title={doc.title} href={`/knowledge/${doc.categorySlug}/${doc.fileSlug}`} />
      <DocSummary id={doc.id} />

      {isPDF && (
        <div style={{ margin: '1rem 0', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <iframe src={sourceUrl} title={doc.title} style={{ width: '100%', height: 720, border: 0 }} />
        </div>
      )}

      {paragraphs.length > 0 ? (
        <div>
          <h2>Extracted text</h2>
          {paragraphs.slice(0, 200).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {paragraphs.length > 200 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
              … {paragraphs.length - 200} more paragraphs truncated. Use the original file for the full text.
            </p>
          )}
        </div>
      ) : !isPDF ? (
        <p style={{ color: 'var(--muted)' }}>No text extracted. Open the original file.</p>
      ) : null}

      <RelatedDocs id={`know/${doc.id}`} />

      {/* prev / next within category */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '3rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
        {prev ? (
          <Link href={`/knowledge/${category}/${prev.fileSlug}`} style={{ flex: 1, padding: '0.8rem 1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>← Previous</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{prev.title}</div>
          </Link>
        ) : <div style={{ flex: 1 }} />}
        {next ? (
          <Link href={`/knowledge/${category}/${next.fileSlug}`} style={{ flex: 1, padding: '0.8rem 1rem', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'right' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Next →</div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{next.title}</div>
          </Link>
        ) : <div style={{ flex: 1 }} />}
      </div>
    </div>
  );
}
