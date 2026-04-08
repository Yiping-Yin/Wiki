import { promises as fs } from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { allDocs } from '../lib/knowledge';
import { chapters } from '../lib/nav';

type Related = { id: string; title: string; href: string; score: number };

let _cacheRel: Record<string, Related[]> | null = null;
async function loadRelated(): Promise<Record<string, Related[]>> {
  if (_cacheRel) return _cacheRel;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'public', 'related.json'), 'utf-8');
    _cacheRel = JSON.parse(raw);
    return _cacheRel!;
  } catch { return {}; }
}

// Build a quick lookup from id → preview snippet (knowledge body or wiki MDX)
const previewCache = new Map<string, string>();
async function getPreview(id: string): Promise<string> {
  if (previewCache.has(id)) return previewCache.get(id)!;
  let preview = '';
  try {
    if (id.startsWith('wiki/')) {
      // For wiki chapters: read first paragraph after H1
      const slug = id.slice('wiki/'.length);
      const ch = chapters.find((c) => c.slug === slug);
      if (ch) preview = `${ch.section} chapter`;
    } else if (id.startsWith('know/')) {
      const docId = id.slice('know/'.length);
      const meta = allDocs.find((d) => d.id === docId);
      if (meta) preview = meta.preview ?? meta.category;
    }
  } catch {}
  previewCache.set(id, preview);
  return preview;
}

function iconFor(id: string): { icon: string; color: string } {
  if (id.startsWith('wiki/')) return { icon: '📖', color: '#0071e3' };
  // For knowledge, infer from extension if available
  const docId = id.slice('know/'.length);
  const meta = allDocs.find((d) => d.id === docId);
  if (meta) {
    const e = meta.ext.toLowerCase();
    if (e === '.pdf') return { icon: '📄', color: '#dc2626' };
    if (e === '.docx' || e === '.doc') return { icon: '📝', color: '#2563eb' };
    if (e === '.pptx' || e === '.ppt') return { icon: '📊', color: '#ea580c' };
    if (e === '.csv' || e === '.tsv') return { icon: '📊', color: '#16a34a' };
    if (e === '.json') return { icon: '📋', color: '#7c3aed' };
    if (e === '.ipynb') return { icon: '📓', color: '#f59e0b' };
    if (e === '.md' || e === '.txt') return { icon: '📃', color: '#0ea5e9' };
  }
  return { icon: '📄', color: '#6b7280' };
}

export async function RelatedDocs({ id }: { id: string }) {
  const all = await loadRelated();
  const related = (all[id] ?? []).slice(0, 4);
  if (related.length === 0) return null;

  // Hydrate previews
  const enriched = await Promise.all(
    related.map(async (r) => ({
      ...r,
      preview: await getPreview(r.id),
      art: iconFor(r.id),
    })),
  );

  return (
    <div style={{ marginTop: '2.8rem' }}>
      <h2 style={{
        fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.9rem',
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'var(--display)', letterSpacing: '-0.012em',
        borderBottom: 'none', padding: 0,
      }}>
        🔗 Related Topics
      </h2>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.85rem',
      }}>
        {enriched.map((r) => (
          <Link
            key={r.id}
            href={r.href}
            className="card-lift related-card"
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              border: 'var(--hairline)', borderRadius: 'var(--r-3)',
              padding: '0.95rem 1.05rem',
              background: 'var(--bg-elevated)',
              boxShadow: 'var(--shadow-1)',
              textDecoration: 'none', color: 'var(--fg)',
              position: 'relative',
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 'var(--r-2)',
              background: `linear-gradient(135deg, ${r.art.color}22, ${r.art.color}10)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.25rem', flexShrink: 0,
            }}>
              {r.art.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600, fontSize: '0.92rem', lineHeight: 1.3,
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {r.title}
              </div>
              {r.preview && (
                <div style={{
                  fontSize: '0.74rem', color: 'var(--muted)', marginTop: 4, lineHeight: 1.4,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {r.preview.slice(0, 120)}
                </div>
              )}
              <div style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                similarity {(r.score * 100).toFixed(0)}%
              </div>
            </div>
            <span style={{ alignSelf: 'center', color: 'var(--muted)', fontSize: '1.1rem' }}>→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
