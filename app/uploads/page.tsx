import { promises as fs } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Uploads · My Wiki' };

const TYPE_META: Record<string, { icon: string; color: string }> = {
  '.pdf':  { icon: '📄', color: '#dc2626' },
  '.docx': { icon: '📝', color: '#2563eb' },
  '.pptx': { icon: '📊', color: '#ea580c' },
  '.csv':  { icon: '📊', color: '#16a34a' },
  '.json': { icon: '📋', color: '#7c3aed' },
  '.ipynb':{ icon: '📓', color: '#f59e0b' },
  '.md':   { icon: '📃', color: '#0ea5e9' },
  '.txt':  { icon: '📃', color: '#6b7280' },
};
const meta = (e: string) => TYPE_META[e] ?? { icon: '📄', color: '#6b7280' };

export default async function UploadsPage() {
  const dir = path.join(process.cwd(), 'knowledge', 'uploads');
  let items: { name: string; size: number; mtime: number; ext: string }[] = [];
  try {
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs.readdir(dir);
    items = await Promise.all(
      entries.filter((n) => !n.startsWith('.')).map(async (name) => {
        const stat = await fs.stat(path.join(dir, name));
        return { name, size: stat.size, mtime: stat.mtime.getTime(), ext: path.extname(name).toLowerCase() };
      }),
    );
    items.sort((a, b) => b.mtime - a.mtime);
  } catch {}

  return (
    <div className="prose-notion">
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
        <Link href="/">Home</Link>
      </div>
      <h1>📥 Uploads</h1>
      <p style={{ color: 'var(--muted)' }}>
        {items.length === 0
          ? 'No uploads yet. Drag any PDF, DOCX, CSV, JSON, IPYNB, or text file anywhere on the page to upload.'
          : `${items.length} uploaded file${items.length === 1 ? '' : 's'}.`}
      </p>

      {items.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.85rem',
          marginTop: '1.5rem',
        }}>
          {items.map((it) => {
            const m = meta(it.ext);
            return (
              <Link
                key={it.name}
                href={`/uploads/${encodeURIComponent(it.name)}`}
                className="card-lift"
                style={{
                  display: 'block',
                  border: 'var(--hairline)', borderRadius: 'var(--r-3)',
                  background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-1)',
                  textDecoration: 'none', color: 'var(--fg)', overflow: 'hidden',
                }}
              >
                <div style={{
                  height: 90,
                  background: `linear-gradient(135deg, ${m.color}22, ${m.color}08)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.2rem',
                }}>{m.icon}</div>
                <div style={{ padding: '0.7rem 0.85rem' }}>
                  <div style={{
                    fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.35,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    minHeight: '2.3em',
                  }}>
                    {it.name.replace(/\.[^.]+$/, '')}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{it.ext.slice(1).toUpperCase()}</span>
                    <span>{(it.size / 1024).toFixed(0)} KB</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div style={{
        marginTop: '2rem', padding: '1rem 1.2rem',
        border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-3)',
        background: 'var(--surface-2)', textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem',
      }}>
        💡 Drag any file anywhere on the page to upload — no terminal needed.
      </div>
    </div>
  );
}
