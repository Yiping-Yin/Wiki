'use client';
/**
 * Apple Files-style doc browser for /knowledge/<category>.
 * Grid (default) and list view; filter by file type and read state; sort by
 * name / size; live count; respects useHistory checkmarks.
 */
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useHistory } from '../lib/use-history';

export type DocItem = {
  id: string;
  title: string;
  href: string;
  ext: string;
  size: number;
  preview: string;
  hasText: boolean;
};

type View = 'grid' | 'list';
type Sort = 'name' | 'size' | 'type';

const TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  '.pdf':  { icon: '📄', color: '#dc2626', label: 'PDF' },
  '.docx': { icon: '📝', color: '#2563eb', label: 'Word' },
  '.doc':  { icon: '📝', color: '#2563eb', label: 'Word' },
  '.pptx': { icon: '📊', color: '#ea580c', label: 'Slides' },
  '.ppt':  { icon: '📊', color: '#ea580c', label: 'Slides' },
  '.xlsx': { icon: '📈', color: '#16a34a', label: 'Excel' },
  '.xls':  { icon: '📈', color: '#16a34a', label: 'Excel' },
  '.csv':  { icon: '📊', color: '#16a34a', label: 'CSV' },
  '.json': { icon: '📋', color: '#7c3aed', label: 'JSON' },
  '.ipynb':{ icon: '📓', color: '#f59e0b', label: 'Notebook' },
  '.md':   { icon: '📃', color: '#0ea5e9', label: 'Markdown' },
  '.txt':  { icon: '📃', color: '#6b7280', label: 'Text' },
};
const META_DEFAULT = { icon: '📄', color: '#6b7280', label: 'File' };
const metaOf = (ext: string) => TYPE_META[ext.toLowerCase()] ?? META_DEFAULT;

