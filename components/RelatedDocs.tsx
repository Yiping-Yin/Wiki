import { promises as fs } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';

type Related = { id: string; title: string; href: string; score: number };

let _cache: Record<string, Related[]> | null = null;
async function loadRelated(): Promise<Record<string, Related[]>> {
  if (_cache) return _cache;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'public', 'related.json'), 'utf-8');
    _cache = JSON.parse(raw);
    return _cache!;
  } catch {
    return {};
  }
}

export async function RelatedDocs({ id }: { id: string }) {
  const all = await loadRelated();
  const related = all[id] ?? [];
  if (related.length === 0) return null;

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.6rem' }}>🔗 Semantically related</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.6rem' }}>
        {related.map((r) => (
          <Link
            key={r.id}
            href={r.href}
            style={{
              border: '1px solid var(--border)', borderRadius: 8,
              padding: '0.6rem 0.8rem', textDecoration: 'none', color: 'var(--fg)',
              display: 'block',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.3 }}>
              {r.title}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 3 }}>
              similarity {(r.score * 100).toFixed(0)}%
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
