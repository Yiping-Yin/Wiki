'use client';

import { useMemo } from 'react';
import { useTracesForDoc } from '../lib/trace';
import type { Trace } from '../lib/trace';

/**
 * A single version of a thought inside a ThoughtAnchorView container.
 * Each time the user asks about the same passage and commits ✓ via ChatFocus,
 * a new version is appended. Versions are stored oldest-first.
 */
export type ThoughtAnchorVersion = {
  /** Timestamp this version was committed */
  at: number;
  /** 1-2 line summary of this iteration's thinking */
  summary: string;
  /** Full note content (markdown) for this iteration */
  content: string;
};

/**
 * A thought-anchor container: a position in the source document holding a
 * chain of versions. The top-level fields mirror the LATEST version for
 * backward compatibility with consumers that don't yet use `versions`.
 *
 * Container identity is position-based: two commits with the same anchorId
 * or the same text fingerprint (anchorBlockText + charStart + charEnd) are
 * merged into the same container. DOM reindexing across refreshes may change
 * the anchorId; the text fingerprint keeps containers stable across reloads.
 */
export type ThoughtAnchorView = {
  traceId: string;
  /** Unique key for this container, guaranteed distinct across all containers
   *  in the same trace. Use this as a React key — NEVER use `anchorId`, which
   *  can collide when two different positions share a fallback id like
   *  `loom-block-0` or inherit legacy ids from pre-container-model data. */
  containerKey: string;
  anchorId: string;
  anchorType: 'heading' | 'page' | 'timestamp' | 'slide' | 'paragraph';
  anchorBlockId?: string;
  anchorBlockText?: string;
  anchorOffsetPx?: number;
  anchorCharStart?: number;
  anchorCharEnd?: number;
  rangeStartId?: string;
  rangeStartText?: string;
  rangeEndId?: string;
  rangeEndText?: string;
  sectionId?: string;
  sectionNumber?: number;
  section: string;
  /** Summary of the LATEST version (alias: versions[versions.length - 1].summary) */
  summary: string;
  /** Content of the LATEST version (alias: versions[versions.length - 1].content) */
  content: string;
  /** Quoted passage from the source that anchors this container */
  quote?: string;
  top: number;
  /** Timestamp of the LATEST version (alias: versions[versions.length - 1].at) */
  at: number;
  /** Timestamp of the FIRST version — container creation time */
  firstAt: number;
  /** Number of versions in this container */
  versionCount: number;
  /** Version chain, oldest-first. Length >= 1. */
  versions: ThoughtAnchorVersion[];
  /** True if this container has been crystallized (locked, no new versions) */
  isCrystallized: boolean;
  /** Legacy: count of times the user visited this anchor. Kept for compat. */
  count: number;
};

export type HeadingItem = {
  id: string;
  text: string;
  level: number;
  sectionNumber: number;
  top: number;
};

export type ThoughtMapNode = {
  id: string;
  text: string;
  level: number;
  sectionNumber: number;
  top: number;
  status: 'empty' | 'woven';
  thoughtCount: number;
  /** Total version count across all anchors in this section. Used for depth
   *  display: a section with 1 anchor × 5 versions has depth 5, not 1. */
  totalVersions: number;
  /** Max version count of any single anchor in this section. Shown as the
   *  dominant "depth" hint when rendering. */
  maxDepth: number;
  /** True if any anchor in this section is crystallized. */
  anyCrystallized: boolean;
  anchorId: string;
  anchorBlockId?: string;
  anchorBlockText?: string;
  summary?: string;
};

function filteredChildren(prose: Element) {
  return Array.from(prose.children).filter((c) => {
    const node = c as HTMLElement;
    if (node.hasAttribute('data-loom-system')) return false;
    if (node.classList.contains('tag-row')) return false;
    if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return false;
    return true;
  }) as HTMLElement[];
}

function normalizeBlockText(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 280);
}

function resolveProseBlock(id: string, blockText?: string): HTMLElement | null {
  const prose = document.querySelector('main .loom-source-prose');
  if (!prose) return null;

  const blockId = id.includes('::frag:') ? id.split('::frag:')[0] : id;

  if (blockId.startsWith('p-')) {
    const idx = parseInt(blockId.slice(2), 10);
    return filteredChildren(prose)[idx] ?? null;
  }

  if (blockId.startsWith('loom-block-')) {
    const idx = parseInt(blockId.slice('loom-block-'.length), 10);
    return filteredChildren(prose)[idx] ?? null;
  }

  if (blockText) {
    const target = normalizeBlockText(blockText);
    const found = filteredChildren(prose).find((child) => normalizeBlockText(child.innerText || child.textContent || '') === target);
    if (found) return found;
  }

  return null;
}

