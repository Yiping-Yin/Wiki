'use client';
/**
 * ScanScopePicker · folder-tree modal for selecting what Loom should scan.
 *
 * Lazy-lists directories under content-root and lets the user check the
 * subtrees to include. Saves to /api/content-root/scope, then (optionally)
 * runs /api/ingest so the knowledge library refreshes against the new scope.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from './Button';
import { isNativeMode } from '../lib/is-native-mode';

type TreeChild = {
  name: string;
  relPath: string;
  fileCount: number;
  subdirCount: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function ScanScopePicker({ open, onClose, onSaved }: Props) {
  const [tree, setTree] = useState<Record<string, TreeChild[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contentRoot, setContentRoot] = useState<string>('');
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChildren = useCallback(async (relPath: string) => {
    if (tree[relPath]) return;
    setLoading((prev) => new Set(prev).add(relPath));
    try {
      const res = await fetch(`/api/content-root/tree?path=${encodeURIComponent(relPath)}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as { children: TreeChild[]; absPath: string };
      setTree((prev) => ({ ...prev, [relPath]: data.children }));
      if (relPath === '' && data.absPath) setContentRoot(data.absPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to list');
    } finally {
      setLoading((prev) => {
        const n = new Set(prev); n.delete(relPath); return n;
      });
    }
  }, [tree]);

  useEffect(() => {
    // Belt-and-suspenders: skip the fetch storm when mounted under
    // the shipped static bundle. `/onboarding` is unreachable in
    // practice, but if someone ever links there we'd otherwise fire
    // four `/api/content-root/*` + `/api/ingest` calls that all 404.
    if (!open || isNativeMode()) return;
    void loadChildren('');
    void fetch('/api/content-root/scope')
      .then((r) => r.json())
      .then((d: { included?: string[] }) => {
        if (Array.isArray(d.included)) setSelected(new Set(d.included));
      })
      .catch(() => {});
  }, [open, loadChildren]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggleExpand = (relPath: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(relPath)) n.delete(relPath);
      else { n.add(relPath); void loadChildren(relPath); }
      return n;
    });
  };

  const toggleSelect = (relPath: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      // Selecting a parent replaces any selected descendants (subtree implied).
      if (n.has(relPath)) {
        n.delete(relPath);
      } else {
        for (const existing of Array.from(n)) {
          if (existing.startsWith(relPath + '/') || relPath.startsWith(existing + '/')) {
            n.delete(existing);
          }
        }
        n.add(relPath);
      }
      return n;
    });
  };

  const save = async () => {
    // Same gate as loadChildren — skip the native-mode 404 path.
    if (isNativeMode()) {
      setError('Folder scope must be picked via Settings → Data in the native app.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const scopeRes = await fetch('/api/content-root/scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ included: Array.from(selected) }),
      });
      if (!scopeRes.ok) throw new Error(`save scope ${scopeRes.status}`);
      const ingRes = await fetch('/api/ingest', { method: 'POST' });
      if (!ingRes.ok) throw new Error(`ingest ${ingRes.status}`);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 150,
        background: 'color-mix(in srgb, var(--bg) 64%, transparent)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        style={{
          width: 'min(620px, 100%)',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 'var(--r-3)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 'var(--space-5) var(--space-6) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
          <div className="t-caption2" style={{ color: 'var(--accent)', letterSpacing: '0.08em', fontWeight: 700, fontSize: 'var(--fs-caption)' }}>
            SCAN SCOPE
          </div>
          <h2 style={{ margin: 0, fontSize: 'var(--fs-h2)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 'var(--lh-tight)' }}>
            Pick the folders Loom should index.
          </h2>
          {contentRoot && (
            <code style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-caption)', color: 'var(--muted)', marginTop: 4 }}>
              {contentRoot}
            </code>
          )}
          <div style={{ fontSize: 'var(--fs-small)', color: 'var(--fg-secondary)', marginTop: 'var(--space-2)', lineHeight: 'var(--lh-body)' }}>
            Checked subtrees are included; everything else is ignored. Unchecking all is equivalent to scanning everything.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-6)' }}>
          <TreeNode
            relPath=""
            label="(root)"
            tree={tree}
            expanded={expanded}
            selected={selected}
            loading={loading}
            onToggleExpand={toggleExpand}
            onToggleSelect={toggleSelect}
            depth={-1}
          />
        </div>

        {error && (
          <div style={{ padding: '0 var(--space-6) var(--space-3)', color: 'var(--tint-red)', fontSize: 'var(--fs-small)' }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '0.5px solid var(--mat-border)',
        }}>
          <div style={{ flex: 1, alignSelf: 'center', fontSize: 'var(--fs-caption)', color: 'var(--muted)' }}>
            {selected.size === 0 ? 'Scanning everything' : `${selected.size} folder${selected.size === 1 ? '' : 's'} selected`}
          </div>
          <Button tone="ghost" size="md" onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            size="md"
            busy={saving}
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving & scanning…' : 'Save & rescan'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TreeNode({
  relPath,
  label,
  tree,
  expanded,
  selected,
  loading,
  onToggleExpand,
  onToggleSelect,
  depth,
}: {
  relPath: string;
  label: string;
  tree: Record<string, TreeChild[]>;
  expanded: Set<string>;
  selected: Set<string>;
  loading: Set<string>;
  onToggleExpand: (p: string) => void;
  onToggleSelect: (p: string) => void;
  depth: number;
}) {
  const isOpen = expanded.has(relPath);
  const children = tree[relPath];
  const isSelected = selected.has(relPath);
  const isImplicit = Array.from(selected).some((s) => relPath !== '' && relPath.startsWith(s + '/'));

  return (
    <div>
      {relPath !== '' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '4px 0',
            paddingLeft: `${depth * 18}px`,
          }}
        >
          <button
            type="button"
            onClick={() => onToggleExpand(relPath)}
            aria-expanded={isOpen}
            aria-label={isOpen ? 'Collapse' : 'Expand'}
            style={{
              width: 18,
              padding: 0,
              border: 0,
              background: 'transparent',
              color: 'var(--muted)',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: 'var(--fs-caption)',
            }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
          <input
            type="checkbox"
            checked={isSelected || isImplicit}
            disabled={isImplicit}
            onChange={() => onToggleSelect(relPath)}
            style={{ flexShrink: 0, cursor: isImplicit ? 'not-allowed' : 'pointer' }}
          />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 'var(--fs-body)',
              color: isImplicit ? 'var(--muted)' : 'var(--fg)',
              fontWeight: isSelected ? 600 : 400,
            }}
          >
            {label}
          </span>
          <FolderMeta relPath={relPath} tree={tree} />
        </div>
      )}

      {isOpen && (
        <div>
          {loading.has(relPath) ? (
            <div style={{ paddingLeft: `${(depth + 1) * 18 + 20}px`, color: 'var(--muted)', fontSize: 'var(--fs-caption)', padding: '4px 0' }}>
              Loading…
            </div>
          ) : children ? (
            children.length === 0 ? (
              <div style={{ paddingLeft: `${(depth + 1) * 18 + 20}px`, color: 'var(--muted)', fontSize: 'var(--fs-caption)', padding: '4px 0' }}>
                (no subfolders)
              </div>
            ) : (
              children.map((c) => (
                <TreeNode
                  key={c.relPath}
                  relPath={c.relPath}
                  label={c.name}
                  tree={tree}
                  expanded={expanded}
                  selected={selected}
                  loading={loading}
                  onToggleExpand={onToggleExpand}
                  onToggleSelect={onToggleSelect}
                  depth={depth + 1}
                />
              ))
            )
          ) : null}
        </div>
      )}
    </div>
  );
}

function FolderMeta({ relPath, tree }: { relPath: string; tree: Record<string, TreeChild[]> }) {
  // Find this node's own fileCount from its parent's listing.
  const parent = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
  const parentList = tree[parent];
  if (!parentList) return null;
  const me = parentList.find((c) => c.relPath === relPath);
  if (!me) return null;
  return (
    <span
      className="t-caption2"
      style={{ color: 'var(--muted)', fontSize: 'var(--fs-caption)', flexShrink: 0 }}
    >
      {me.fileCount} file{me.fileCount === 1 ? '' : 's'}
      {me.subdirCount > 0 ? ` · ${me.subdirCount} sub` : ''}
    </span>
  );
}
