import { promises as fs } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocViewer } from '../../../components/DocViewer';
import { TrackView } from '../../../components/TrackView';
import { DocBodyProvider } from '../../../components/DocBodyProvider';
import { LiveArtifact } from '../../../components/LiveArtifact';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} · Intake` };
}

export default async function UploadDocPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const decoded = decodeURIComponent(name);
  // path traversal guard
  if (decoded.includes('/') || decoded.includes('..')) notFound();

  const dir = path.join(process.cwd(), 'knowledge', 'uploads');
  const fullPath = path.join(dir, decoded);

  let stat;
  try { stat = await fs.stat(fullPath); }
  catch { notFound(); }

  const ext = path.extname(decoded).toLowerCase();
  const sourceUrl = `/api/source-upload?name=${encodeURIComponent(decoded)}`;
  const titleClean = decoded.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');

  // Read text body for text files
  let body = '';
  if (ext === '.txt' || ext === '.md' || ext === '.json' || ext === '.csv') {
    try { body = (await fs.readFile(fullPath, 'utf-8')).slice(0, 50000); } catch {}
  }

  return (
    <div className="prose-notion">
      <TrackView id={`upload/${decoded}`} title={titleClean} href={`/uploads/${encodeURIComponent(decoded)}`} />

      <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>
        <Link href="/">Home</Link> ›{' '}
        <Link href="/uploads">Intake</Link>
      </div>
      <h1>{titleClean}</h1>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
        <span>{ext.slice(1).toUpperCase()}</span>
        <span>·</span>
        <span>{(stat!.size / 1024).toFixed(0)} KB</span>
        <span>·</span>
        <span>uploaded {new Date(stat!.mtime).toLocaleDateString()}</span>
      </div>

      <DocBodyProvider body={body} title={titleClean} />
      <DocViewer ext={ext} sourceUrl={sourceUrl} body={body} title={titleClean} />

      <LiveArtifact docId={`upload/${decoded}`} />
    </div>
  );
}