export function DocListView({ docs, categorySlug }: { docs: DocItem[]; categorySlug: string }) {
  const [history] = useHistory();
  const [view, setView] = useState<View>('grid');
  const [sort, setSort] = useState<Sort>('name');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');

  const viewedSet = useMemo(() => {
    const s = new Set<string>();
    for (const h of history) {
      const m = h.id.match(/^know\/([^_]+(?:_[^_]+)*)__(.+)$/);
      if (m && m[1] === categorySlug) s.add(m[2]);
    }
    return s;
  }, [history, categorySlug]);

  const types = useMemo(() => {
    const counts: Record<string, number> = {};
    docs.forEach((d) => { counts[d.ext] = (counts[d.ext] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [docs]);

  const filtered = useMemo(() => {
    let out = docs;
    if (typeFilter) out = out.filter((d) => d.ext === typeFilter);
    if (readFilter === 'read') out = out.filter((d) => viewedSet.has(slugify(d.href)));
    if (readFilter === 'unread') out = out.filter((d) => !viewedSet.has(slugify(d.href)));
    out = [...out];
    if (sort === 'name') out.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'size') out.sort((a, b) => b.size - a.size);
    if (sort === 'type') out.sort((a, b) => a.ext.localeCompare(b.ext) || a.title.localeCompare(b.title));
    return out;
  }, [docs, typeFilter, readFilter, sort, viewedSet]);

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
        padding: '0.6rem 0', borderBottom: 'var(--hairline)', marginBottom: '1rem',
      }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>
          {filtered.length} / {docs.length}
        </span>

        <div style={{ flex: 1 }} />

        {/* Read filter */}
        <SegmentedControl
          value={readFilter}
          onChange={setReadFilter as any}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread' },
            { value: 'read', label: 'Read' },
          ]}
        />

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          style={selectStyle}
        >
          <option value="name">Name</option>
          <option value="size">Size</option>
          <option value="type">Type</option>
        </select>

        {/* View toggle */}
        <SegmentedControl
          value={view}
          onChange={setView as any}
          options={[
            { value: 'grid', label: '⊞' },
            { value: 'list', label: '☰' },
          ]}
        />
      </div>

      {/* Type filter chips */}
      {types.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
          <Chip active={typeFilter === null} onClick={() => setTypeFilter(null)}>
            All types
          </Chip>
          {types.map(([ext, n]) => {
            const m = metaOf(ext);
            return (
              <Chip key={ext} active={typeFilter === ext} onClick={() => setTypeFilter(typeFilter === ext ? null : ext)}>
                {m.icon} {m.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{n}</span>
              </Chip>
            );
          })}
        </div>
      )}

      {/* Grid */}
      {view === 'grid' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
          gap: '0.85rem',
        }}>
          {filtered.map((d) => {
            const m = metaOf(d.ext);
            const viewed = viewedSet.has(slugify(d.href));
            return (
              <Link
                key={d.id}
                href={d.href}
                className="card-lift"
                style={{
                  display: 'block',
                  border: 'var(--hairline)', borderRadius: 'var(--r-3)',
                  background: 'var(--bg-elevated)',
                  boxShadow: 'var(--shadow-1)',
                  textDecoration: 'none', color: 'var(--fg)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                {/* Top color band */}
                <div style={{
                  height: 80,
                  background: `linear-gradient(135deg, ${m.color}22, ${m.color}08)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.2rem',
                  position: 'relative',
                }}>
                  {m.icon}
                  {viewed && (
                    <span style={{
                      position: 'absolute', top: 6, right: 8,
                      background: '#10b981', color: '#fff',
                      width: 18, height: 18, borderRadius: '50%',
                      fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700,
                    }}>✓</span>
                  )}
                </div>

                <div style={{ padding: '0.7rem 0.85rem' }}>
                  <div style={{
                    fontWeight: 600, fontSize: '0.83rem', lineHeight: 1.35,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    minHeight: '2.2em',
                  }}>
                    {d.title}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                    <span>{m.label}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatSize(d.size)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {filtered.map((d) => {
            const m = metaOf(d.ext);
            const viewed = viewedSet.has(slugify(d.href));
            return (
              <li key={d.id} style={{ borderBottom: 'var(--hairline)', padding: '0.7rem 0' }}>
                <Link href={d.href} style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  textDecoration: 'none', color: 'var(--fg)',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--r-2)',
                    background: `linear-gradient(135deg, ${m.color}22, ${m.color}10)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.4rem', flexShrink: 0,
                  }}>{m.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      {viewed && <span style={{ color: '#10b981', fontSize: '0.75rem' }}>✓</span>}
                      <span style={{ fontWeight: 600, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.title}
                      </span>
                    </div>
                    {d.preview && (
                      <div style={{
                        fontSize: '0.76rem', color: 'var(--muted)', marginTop: 2,
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                      }}>
                        {d.preview.slice(0, 160)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                    <div>{m.label}</div>
                    <div style={{ fontVariantNumeric: 'tabular-nums' }}>{formatSize(d.size)}</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length === 0 && (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
          No documents match these filters.
        </div>
      )}
    </div>
  );
}

function SegmentedControl<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div style={{
      display: 'inline-flex', background: 'var(--surface-2)',
      borderRadius: 'var(--r-1)', padding: 2, gap: 0,
      border: 'var(--hairline)',
    }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            background: value === o.value ? 'var(--bg)' : 'transparent',
            color: value === o.value ? 'var(--fg)' : 'var(--muted)',
            border: 0, padding: '4px 12px', borderRadius: 6,
            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
            transition: 'all 0.2s var(--ease)',
            boxShadow: value === o.value ? 'var(--shadow-1)' : 'none',
          }}
        >{o.label}</button>
      ))}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--accent)' : 'var(--surface-2)',
        color: active ? '#fff' : 'var(--fg)',
        border: 'var(--hairline)',
        borderRadius: 999,
        padding: '4px 12px',
        fontSize: '0.74rem', fontWeight: 500,
        cursor: 'pointer',
        transition: 'all 0.2s var(--ease)',
      }}
    >{children}</button>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: 'var(--hairline)',
  borderRadius: 'var(--r-1)',
  padding: '4px 10px',
  fontSize: '0.75rem',
  color: 'var(--fg)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function slugify(href: string): string {
  // /knowledge/<cat>/<slug>  → <slug>
  return href.split('/').pop() ?? '';
}
