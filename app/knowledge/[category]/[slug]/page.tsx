import Link from 'next/link';
import { notFound } from 'next/navigation';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { findDoc, neighborsInCategory } from '../../../../lib/knowledge';
import { knowledgeCategories } from '../../../../lib/knowledge-nav';
import { DocSummary } from '../../../../components/DocSummary';
import { RelatedDocs } from '../../../../components/RelatedDocs';
import { TrackView } from '../../../../components/TrackView';
import { DocNotes } from '../../../../components/DocNotes';
import { DocQuiz } from '../../../../components/DocQuiz';
import { BackLinks } from '../../../../components/BackLinks';
import { StructuredView } from '../../../../components/StructuredView';
import { DocViewer } from '../../../../components/DocViewer';
import { TableOfContents } from '../../../../components/TableOfContents';

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
  } catch { return ''; }
}

export default async function DocPage({ params }: { params: Promise<{ category: string; slug: string }> }) {
  const { category, slug } = await params;
  const doc = findDoc(category, slug);
  if (!doc) notFound();
  const body = await loadBody(doc.id);
  const cat = knowledgeCategories.find((c) => c.slug === category);
  const { prev, next } = neighborsInCategory(category, slug);

  const sourceUrl = `/api/source?p=${encodeURIComponent(doc.sourcePath)}`;
  const ext = doc.ext.toLowerCase();
  const isPdf = ext === '.pdf';
  const isData = ext === '.csv' || ext === '.tsv' || ext === '.json' || ext === '.ipynb';
  const isText = ext === '.md' || ext === '.txt' || ext === '.docx' || ext === '.doc' || ext === '.pptx' || ext === '.ppt';

  return (
    <div className="with-toc">
      <div style={{ flex: 1, minWidth: 0 }} className="prose-notion">
        <TrackView id={`know/${doc.id}`} title={doc.title} href={`/knowledge/${doc.categorySlug}/${doc.fileSlug}`} />

        <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
          <Link href="/knowledge">📚 Knowledge</Link> ›{' '}
          <Link href={`/knowledge/${category}`}>{cat?.label}</Link>
        </div>
        <h1>{doc.title}</h1>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
          <span>{doc.ext.slice(1).toUpperCase()}</span>
          <span>·</span>
          <span>{(doc.size / 1024).toFixed(0)} KB</span>
          <span>·</span>
          <a href={sourceUrl} target="_blank" rel="noreferrer">open original</a>
        </div>

        {/* PDF: original first, AI supplemental */}
        {isPdf && (
          <>
            <DocViewer ext={doc.ext} sourceUrl={sourceUrl} body={body} title={doc.title} />
            <DocSummary id={doc.id} />
            <StructuredView id={doc.id} />
          </>
        )}

        {/* Text-like (txt/md/docx/pptx): structured view is PRIMARY (auto-generates), raw collapsed */}
        {isText && (
          <>
            <DocSummary id={doc.id} />
            <StructuredView id={doc.id} autoGenerate />
            {body && body.length > 50 && (
              <details style={{ marginTop: '1.6rem' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: '0.78rem', padding: '0.4rem 0' }}>
                  Show raw extracted text
                </summary>
                <div style={{ marginTop: '0.6rem', opacity: 0.85 }}>
                  <DocViewer ext={doc.ext} sourceUrl={sourceUrl} body={body} title={doc.title} />
                </div>
              </details>
            )}
          </>
        )}

        {/* Data files: native viewer primary */}
        {isData && (
          <>
            <DocViewer ext={doc.ext} sourceUrl={sourceUrl} body={body} title={doc.title} />
            <DocSummary id={doc.id} />
          </>
        )}

        {/* Unknown fallback */}
        {!isPdf && !isText && !isData && (
          <DocViewer ext={doc.ext} sourceUrl={sourceUrl} body={body} title={doc.title} />
        )}

        <DocQuiz id={doc.id} />
        <DocNotes id={`know/${doc.id}`} />
        <BackLinks id={`know/${doc.id}`} title={doc.title} />
        <RelatedDocs id={`know/${doc.id}`} />

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
      <TableOfContents />
    </div>
  );
}
