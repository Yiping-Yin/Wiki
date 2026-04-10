import { promises as fs } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { UploadButton } from './UploadButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Uploads · Loom' };

export default async function UploadsPage() {
  const dir = path.join(process.cwd(), 'knowledge', 'uploads');
  let items: { name: string; size: number; mtime: number }[] = [];
  try {
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir);
    items = await Promise.all(
      entries.filter((n) => !n.startsWith('.')).map(async (name) => {
        const stat = await fs.stat(path.join(dir, name));
        return { name, size: stat.size, mtime: stat.mtime.getTime() };
      }),
    );
    items.sort((a, b) => b.mtime - a.mtime);
  } catch {}

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 18,
      }}>
        <span aria-hidden style={{
          width: 18, height: 1,
          background: 'var(--accent)', opacity: 0.55,
        }} />
        <span className="t-caption2" style={{
          color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.10em',
          fontWeight: 700,
        }}>Uploads</span>
        <span aria-hidden style={{
          flex: 1, height: 1, background: 'var(--mat-border)',
        }} />
        <UploadButton />
      </div>

      {items.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((it) => (
            <li key={it.name}>
              <Link
                href={`/uploads/${encodeURIComponent(it.name)}`}
                style={{
                  display: 'flex', alignItems: 'baseline', gap: 14,
                  padding: '0.7rem 0',
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
                }}>{it.name.replace(/\.[^.]+$/, '')}</span>
                <span className="t-caption" style={{
                  color: 'var(--muted)', flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                  fontFamily: 'var(--mono)',
                }}>{(it.size / 1024).toFixed(0)} KB</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
