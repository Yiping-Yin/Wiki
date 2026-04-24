'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { isNativeMode } from '../lib/is-native-mode';

type KnowledgeCategory = {
  slug: string;
  label: string;
  count: number;
  kind: 'source' | 'wiki';
};

type KnowledgeDoc = {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  subcategory?: string;
  sourcePath: string;
  fileSlug: string;
  ext: string;
  preview: string;
};

type FolderNode = {
  kind: 'folder';
  name: string;
  fullPath: string;
  children: TreeNode[];
  docs: KnowledgeDoc[];
};

type FileNode = {
  kind: 'file';
  name: string;
  fullPath: string;
  doc: KnowledgeDoc;
};

type TreeNode = FolderNode | FileNode;

type NavPayload = {
  knowledgeCategories: KnowledgeCategory[];
};

const NAV_URL = 'loom://content/knowledge/.cache/manifest/knowledge-nav.json';
const MANIFEST_URL = 'loom://content/knowledge/.cache/manifest/knowledge-manifest.json';

function slugForPathPart(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function numFrom(value: string) {
  const match = value.match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : 9999;
}

function sourceFolderPath(doc: KnowledgeDoc, category: KnowledgeCategory) {
  const dirs = (doc.sourcePath ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, -1);

  if (dirs.length > 0) {
    let parts = [...dirs];
    const firstSlug = slugForPathPart(parts[0] ?? '');
    const secondSlug = slugForPathPart(parts[1] ?? '');
    const categoryTail = category.slug.replace(/^unsw-/, '');

    if (
      firstSlug === 'unsw' &&
      secondSlug &&
      (`unsw-${secondSlug}` === category.slug || secondSlug === categoryTail)
    ) {
      parts = parts.slice(2);
    } else if (
      firstSlug === category.slug ||
      firstSlug === categoryTail ||
      `unsw-${firstSlug}` === category.slug
    ) {
      parts = parts.slice(1);
    }

    const localFolder = parts.join(' / ').trim();
    if (localFolder) return localFolder;
  }

  return (doc.subcategory ?? '').trim();
}

function buildFolderTree(docs: KnowledgeDoc[], category: KnowledgeCategory): FolderNode[] {
  const sections = new Map<string, FolderNode>();

  const ensureFolder = (parts: string[]) => {
    const sectionName = parts[0] || 'Guide';
    const sectionPath = parts[0] || '_root';
    let section = sections.get(sectionPath);
    if (!section) {
      section = {
        kind: 'folder',
        name: sectionName,
        fullPath: sectionPath,
        children: [],
        docs: [],
      };
      sections.set(sectionPath, section);
    }

    let current = section;
    for (let index = 1; index < parts.length; index += 1) {
      const name = parts[index];
      const fullPath = parts.slice(0, index + 1).join(' / ');
      let child = current.children.find(
        (item) => item.kind === 'folder' && item.fullPath === fullPath,
      ) as FolderNode | undefined;
      if (!child) {
        child = { kind: 'folder', name, fullPath, children: [], docs: [] };
        current.children.push(child);
      }
      current = child;
    }
    return current;
  };

  for (const doc of docs) {
    const folderPath = sourceFolderPath(doc, category);
    const parts = folderPath
      ? folderPath.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean)
      : [];
    const folder = ensureFolder(parts);
    folder.children.push({
      kind: 'file',
      name: doc.title,
      fullPath: `${folder.fullPath}::${doc.id}`,
      doc,
    });
  }

  const rollupAndSort = (folder: FolderNode) => {
    folder.docs = [];
    for (const child of folder.children) {
      if (child.kind === 'folder') {
        rollupAndSort(child);
        folder.docs.push(...child.docs);
      } else {
        folder.docs.push(child.doc);
      }
    }
    folder.children.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
      const aText = a.kind === 'folder' ? a.name : a.doc.title;
      const bText = b.kind === 'folder' ? b.name : b.doc.title;
      return numFrom(aText) - numFrom(bText) || aText.localeCompare(bText);
    });
  };

  for (const section of sections.values()) rollupAndSort(section);

  return Array.from(sections.values()).sort((a, b) => {
    if (a.fullPath === '_root' && b.fullPath !== '_root') return -1;
    if (a.fullPath !== '_root' && b.fullPath === '_root') return 1;
    return numFrom(a.name) - numFrom(b.name) || a.name.localeCompare(b.name);
  });
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default function CollectionClient() {
  const params = useSearchParams();
  const slug = params?.get('slug') ?? '';
  const [category, setCategory] = useState<KnowledgeCategory | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Loading collection…');

  useEffect(() => {
    let cancelled = false;

    if (!slug) {
      setLoaded(true);
      return;
    }

    if (!isNativeMode()) {
      window.location.replace(`/knowledge/${encodeURIComponent(slug)}`);
      return;
    }

    setCategory(null);
    setDocs([]);
    setLoaded(false);
    setLoadingMessage('Loading collection…');

    (async () => {
      const [nav, manifest] = await Promise.all([
        fetchJson<NavPayload>(NAV_URL),
        fetchJson<KnowledgeDoc[]>(MANIFEST_URL),
      ]);
      if (cancelled) return;

      if (!nav || !manifest) {
        setCategory(null);
        setDocs([]);
        setLoaded(true);
        setLoadingMessage('Collection data did not arrive. Try Reload sources.');
        return;
      }

      const nextCategory = nav.knowledgeCategories.find((item) => item.slug === slug) ?? null;
      const nextDocs = manifest
        .filter((item) => item.categorySlug === slug)
        .sort((a, b) => a.title.localeCompare(b.title));

      setCategory(nextCategory);
      setDocs(nextDocs);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const title = useMemo(() => category?.label ?? slug, [category, slug]);
  const tree = useMemo(
    () => (category ? buildFolderTree(docs, category) : []),
    [docs, category],
  );
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedFolders({});
  }, [slug]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((previous) => ({
      ...previous,
      [path]: !previous[path],
    }));
  };

  if (!loaded) {
    return (
      <main className="prose-notion" style={{ paddingTop: '4rem' }}>
        <div className="loom-empty-state" role="status" aria-live="polite">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">{loadingMessage}</p>
        </div>
      </main>
    );
  }

  if (!slug || !category) {
    return (
      <main className="prose-notion" style={{ paddingTop: '4rem' }}>
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            This collection is not available in the current source set.
          </p>
          <Link href="/sources" className="loom-empty-state-action">
            Open Sources →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="prose-notion" style={{ paddingTop: '4rem' }}>
      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
        <Link href="/desk">Desk</Link> › <span>Sources</span> › {title}
      </div>
      <h1 style={{ marginBottom: '0.4rem' }}>{title}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: '1.5rem' }}>
        {docs.length} {docs.length === 1 ? 'source' : 'sources'} in this collection.
      </p>

      {docs.length === 0 ? (
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            No readable sources have settled into this collection yet.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tree.map((folder) => (
            <FolderRow
              key={folder.fullPath}
              folder={folder}
              expandedFolders={expandedFolders}
              onToggle={toggleFolder}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function FolderRow({
  folder,
  expandedFolders,
  onToggle,
}: {
  folder: FolderNode;
  expandedFolders: Record<string, boolean>;
  onToggle: (path: string) => void;
}) {
  const open = Boolean(expandedFolders[folder.fullPath]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={() => onToggle(folder.fullPath)}
        aria-expanded={open}
        style={{
          appearance: 'none',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          width: '100%',
          padding: '0.7rem 0',
          border: 0,
          borderBottom: '0.5px solid var(--mat-border)',
          background: 'transparent',
          color: 'var(--fg)',
          cursor: 'pointer',
          textAlign: 'left',
          font: 'inherit',
        }}
      >
        <span
          aria-hidden
          style={{
            color: 'var(--muted)',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }}
        >
          ▸
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--display)',
            fontSize: '1.05rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {folder.name}
        </span>
        <span className="t-caption2" style={{ color: 'var(--muted)', flexShrink: 0 }}>
          {folder.docs.length} {folder.docs.length === 1 ? 'source' : 'sources'}
        </span>
      </button>

      {open && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginLeft: 20,
            borderLeft: '0.5px solid var(--mat-border)',
            paddingLeft: 14,
          }}
        >
          {folder.children.map((child) =>
            child.kind === 'folder' ? (
              <FolderRow
                key={child.fullPath}
                folder={child}
                expandedFolders={expandedFolders}
                onToggle={onToggle}
              />
            ) : (
              <FileRow key={child.doc.id} doc={child.doc} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function FileRow({ doc }: { doc: KnowledgeDoc }) {
  return (
    <Link
      href={`/doc?href=${encodeURIComponent(`/knowledge/${doc.categorySlug}/${doc.fileSlug}`)}`}
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'baseline',
        padding: '0.58rem 0',
        borderBottom: '0.5px solid color-mix(in srgb, var(--mat-border) 55%, transparent)',
        textDecoration: 'none',
        color: 'var(--fg)',
      }}
    >
      <span
        style={{
          flex: 1,
          fontFamily: 'var(--display)',
          fontSize: '0.98rem',
          fontWeight: 500,
        }}
      >
        {doc.title}
      </span>
      <span className="t-caption2" style={{ color: 'var(--muted)', flexShrink: 0 }}>
        {doc.ext.replace(/^\./, '').toUpperCase()}
      </span>
    </Link>
  );
}
