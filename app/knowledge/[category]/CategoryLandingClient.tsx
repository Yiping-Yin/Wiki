'use client';

import Link from 'next/link';
import * as React from 'react';
import { useMemo, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QuietGuideCard } from '../../../components/QuietGuideCard';
import { StageShell } from '../../../components/StageShell';
import { categoryTheme } from '../../../lib/category-theme';
import { Button } from '../../../components/Button';
import { TextInput } from '../../../components/TextInput';
import { useHistory } from '../../../lib/use-history';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../../../lib/learning-status';
import type { CollectionMetadata, KnowledgeCategory } from '../../../lib/knowledge-types';
import type { FolderOverride } from '../../../lib/knowledge-overrides';
import type { CoworkSummary } from '../../../lib/cowork-types';
import { folderPathToId } from '../../../lib/folder-anchor';
import { continuePanelLifecycle } from '../../../lib/panel-resume';
import { useAllTraces, type Trace } from '../../../lib/trace';

export type CategoryDocCard = {
  id: string;
  title: string;
  href: string;
  categorySlug: string;
  fileSlug: string;
  ext: string;
  preview: string;
  subcategory: string;
  sourcePath: string;
  subOrder: number;
  hasText: boolean;
  size: number;
};

export type CategoryGroupCard = {
  label: string;
  order: number;
  docs: CategoryDocCard[];
};

type CategorySurface = CategoryDocCard & {
  state: 'new' | 'opened' | 'woven' | 'finished';
  touchedAt: number;
  anchorCount: number;
  latestSummary: string;
  latestQuote?: string;
  learning: LearningSurfaceSummary;
};

type FolderNode = {
  kind: 'folder';
  name: string;
  fullPath: string;
  depth: number;
  children: TreeNode[];
  allDocs: CategoryDocCard[];
  allSurfaces: CategorySurface[];
  activeCount: number;
  latestTouchedAt: number;
  focusSurface: CategorySurface | null;
};

type FileNode = {
  kind: 'file';
  name: string;
  fullPath: string;
  depth: number;
  doc: CategoryDocCard;
  surface: CategorySurface;
};

type TreeNode = FolderNode | FileNode;

function docIdFor(doc: CategoryDocCard) {
  return `know/${doc.id}`;
}

