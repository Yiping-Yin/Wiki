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
          <span>·</span>
          <Link href={`/atlas?focus=${encodeURIComponent('know/' + doc.id)}`}>🗺 view on atlas</Link>
        </div>

        {/* Native viewer first — PDF iframe / CSV table / JSON tree / IPYNB cells / TXT prose */}
        <DocViewer ext={doc.ext} sourceUrl={sourceUrl} body={body} title={doc.title} />

        {/* AI augmentations below the original */}
        <DocSummary id={doc.id} />
        <StructuredView id={doc.id} />

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