export function slugifyHeading(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function collectHeadingItems(root: ParentNode = document): HeadingItem[] {
  const headings = Array.from(
    root.querySelectorAll('.loom-source-prose h2, .loom-source-prose h3'),
  ) as HTMLElement[];

  // Deduplicate heading ids — two headings with identical slug (e.g. two
  // "在文中的意义" sections in the same doc) would collide as React keys and
  // break anchor matching. Suffix -2, -3, ... on collision. Same fix as
  // TableOfContents / DocOutline.
  const usedIds = new Set<string>();
  headings.forEach((h) => {
    let id = h.id;
    if (!id) {
      const base = slugifyHeading(h.textContent ?? '');
      if (!base) return;
      id = base;
      let n = 2;
      while (usedIds.has(id)) id = `${base}-${n++}`;
      h.id = id;
    } else if (usedIds.has(id)) {
      const base = id;
      let n = 2;
      while (usedIds.has(id)) id = `${base}-${n++}`;
      h.id = id;
    }
    usedIds.add(id);
  });

  let currentSection = 0;
  return headings.map((h) => {
    const level = h.tagName === 'H2' ? 2 : 3;
    if (level === 2) currentSection += 1;
    return {
      id: h.id,
      text: h.textContent ?? '',
      level,
      sectionNumber: currentSection,
      top: h.getBoundingClientRect().top + window.scrollY,
    };
  });
}

export function locateAnchorElement(anchorId: string, anchorBlockId?: string, anchorBlockText?: string): HTMLElement | null {
  if (anchorBlockId) {
    const blockEl = document.getElementById(anchorBlockId);
    if (blockEl) return blockEl as HTMLElement;
    const resolvedBlock = resolveProseBlock(anchorBlockId, anchorBlockText);
    if (resolvedBlock) return resolvedBlock;
  }

  let el = document.getElementById(anchorId);
  if (el) return el;
  return resolveProseBlock(anchorId, anchorBlockText);
}

export function buildThoughtAnchorViews(readingTrace: Trace | null): ThoughtAnchorView[] {
  return buildThoughtAnchorViewsFromTraces(readingTrace ? [readingTrace] : []);
}

export function useReadingThoughtAnchors(docId: string | null) {
  const { traces, loading } = useTracesForDoc(docId);
  const readingTraces = useMemo(() => rootReadingTraces(traces), [traces]);
  const primaryReadingTrace = readingTraces[0] ?? null;
  const thoughtItems = useMemo(
    () => buildThoughtAnchorViewsFromTraces(readingTraces),
    [readingTraces],
  );
  return { traces, loading, readingTraces, primaryReadingTrace, thoughtItems };
}

export function rootReadingTraces(traces: Trace[]): Trace[] {
  return traces
    .filter((t) => t.kind === 'reading' && !t.parentId)
    .sort((a, b) => b.updatedAt - a.updatedAt || b.events.length - a.events.length || a.createdAt - b.createdAt);
}

export function buildThoughtAnchorViewsFromTraces(readingTraces: Trace[]): ThoughtAnchorView[] {
  if (readingTraces.length === 0) return [];

  const headingItems = collectHeadingItems();

  // §X · Version-aware aggregation.
  //
  // Every thought-anchor event is a potential version of some container.
  // Containers are keyed by POSITION, not by anchorId alone — two events
  // with different anchorIds but the same text fingerprint (block text +
  // char range) belong to the same container. This survives DOM reindexing
  // across page reloads where the anchorId may shift even though the user
  // was thinking about the same passage.
  //
  // Key format: `${anchorBlockText}::${charStart}-${charEnd}`
  // If no block text or char range is available, fall back to anchorId.
  const containerKey = (e: any): string => {
    const text = (e.anchorBlockText as string | undefined) ?? '';
    const cs = (e.anchorCharStart as number | undefined) ?? -1;
    const ce = (e.anchorCharEnd as number | undefined) ?? -1;
    if (text && (cs >= 0 || ce >= 0)) return `pos::${text}::${cs}-${ce}`;
    if (text) return `pos::${text}::block`;
    return `id::${e.anchorId}`;
  };

  // First pass: bucket all thought-anchor events by container key, and
  // collect all anchor-scoped crystallize events (events with anchorId set).
  type Bucket = {
    events: Array<Extract<NonNullable<Trace['events'][number]>, { kind: 'thought-anchor' }> & { __traceId: string }>;
    crystallizedAt?: number;
  };
  const buckets = new Map<string, Bucket>();
  const anchorCrystallizeByKey = new Map<string, number>();
  // Map anchorId → containerKey so crystallize events (which are scoped by
  // anchorId) can find their container even if the container key derives
  // from text fingerprint.
  const anchorIdToKey = new Map<string, string>();

  for (const trace of readingTraces) {
    for (const e of trace.events) {
      if (e.kind === 'thought-anchor') {
        const key = containerKey(e);
        anchorIdToKey.set(e.anchorId, key);
        const bucket = buckets.get(key) ?? { events: [] };
        bucket.events.push({ ...e, __traceId: trace.id });
        buckets.set(key, bucket);
      } else if (e.kind === 'crystallize' && (e as any).anchorId) {
        // Anchor-scoped crystallize. Indexed by anchorId; resolved to
        // container key after all thought-anchor events are seen.
        const aid = (e as any).anchorId as string;
        const prev = anchorCrystallizeByKey.get(aid) ?? 0;
        if (e.at > prev) anchorCrystallizeByKey.set(aid, e.at);
      }
    }
  }

  // Resolve crystallize events to container keys
  for (const [aid, at] of anchorCrystallizeByKey.entries()) {
    const key = anchorIdToKey.get(aid);
    if (!key) continue;
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (!bucket.crystallizedAt || at > bucket.crystallizedAt) {
      bucket.crystallizedAt = at;
    }
  }

  // Second pass: build one ThoughtAnchorView per bucket, using the LATEST
  // event for positional metadata (the latest knows where the passage
  // currently is after reindexing) but accumulating ALL events as versions.
  const items: ThoughtAnchorView[] = [];
  for (const [bucketKey, bucket] of buckets.entries()) {
    // Sort events by time (oldest first = natural version order)
    const sorted = bucket.events.slice().sort((a, b) => a.at - b.at);
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    if (!latest || !first) continue;

    const versions: ThoughtAnchorVersion[] = sorted.map((ev) => ({
      at: ev.at,
      summary: ev.summary,
      content: ev.content,
    }));

    const blockEl = locateAnchorElement(latest.anchorId, latest.anchorBlockId, latest.anchorBlockText);
    const top = blockEl
      ? blockEl.getBoundingClientRect().top + window.scrollY + (latest.anchorOffsetPx ?? 0)
      : Number.MAX_SAFE_INTEGER;

    let section = 'Unplaced';
    let sectionId: string | undefined;
    let sectionNumber: number | undefined;
    for (const heading of headingItems) {
      if (heading.top <= top + 1) {
        section = heading.text.trim() || section;
        sectionId = heading.id;
        sectionNumber = heading.sectionNumber;
      } else break;
    }

    items.push({
      traceId: latest.__traceId,
      containerKey: `${latest.__traceId}::${bucketKey}`,
      anchorId: latest.anchorId,
      anchorType: latest.anchorType,
      anchorBlockId: latest.anchorBlockId,
      anchorBlockText: latest.anchorBlockText,
      anchorOffsetPx: latest.anchorOffsetPx,
      anchorCharStart: latest.anchorCharStart,
      anchorCharEnd: latest.anchorCharEnd,
      rangeStartId: latest.rangeStartId,
      rangeStartText: latest.rangeStartText,
      rangeEndId: latest.rangeEndId,
      rangeEndText: latest.rangeEndText,
      sectionId,
      sectionNumber,
      section,
      // Flat fields = latest version (backward compat)
      summary: latest.summary,
      content: latest.content,
      quote: latest.quote,
      top,
      at: latest.at,
      // New version fields
      firstAt: first.at,
      versionCount: versions.length,
      versions,
      isCrystallized: bucket.crystallizedAt !== undefined,
      // Legacy count (how many events for this container — same as versionCount)
      count: versions.length,
    });
  }

  items.sort((a, b) => a.top - b.top);
  return items;
}

export function buildThoughtMapNodes(headings: HeadingItem[], thoughts: ThoughtAnchorView[]): ThoughtMapNode[] {
  const byHeading = new Map<string, ThoughtMapNode>();

  for (const heading of headings) {
    byHeading.set(heading.id, {
      id: heading.id,
      text: heading.text,
      level: heading.level,
      sectionNumber: heading.sectionNumber,
      top: heading.top,
      status: 'empty',
      thoughtCount: 0,
      totalVersions: 0,
      maxDepth: 0,
      anyCrystallized: false,
      anchorId: heading.id,
      anchorBlockId: heading.id,
      anchorBlockText: heading.text,
    });
  }

  for (const thought of thoughts) {
    const sectionId = thought.sectionId ?? headings.find((h) => h.text === thought.section)?.id;
    if (!sectionId) continue;
    const node = byHeading.get(sectionId);
    if (!node) continue;
    node.status = 'woven';
    node.thoughtCount += 1;
    node.totalVersions += thought.versionCount;
    if (thought.versionCount > node.maxDepth) node.maxDepth = thought.versionCount;
    if (thought.isCrystallized) node.anyCrystallized = true;
    node.anchorId = thought.anchorId;
    node.anchorBlockId = thought.anchorBlockId ?? thought.anchorId;
    node.anchorBlockText = thought.anchorBlockText ?? thought.section;
    if (!node.summary) node.summary = thought.summary;
  }

  return Array.from(byHeading.values()).sort((a, b) => a.top - b.top);
}