function formatWhen(ts: number) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < day * 2) return 'yesterday';
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 30) return `${Math.floor(diff / day / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function stateRank(surface: CategorySurface) {
  switch (surface.state) {
    case 'woven':
      return 0;
    case 'opened':
      return 1;
    case 'finished':
      return 2;
    default:
      return 3;
  }
}

function stateLabel(surface: CategorySurface) {
  if (surface.state === 'woven') return 'Woven';
  if (surface.state === 'opened') return 'Opened';
  if (surface.state === 'finished') return 'Settled';
  return 'Unopened';
}

function extLabel(ext: string) {
  return ext.replace(/^\./, '').toUpperCase();
}

function activeSurfaceCount(surfaces: CategorySurface[]) {
  return surfaces.filter((surface) => surface.state === 'woven' || surface.state === 'opened').length;
}

function defaultSurfaceFromDoc(doc: CategoryDocCard): CategorySurface {
  return {
    ...doc,
    state: 'new',
    touchedAt: 0,
    anchorCount: 0,
    latestSummary: '',
    learning: summarizeLearningSurface([], 0),
  };
}

function slugForPathPart(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

function folderPathFromDoc(doc: CategoryDocCard, category: KnowledgeCategory) {
  const explicit = (doc.subcategory ?? '').trim();
  if (explicit) return explicit;

  const dirs = (doc.sourcePath ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, -1);
  if (dirs.length === 0) return '';

  let folderParts = [...dirs];
  const categorySlug = category.slug;
  const firstSlug = slugForPathPart(folderParts[0] ?? '');
  const secondSlug = slugForPathPart(folderParts[1] ?? '');
  const categoryTail = categorySlug.replace(/^unsw-/, '');

  if (firstSlug === 'unsw' && secondSlug && (`unsw-${secondSlug}` === categorySlug || secondSlug === categoryTail)) {
    folderParts = folderParts.slice(2);
  } else if (firstSlug === categorySlug || firstSlug === categoryTail || `unsw-${firstSlug}` === categorySlug) {
    folderParts = folderParts.slice(1);
  }

  return folderParts.join(' / ');
}

type DndContext = {
  parentFullPath: string;
  childKey: string;
  onReorderSibling: (movedKey: string, targetKey: string) => void;
};

const DND_MIME = 'application/x-loom-reorder';

function useRowDndHandlers(dnd?: DndContext) {
  const [isDragging, setDragging] = useState(false);
  const [isOver, setOver] = useState(false);
  const dragStart = (e: React.DragEvent) => {
    if (!dnd) return;
    e.stopPropagation();
    e.dataTransfer.setData(
      DND_MIME,
      JSON.stringify({ parentFullPath: dnd.parentFullPath, childKey: dnd.childKey }),
    );
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };
  const dragEnd = () => setDragging(false);
  const dragOver = (e: React.DragEvent) => {
    if (!dnd) return;
    if (Array.from(e.dataTransfer.types).includes(DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!isOver) setOver(true);
    }
  };
  const dragLeave = () => setOver(false);
  const drop = (e: React.DragEvent) => {
    if (!dnd) return;
    setOver(false);
    const raw = e.dataTransfer.getData(DND_MIME);
    if (!raw) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      const payload = JSON.parse(raw) as { parentFullPath: string; childKey: string };
      if (payload.parentFullPath !== dnd.parentFullPath) return;
      if (payload.childKey === dnd.childKey) return;
      dnd.onReorderSibling(payload.childKey, dnd.childKey);
    } catch {
      /* ignore malformed payloads */
    }
  };
  return dnd
    ? {
        attrs: {
          draggable: true,
          onDragStart: dragStart,
          onDragEnd: dragEnd,
          onDragOver: dragOver,
          onDragLeave: dragLeave,
          onDrop: drop,
        },
        isDragging,
        isOver,
      }
    : { attrs: {}, isDragging: false, isOver: false };
}

function FolderTreeRow({
  node,
  isExpanded,
  toggle,
  topicFor,
  dnd,
  persistOrder,
  onOpenFolder,
  onRehearse,
  rehearsingPath,
  coworkRefs,
}: {
  node: FolderNode;
  isExpanded: (node: FolderNode) => boolean;
  toggle: (path: string, open: boolean) => void;
  topicFor: (fullPath: string) => string | undefined;
  dnd?: DndContext;
  persistOrder: (fullPath: string, order: string[]) => void;
  onOpenFolder: (folder: FolderNode) => void;
  onRehearse: (folder: FolderNode) => void;
  rehearsingPath: string | null;
  coworkRefs: Record<string, { id: string; title: string }[]>;
}) {
  const open = isExpanded(node);
  const isTop = node.depth === 0;
  const topic = topicFor(node.fullPath);
  const { attrs: rowDndAttrs, isDragging, isOver } = useRowDndHandlers(dnd);
  const handleReorderChild = (movedKey: string, targetKey: string) => {
    const keys = node.children.map((c) =>
      c.kind === 'folder' ? c.fullPath : c.doc.id,
    );
    const fromIdx = keys.indexOf(movedKey);
    const toIdx = keys.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const next = [...keys];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    persistOrder(node.fullPath, next);
  };
  return (
    <div
      id={folderPathToId(node.fullPath)}
      data-folder-path={node.fullPath}
      style={{ display: 'flex', flexDirection: 'column', gap: 4, scrollMarginTop: '5rem' }}
      {...rowDndAttrs}
    >
      <div
        className="loom-category-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: isTop ? '0.6rem 0.4rem 0.5rem' : '0.35rem 0.4rem',
          textAlign: 'left',
          background: isOver
            ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
            : 'transparent',
          border: 0,
          borderBottom: isTop
            ? '0.5px solid color-mix(in srgb, var(--mat-border) 70%, transparent)'
            : 0,
          borderRadius: isTop ? 0 : 'var(--r-1)',
          color: 'var(--fg)',
          font: 'inherit',
          opacity: isDragging ? 0.45 : 1,
          transition: 'background 120ms ease, opacity 120ms ease',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            minWidth: 0,
            flex: 1,
          }}
        >
          <button
            type="button"
            onClick={() => toggle(node.fullPath, !open)}
            aria-expanded={open}
            aria-label={`Toggle ${node.name || 'section'}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 12,
              padding: 0,
              margin: 0,
              border: 0,
              background: 'transparent',
              appearance: 'none',
              fontSize: '0.72rem',
              color: 'var(--muted)',
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 120ms ease',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            ▸
          </button>
          <button
            type="button"
            onClick={() => onOpenFolder(node)}
            className="loom-category-open"
            style={{
              appearance: 'none',
              border: 0,
              background: 'transparent',
              padding: 0,
              margin: 0,
              textAlign: 'left',
              color: 'inherit',
              font: 'inherit',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              flex: 1,
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => {
              const target = e.currentTarget as HTMLButtonElement;
              target.style.color = 'var(--accent)';
              target.style.textDecoration = 'underline';
              target.style.textDecorationColor = 'color-mix(in srgb, var(--accent) 72%, transparent)';
              target.style.textUnderlineOffset = '0.14em';
            }}
            onMouseLeave={(e) => {
              const target = e.currentTarget as HTMLButtonElement;
              target.style.color = 'inherit';
              target.style.textDecoration = 'none';
              target.style.textDecorationColor = 'transparent';
              target.style.textUnderlineOffset = '0.14em';
            }}
          >
            <span
              style={{
                fontFamily: 'var(--display)',
                fontSize: isTop ? '1.02rem' : '0.94rem',
                fontWeight: isTop ? 700 : 600,
                letterSpacing: '-0.01em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node.name}
              {topic ? (
                <span
                  style={{
                    color: 'var(--muted)',
                    fontWeight: 500,
                    marginLeft: 10,
                  }}
                >
                  · {topic}
                  </span>
                ) : null}
              </span>
          </button>
        </div>
        <span
          className="t-caption2"
          style={{ color: 'var(--muted)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 10 }}
        >
          {!isTop && node.allDocs.length > 0 && (() => {
            const busy = rehearsingPath === node.fullPath;
            const disabled = rehearsingPath !== null && !busy;
            return (
              <span
                role="button"
                aria-disabled={disabled}
                tabIndex={0}
                className="loom-category-rehearse"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled && !busy) onRehearse(node);
                }}
                onKeyDown={(e) => {
                  if (disabled || busy) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onRehearse(node);
                  }
                }}
                style={{
                  padding: '0.12rem 0.52rem',
                  borderRadius: 999,
                  border: '0.5px solid color-mix(in srgb, var(--accent) 35%, var(--mat-border))',
                  background: 'transparent',
                  color: 'var(--accent)',
                  cursor: disabled ? 'not-allowed' : busy ? 'default' : 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  opacity: busy ? 1 : 0,
                  transition: 'opacity 140ms ease',
                }}
                title="Create a cowork pre-loaded with this folder's files"
              >
                {busy ? 'Opening…' : 'Rehearse'}
              </span>
            );
          })()}
          <span>
            {node.allDocs.length} item{node.allDocs.length === 1 ? '' : 's'}
            {node.activeCount > 0 ? ` · ${node.activeCount} active` : ''}
          </span>
        </span>
      </div>

      {open && node.children.length > 0 && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginLeft: 18,
            borderLeft:
              '0.5px solid color-mix(in srgb, var(--mat-border) 45%, transparent)',
            paddingLeft: 12,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          {node.children.map((child) => {
            const childKey = child.kind === 'folder' ? child.fullPath : child.doc.id;
            const childDnd: DndContext = {
              parentFullPath: node.fullPath,
              childKey,
              onReorderSibling: handleReorderChild,
            };
            return child.kind === 'file' ? (
              <FileRow
                key={child.doc.id}
                doc={child.doc}
                surface={child.surface}
                dnd={childDnd}
                coworkRefs={coworkRefs[child.doc.id]}
                categorySlug={child.doc.categorySlug}
              />
            ) : (
              <FolderTreeRow
                key={child.fullPath}
                node={child}
                isExpanded={isExpanded}
                toggle={toggle}
                topicFor={topicFor}
                dnd={childDnd}
                persistOrder={persistOrder}
                onOpenFolder={onOpenFolder}
                onRehearse={onRehearse}
                rehearsingPath={rehearsingPath}
                coworkRefs={coworkRefs}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}


const cssEscape = (value: string): string => {
  if (typeof window !== 'undefined' && typeof window.CSS?.escape === 'function') {
    return window.CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, (ch) => `\\${ch}`);
};


function FileRow({
  doc,
  surface,
  dnd,
  coworkRefs,
  categorySlug,
}: {
  doc: CategoryDocCard;
  surface: CategorySurface;
  dnd?: DndContext;
  coworkRefs?: { id: string; title: string }[];
  categorySlug?: string;
}) {
  const router = useRouter();
  const { attrs: rowDndAttrs, isDragging, isOver } = useRowDndHandlers(dnd);
  const rawSummary = surface.latestSummary || doc.preview || '';
  const isPlaceholderPreview =
    rawSummary.startsWith('[Binary file') || rawSummary.startsWith('[Could not read');
  const summary = isPlaceholderPreview ? '' : rawSummary;
  const hasMeta =
    surface.state !== 'new' || surface.touchedAt > 0 || surface.anchorCount > 0;
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(doc.href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          router.push(doc.href);
        }
      }}
      onMouseEnter={() => router.prefetch(doc.href)}
      onFocus={() => router.prefetch(doc.href)}
      {...rowDndAttrs}
      className="loom-category-file"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0.35rem 0.4rem',
        textDecoration: 'none',
        color: 'var(--fg)',
        borderRadius: 'var(--r-1)',
        border: 0,
        background: isOver
          ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
          : 'transparent',
        cursor: dnd ? 'grab' : 'pointer',
        opacity: isDragging ? 0.45 : 1,
        transition: 'background 120ms ease, opacity 120ms ease',
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div
          style={{
            fontFamily: 'var(--display)',
            fontSize: '0.92rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {doc.title}
        </div>
        {summary ? (
          <div
            style={{
              color: 'var(--fg-secondary)',
              fontSize: '0.8rem',
              lineHeight: 1.4,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 1,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {summary}
          </div>
        ) : null}
      </div>
      <div
        className="t-caption2"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
          color: 'var(--muted)',
        }}
      >
        {hasMeta ? (
          <>
            {surface.state !== 'new' ? <span>{stateLabel(surface)}</span> : null}
            {surface.touchedAt > 0 ? <span>{formatWhen(surface.touchedAt)}</span> : null}
            {surface.anchorCount > 0 ? (
              <span>{surface.anchorCount} anchor{surface.anchorCount === 1 ? '' : 's'}</span>
            ) : null}
          </>
        ) : null}
        {coworkRefs && coworkRefs.length > 0 && categorySlug ? (
          <Link
            href={`/knowledge/${categorySlug}/cowork/${coworkRefs[0].id}`}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '0.1rem 0.48rem',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              color: 'var(--accent)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
            title={`Used in: ${coworkRefs.map((c) => c.title).join(', ')}`}
          >
            ✨ {coworkRefs.length} cowork{coworkRefs.length === 1 ? '' : 's'}
          </Link>
        ) : null}
        <span
          style={{
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {extLabel(doc.ext)}
        </span>
      </div>
    </div>
  );
}

export function CategoryLandingClient({
  category,
  docs,
  collection,
  folderOverrides = {},
  coworks = [],
  coworkRefs = {},
}: {
  category: KnowledgeCategory;
  docs: CategoryDocCard[];
  collection?: CollectionMetadata | null;
  folderOverrides?: Record<string, FolderOverride>;
  coworks?: CoworkSummary[];
  coworkRefs?: Record<string, { id: string; title: string }[]>;
}) {
  // Live folder overrides: initialise from server, update optimistically on
  // drag-and-drop so the UI moves immediately. Persistence round-trips to
  // /api/knowledge-overrides in the background.
  const [folderOverridesState, setFolderOverridesState] = useState(folderOverrides);
  const persistOrder = (fullPath: string, order: string[]) => {
    setFolderOverridesState((prev) => ({
      ...prev,
      [fullPath]: { ...(prev[fullPath] ?? {}), order },
    }));
    void fetch('/api/knowledge-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folders: { [category.slug]: { [fullPath]: { order } } },
      }),
    });
  };
  const router = useRouter();
  const pathname = usePathname();
  const [history] = useHistory();
  const { traces } = useAllTraces();

  const viewedByDocId = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of history) {
      if (!entry.id.startsWith(`know/${category.slug}__`)) continue;
      map.set(entry.id, Math.max(map.get(entry.id) ?? 0, entry.viewedAt));
    }
    return map;
  }, [history, category.slug]);

  const tracesByDocId = useMemo(() => {
    const map = new Map<string, Trace[]>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      if (!trace.source.docId.startsWith(`know/${category.slug}__`)) continue;
      const current = map.get(trace.source.docId) ?? [];
      current.push(trace);
      map.set(trace.source.docId, current);
    }
    return map;
  }, [traces, category.slug]);

  const surfaces = useMemo(() => {
    return docs
      .map((doc) => {
        const docId = docIdFor(doc);
        const viewedAt = viewedByDocId.get(docId) ?? 0;
        const traceSet = tracesByDocId.get(docId) ?? [];

        if (traceSet.length === 0) {
          return {
            ...doc,
            state: viewedAt > 0 ? 'opened' : 'new',
            touchedAt: viewedAt,
            anchorCount: 0,
            latestSummary: '',
            learning: summarizeLearningSurface([], viewedAt),
          } satisfies CategorySurface;
        }

        const summary = summarizeLearningSurface(traceSet, viewedAt);
        return {
          ...doc,
          state: summary.finished ? 'finished' : summary.anchorCount > 0 ? 'woven' : 'opened',
          touchedAt: Math.max(summary.touchedAt, viewedAt),
          anchorCount: summary.anchorCount,
          latestSummary: summary.latestSummary,
          latestQuote: summary.latestQuote,
          learning: summary,
        } satisfies CategorySurface;
      })
      .sort((a, b) => stateRank(a) - stateRank(b) || b.touchedAt - a.touchedAt || a.subOrder - b.subOrder);
  }, [docs, tracesByDocId, viewedByDocId]);

  const continueDocs = surfaces.filter((surface) => surface.state === 'woven' || surface.state === 'opened').slice(0, 4);
  const startDoc = docs[0] ?? null;
  const continueDoc = continueDocs[0] ?? null;
  const focusDoc = continueDoc ?? (startDoc ? defaultSurfaceFromDoc(startDoc) : null);
  const activeCount = useMemo(() => activeSurfaceCount(surfaces), [surfaces]);
  const surfaceById = useMemo(
    () => new Map(surfaces.map((surface) => [surface.id, surface] as const)),
    [surfaces],
  );

  // Build an N-level tree that mirrors the source-folder structure. Folders at
  // every level render as disclosure rows; files only appear after the matching
  // local folder is opened.
  const tree = useMemo(() => {
    const numFrom = (s: string) => {
      const m = s.match(/(\d+)/);
      return m ? parseInt(m[1], 10) : 9999;
    };

    const sections = new Map<string, FolderNode>();

    const ensureFolder = (parts: string[]): FolderNode => {
      const sectionKey = parts[0] || '_root';
      let section = sections.get(sectionKey);
      if (!section) {
        section = {
          kind: 'folder',
          name: parts[0] || '',
          fullPath: parts[0] || '_root',
          depth: 0,
          children: [],
          allDocs: [],
          allSurfaces: [],
          activeCount: 0,
          latestTouchedAt: 0,
          focusSurface: null,
        };
        sections.set(sectionKey, section);
      }
      let current = section;
      for (let i = 1; i < parts.length; i++) {
        const name = parts[i];
        const fullPath = parts.slice(0, i + 1).join(' / ');
        let child = current.children.find(
          (c) => c.kind === 'folder' && c.name === name,
        ) as FolderNode | undefined;
        if (!child) {
          child = {
            kind: 'folder',
            name,
            fullPath,
            depth: i,
            children: [],
            allDocs: [],
            allSurfaces: [],
            activeCount: 0,
            latestTouchedAt: 0,
            focusSurface: null,
          };
          current.children.push(child);
        }
        current = child;
      }
      return current;
    };

    for (const doc of docs) {
      const raw = folderPathFromDoc(doc, category).trim();
      const parts = raw
        ? raw.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean)
        : [];
      const folder = ensureFolder(parts);
      const surface = surfaceById.get(doc.id) ?? defaultSurfaceFromDoc(doc);
      folder.children.push({
        kind: 'file',
        name: doc.title,
        fullPath: `${folder.fullPath}::${doc.id}`,
        depth: folder.depth + 1,
        doc,
        surface,
      });
    }

    const rollup = (folder: FolderNode) => {
      folder.allDocs = [];
      folder.allSurfaces = [];
      folder.activeCount = 0;
      folder.latestTouchedAt = 0;
      for (const child of folder.children) {
        if (child.kind === 'folder') {
          rollup(child);
          folder.allDocs.push(...child.allDocs);
          folder.allSurfaces.push(...child.allSurfaces);
          folder.activeCount += child.activeCount;
          if (child.latestTouchedAt > folder.latestTouchedAt) {
            folder.latestTouchedAt = child.latestTouchedAt;
          }
        } else {
          folder.allDocs.push(child.doc);
          folder.allSurfaces.push(child.surface);
          if (child.surface.state === 'woven' || child.surface.state === 'opened') {
            folder.activeCount += 1;
          }
          if (child.surface.touchedAt > folder.latestTouchedAt) {
            folder.latestTouchedAt = child.surface.touchedAt;
          }
        }
      }
      const active = folder.allSurfaces.filter(
        (s) => s.state === 'woven' || s.state === 'opened',
      );
      folder.focusSurface = active[0] ?? folder.allSurfaces[0] ?? null;
    };

    const childKey = (n: TreeNode) => (n.kind === 'folder' ? n.fullPath : n.doc.id);

    const sortChildren = (folder: FolderNode) => {
      const orderOverride = folderOverridesState[folder.fullPath]?.order;
      if (orderOverride && orderOverride.length > 0) {
        const rank = new Map(orderOverride.map((k, i) => [k, i] as const));
        folder.children.sort((a, b) => {
          const ra = rank.get(childKey(a));
          const rb = rank.get(childKey(b));
          if (ra !== undefined && rb !== undefined) return ra - rb;
          if (ra !== undefined) return -1;
          if (rb !== undefined) return 1;
          // Tail — default sort for unordered children.
          if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
          const aText = a.kind === 'folder' ? a.name : a.doc.title;
          const bText = b.kind === 'folder' ? b.name : b.doc.title;
          return numFrom(aText) - numFrom(bText) || aText.localeCompare(bText);
        });
      } else {
        folder.children.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
          const aText = a.kind === 'folder' ? a.name : a.doc.title;
          const bText = b.kind === 'folder' ? b.name : b.doc.title;
          return numFrom(aText) - numFrom(bText) || aText.localeCompare(bText);
        });
      }
      for (const c of folder.children) if (c.kind === 'folder') sortChildren(c);
    };

    for (const section of sections.values()) {
      rollup(section);
      sortChildren(section);
    }

    // Promote the "_root" bucket (files sitting directly under the course
    // folder — syllabus, rubric, textbook) to a named section so it renders
    // as a proper collapsible folder instead of loose cards floating above
    // the tree. Name defaults to "Guide"; can be made user-editable later.
    const rootSection = sections.get('_root');
    if (rootSection && rootSection.children.length > 0) {
      rootSection.name = 'Guide';
      rootSection.fullPath = '_root';
    } else if (rootSection) {
      sections.delete('_root');
    }

    return Array.from(sections.values()).sort((a, b) => {
      // Guide (synthetic root) always pins to the top.
      if (a.fullPath === '_root' && b.fullPath !== '_root') return -1;
      if (a.fullPath !== '_root' && b.fullPath === '_root') return 1;
      return numFrom(a.name) - numFrom(b.name) || a.name.localeCompare(b.name);
    });
  }, [docs, surfaceById, folderOverridesState]);

  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});
  const isExpanded = (node: FolderNode) => {
    if (node.fullPath in expandOverrides) return expandOverrides[node.fullPath];
    // Mirror Finder's starting point: show the local folder skeleton first,
    // but do not spill every file in a 100+ doc course until the learner opens
    // a specific folder. Hash/sidebar navigation still expands ancestors below.
    return false;
  };
  const toggle = (path: string, open: boolean) =>
    setExpandOverrides((prev) => ({ ...prev, [path]: open }));

  // When the URL carries a hash (e.g. from a sidebar click to Week 1), expand
  // the target's ancestors so the node is actually visible, then scroll it
  // into view. Runs on initial mount and on hashchange. Ancestor list is
  // derived from the path segments — "Week / Week 1" opens "Week" + self.
  // Folder navigation — expand ancestors + scroll to target.
  useEffect(() => {
    const expandAndScroll = (targetFullPath: string) => {
      if (!targetFullPath) return;
      const ancestors: string[] = [];
      if (targetFullPath === '_root') {
        ancestors.push('_root');
      } else {
        const parts = targetFullPath.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          ancestors.push(parts.slice(0, i).join(' / '));
        }
      }
      setExpandOverrides((prev) => {
        const next = { ...prev };
        for (const a of ancestors) next[a] = true;
        return next;
      });
      let attempts = 0;
      const tryScroll = () => {
        attempts += 1;
        const el = document.querySelector<HTMLElement>(
          `[data-folder-path="${cssEscape(targetFullPath)}"]`,
        );
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (attempts < 12) setTimeout(tryScroll, 50);
      };
      requestAnimationFrame(() => requestAnimationFrame(tryScroll));
    };

    const onLoomNavigate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ categorySlug: string; folderPath: string }>).detail;
      if (!detail) return;
      if (detail.categorySlug !== category.slug) return;
      expandAndScroll(detail.folderPath);
    };
    window.addEventListener('loom:navigate-folder', onLoomNavigate);

    // Pending folder nav stashed by Sidebar before a cross-page Link — pick
    // it up on mount.
    try {
      const raw = window.sessionStorage.getItem('loom.pendingFolderNav');
      if (raw) {
        const detail = JSON.parse(raw) as { categorySlug: string; folderPath: string };
        window.sessionStorage.removeItem('loom.pendingFolderNav');
        if (detail.categorySlug === category.slug && detail.folderPath) {
          // Give the initial render a couple of frames before we scroll.
          setTimeout(() => expandAndScroll(detail.folderPath), 60);
        }
      }
    } catch {
      /* ignore malformed */
    }

    const scrollToHash = () => {
      const raw = typeof window !== 'undefined' ? window.location.hash : '';
      if (!raw || raw.length <= 1) return;
      // New scheme: hash is a clean slug like "folder-week-week-1". The old
      // percent-encoded form may still turn up on cold nav — fall through to
      // it via getElementById.
      const hashValue = raw.slice(1);
      const decoded = (() => {
        try {
          return decodeURIComponent(hashValue);
        } catch {
          return hashValue;
        }
      })();
      // Figure out which tree path this hash corresponds to. The id we emit
      // is `folderPathToId(fullPath)`, so we can't reverse it directly. But
      // the sidebar also includes the fullPath as hash. Accept both:
      //   - "folder-week-week-1" (new slug form) → match id directly
      //   - "Week / Week 1" / "Week%20%2F%20Week%201" → decode, then use
      //     the data-folder-path attribute for lookup, and treat it as the
      //     fullPath for expanding ancestors.
      let targetFullPath = '';
      if (hashValue.startsWith('folder-')) {
        // Reverse-lookup the fullPath via data-folder-path.
        const el = document.getElementById(hashValue);
        const attr = el?.getAttribute('data-folder-path');
        targetFullPath = attr ?? '';
      } else {
        targetFullPath = decoded;
      }
      if (!targetFullPath) return;
      const ancestors: string[] = [];
      if (targetFullPath === '_root') {
        ancestors.push('_root');
      } else {
        const parts = targetFullPath.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
        for (let i = 1; i <= parts.length; i++) {
          ancestors.push(parts.slice(0, i).join(' / '));
        }
      }
      setExpandOverrides((prev) => {
        const next = { ...prev };
        for (const a of ancestors) next[a] = true;
        return next;
      });
      // Retry the scroll across several frames. React's reconcile + layout
      // timing is unpredictable, and the element may not be in its final
      // position until expansion renders.
      let attempts = 0;
      const maxAttempts = 12; // ~600ms total
      const tryScroll = () => {
        attempts += 1;
        const el =
          (hashValue.startsWith('folder-')
            ? document.getElementById(hashValue)
            : null) ??
          document.querySelector<HTMLElement>(
            `[data-folder-path="${cssEscape(targetFullPath)}"]`,
          );
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (attempts < maxAttempts) {
          setTimeout(tryScroll, 50);
        }
      };
      requestAnimationFrame(() => requestAnimationFrame(tryScroll));
    };
    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => {
      window.removeEventListener('hashchange', scrollToHash);
      window.removeEventListener('loom:navigate-folder', onLoomNavigate);
    };
    // Re-run on pathname change too — Next.js App Router navigation between
    // different category slugs updates URL (including hash) via pushState,
    // which doesn't fire hashchange. Depending on pathname forces a re-read.
  }, [pathname, category.slug]);

  const topicFor = (fullPath: string) =>
    collection?.folders?.[fullPath]?.title ?? undefined;

  const [rehearsingPath, setRehearsingPath] = useState<string | null>(null);

  /** One-click cowork creation seeded with a folder's docs. User picks a
   *  Week / Assessment sub-folder → lands in a ready-to-use cowork with the
   *  folder's files already attached. Zero prep friction. */
  const rehearseFolder = async (folder: FolderNode) => {
    if (rehearsingPath) return;
    setRehearsingPath(folder.fullPath);
    try {
      const title = folder.name || 'Rehearse';
      const description = topicFor(folder.fullPath) ?? '';
      const createRes = await fetch('/api/coworks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categorySlug: category.slug, title, description }),
      });
      if (!createRes.ok) return;
      const cowork = (await createRes.json()) as { id: string };
      // Bulk-attach in a single atomic PATCH so big folders (Week 4 has 30
      // items) don't trigger a storm of sequential writes.
      if (folder.allDocs.length > 0) {
        await fetch(`/api/coworks/${cowork.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            addMaterials: folder.allDocs.map((doc) => ({
              kind: 'library',
              ref: doc.id,
              title: doc.title,
              meta: {
                categorySlug: doc.categorySlug,
                subcategory: doc.subcategory ?? '',
                href: doc.href,
              },
            })),
          }),
        });
      }
      router.push(`/knowledge/${category.slug}/cowork/${cowork.id}`);
    } finally {
      // Keep the loading flag until navigation commits; router.push resolves
      // before the new page mounts so a small delay prevents flicker.
      setTimeout(() => setRehearsingPath(null), 800);
    }
  };

  const [isEditingMeta, setEditingMeta] = useState(false);
  const [editCourseName, setEditCourseName] = useState(collection?.courseName ?? '');
  const [editTerm, setEditTerm] = useState(collection?.term ?? '');
  const [editTeachers, setEditTeachers] = useState(
    (collection?.teachers ?? []).join(', '),
  );
  const openEditMeta = () => {
    setEditCourseName(collection?.courseName ?? '');
    setEditTerm(collection?.term ?? '');
    setEditTeachers((collection?.teachers ?? []).join(', '));
    setEditingMeta(true);
  };
  const saveEditMeta = async () => {
    const teachersList = editTeachers
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    await fetch('/api/knowledge-overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: {
          [category.slug]: {
            courseName: editCourseName.trim() || undefined,
            term: editTerm.trim() || undefined,
            teachers: teachersList.length > 0 ? teachersList : undefined,
          },
        },
      }),
    });
    setEditingMeta(false);
    router.refresh();
  };

  const openPrimaryAction = (surface: CategorySurface) => {
    continuePanelLifecycle(router, {
      href: surface.href,
      nextAction: surface.learning.nextAction,
      latestAnchorId: surface.learning.latestAnchorId,
      refreshSource: 'knowledge',
    });
  };

  const openFolder = (folder: FolderNode) => {
    const focus = folder.focusSurface ?? folder.allSurfaces[0] ?? null;
    if (!focus) {
      toggle(folder.fullPath, !isExpanded(folder));
      return;
    }
    openPrimaryAction(focus);
  };

  const theme = categoryTheme(category.slug);

  return (
    <StageShell
      variant="archive"
      contentVariant="archive"
      innerStyle={{
        minHeight: '100vh',
        paddingTop: '4.75rem',
        paddingBottom: '2.5rem',
        // Category landing is an outline, not a body of prose — let it breathe
        // wider than the archive default (~1240px). On MBP 16" this reclaims
        // ~250px of horizontal space for the structure.
        maxWidth: 'min(1500px, calc(100vw - 120px))',
        // Inherit the category accent so COLLECTION / COWORK / outline all
        // color-match the child doc pages — same identity across the whole
        // category like LLM Wiki's chapter-themed sections.
        ['--accent' as never]: theme.accent,
        ['--accent-soft' as never]: theme.accentSoft,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div
          className="t-caption2"
          style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
        >
          <Link href="/desk" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Desk</Link>
          <span aria-hidden>›</span>
          <span>Sources</span>
          <span aria-hidden>›</span>
          <span>{category.label}</span>
        </div>

        {isEditingMeta ? (
          <div
            style={{
              padding: '1rem 1.2rem',
              borderRadius: 'var(--r-3)',
              background: 'color-mix(in srgb, var(--mat-thick-bg) 85%, transparent)',
              border: '0.5px solid color-mix(in srgb, var(--accent) 50%, var(--mat-border))',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <div className="t-caption2" style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}>
              EDIT COLLECTION
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span className="t-caption" style={{ color: 'var(--muted)' }}>Course name</span>
              <TextInput
                size="md"
                value={editCourseName}
                onChange={(e) => setEditCourseName(e.target.value)}
                placeholder="e.g. Artificial Intelligence for Business Analytics"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span className="t-caption" style={{ color: 'var(--muted)' }}>Term</span>
              <TextInput
                size="md"
                value={editTerm}
                onChange={(e) => setEditTerm(e.target.value)}
                placeholder="e.g. Term 1 2026"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <span className="t-caption" style={{ color: 'var(--muted)' }}>Teachers (comma-separated)</span>
              <TextInput
                size="md"
                value={editTeachers}
                onChange={(e) => setEditTeachers(e.target.value)}
                placeholder="e.g. Jason Xianghua Wu, Jane Doe"
              />
            </label>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <Button tone="primary" size="md" onClick={saveEditMeta}>Save</Button>
              <Button tone="secondary" size="md" onClick={() => setEditingMeta(false)}>Cancel</Button>
              <div style={{ marginLeft: 'auto' }}>
                <Button
                  tone="ghost"
                  size="sm"
                  onClick={async () => {
                    await fetch('/api/knowledge-overrides', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        collections: {
                          [category.slug]: { courseName: undefined, term: undefined, teachers: undefined },
                        },
                      }),
                    });
                    setEditingMeta(false);
                    router.refresh();
                  }}
                >
                  Reset to auto-extracted
                </Button>
              </div>
            </div>
          </div>
        ) : (
        <QuietGuideCard
          eyebrow="Collection"
          title={
            collection?.courseName
              ? `${category.label} · ${collection.courseName}`
              : category.label
          }
          mode="inline"
          tone="quiet"
          density="compact"
          meta={
            <span>
              {docs.length} doc{docs.length === 1 ? '' : 's'}
              {activeCount > 0 ? ` · ${activeCount} active` : ''}
              {continueDoc?.touchedAt ? ` · ${formatWhen(continueDoc.touchedAt)}` : ''}
            </span>
          }
          detail={
            (collection?.term || (collection?.teachers && collection.teachers.length > 0)) ? (
              <div
                className="t-caption2"
                style={{
                  color: 'var(--muted)',
                  marginTop: 6,
                  display: 'flex',
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                {collection?.term ? <span>{collection.term}</span> : null}
                {collection?.term && collection?.teachers && collection.teachers.length > 0 ? (
                  <span aria-hidden>·</span>
                ) : null}
                {collection?.teachers && collection.teachers.length > 0 ? (
                  <span>{collection.teachers.join(', ')}</span>
                ) : null}
              </div>
            ) : null
          }
          actions={(() => {
            const list: { label: string; onClick?: () => void; href?: string; primary?: boolean }[] = [];
            if (focusDoc) {
              list.push({
                label: continueDoc ? 'Continue collection' : 'Open first doc',
                onClick: () => openPrimaryAction(focusDoc),
                primary: true,
              });
            }
            list.push({ label: 'Edit', onClick: openEditMeta });
            return list;
          })()}
        />
        )}

        <CoworkSection categorySlug={category.slug} coworks={coworks} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tree.map((section) => (
            <FolderTreeRow
              key={section.fullPath}
              node={section}
              isExpanded={isExpanded}
              toggle={toggle}
              topicFor={topicFor}
              persistOrder={persistOrder}
              onOpenFolder={openFolder}
              onRehearse={rehearseFolder}
              rehearsingPath={rehearsingPath}
              coworkRefs={coworkRefs}
            />
          ))}
        </div>
      </div>
    </StageShell>
  );
}

function CoworkSection({
  categorySlug,
  coworks,
}: {
  categorySlug: string;
  coworks: CoworkSummary[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const handleCreate = async () => {
    if (!title.trim()) return;
    const res = await fetch('/api/coworks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorySlug, title, description }),
    });
    if (!res.ok) return;
    const cowork = await res.json();
    setCreating(false);
    setTitle('');
    setDescription('');
    router.push(`/knowledge/${categorySlug}/cowork/${cowork.id}`);
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '0.55rem 0.4rem 0.65rem',
        borderBottom: '0.5px solid color-mix(in srgb, var(--mat-border) 70%, transparent)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <span className="t-caption2" style={{
            color: 'var(--accent)',
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontVariant: 'small-caps', textTransform: 'lowercase',
            letterSpacing: '0.05em', fontWeight: 500,
          }}>
            cowork
          </span>
          <span style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>
            Rehearse a project here before you execute it elsewhere.
          </span>
        </div>
        {!creating && (
          <Button tone="secondary" size="sm" onClick={() => setCreating(true)}>
            New cowork
          </Button>
        )}
      </div>

      {creating && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: '0.8rem 0.9rem',
            borderRadius: 'var(--r-2)',
            background: 'var(--mat-thin-bg)',
            border: '0.5px solid var(--mat-border)',
          }}
        >
          <TextInput
            size="md"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What are you rehearsing? (e.g. Assessment 1)"
            autoFocus
          />
          <TextInput
            size="md"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-line context (optional)"
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <Button
              tone="primary"
              size="sm"
              disabled={!title.trim()}
              onClick={handleCreate}
            >
              Create & open
            </Button>
            <Button
              tone="ghost"
              size="sm"
              onClick={() => { setCreating(false); setTitle(''); setDescription(''); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {coworks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {coworks.map((c) => (
            <CoworkRow key={c.id} cowork={c} categorySlug={categorySlug} />
          ))}
        </div>
      )}
    </div>
  );
}

function CoworkRow({
  cowork,
  categorySlug,
}: {
  cowork: CoworkSummary;
  categorySlug: string;
}) {
  const router = useRouter();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [removed, setRemoved] = useState(false);
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pendingDelete) {
      setPendingDelete(true);
      setTimeout(() => setPendingDelete(false), 3500);
      return;
    }
    const res = await fetch(`/api/coworks/${cowork.id}`, { method: 'DELETE' });
    if (res.ok) {
      setRemoved(true);
      router.refresh();
    }
  };
  if (removed) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0.55rem 0.78rem',
        borderRadius: 'var(--r-2)',
        border: '0.5px solid color-mix(in srgb, var(--mat-border) 70%, transparent)',
        background: 'color-mix(in srgb, var(--mat-thick-bg) 65%, transparent)',
      }}
    >
      <Link
        href={`/knowledge/${categorySlug}/cowork/${cowork.id}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          flex: 1,
          textDecoration: 'none',
          color: 'var(--fg)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--display)',
            fontSize: '0.94rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {cowork.title}
        </span>
        {cowork.description && (
          <span
            style={{
              color: 'var(--muted)',
              fontSize: '0.8rem',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {cowork.description}
          </span>
        )}
      </Link>
      <span className="t-caption2" style={{ color: 'var(--muted)', flexShrink: 0 }}>
        {cowork.materialCount} material{cowork.materialCount === 1 ? '' : 's'}
        {cowork.hasTidyDraft ? ' · tidied' : ''}
      </span>
      <button
        type="button"
        onClick={handleDelete}
        aria-label={pendingDelete ? 'Confirm delete' : 'Delete cowork'}
        title={pendingDelete ? 'Click again to confirm' : 'Delete'}
        style={{
          width: 24,
          height: 24,
          padding: 0,
          border: 0,
          background: 'transparent',
          color: pendingDelete ? 'var(--danger, #c33)' : 'var(--muted)',
          fontSize: pendingDelete ? '0.78rem' : '1.05rem',
          fontWeight: pendingDelete ? 700 : 400,
          cursor: 'pointer',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        {pendingDelete ? '✓?' : '×'}
      </button>
    </div>
  );
}
