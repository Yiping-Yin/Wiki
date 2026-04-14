'use client';
/**
 * ReviewThoughtMap · the right-side peripheral thinking surface.
 *
 * Two states, toggled by ⌘/ (via CoworkSplit's `active` prop):
 *   - **narrow** (default, ~260px): a section TOC. Clicking a woven section
 *     scrolls the source doc to that passage. Clicking a bare section opens
 *     ChatFocus on the heading. Read-only navigation.
 *   - **wide** (~420px, when `active=true`): a per-thought list. Each
 *     thought-anchor is a card showing its quote and latest version content,
 *     with an inline textarea to append a new version. This is where
 *     capture-only anchors (created via ⌘⇧A / ⌘-click on SelectionWarp) get
 *     elaborated.
 *
 * Visible whenever the doc has at least one thought-anchor, regardless of
 * active state. The narrow state is the always-present peripheral surface
 * that replaces the old canvas — you don't enter it, it's just there.
 * `active` transitions it into wide/writable mode for focused elaboration.
 *
 * History: this used to be a thin TOC that only appeared when ⌘/ was
 * pressed. The canvas pivot (2026-04-11) promoted it to the primary
 * thinking surface and deleted CanvasLayer/CanvasCard.
 * See CAPTURE_SPEC.md and memory/project_canvas_pivot.md.
 */
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { useSmallScreen } from '../lib/use-small-screen';
import { useAllTraces, useAppendEvent, useBacklinksForDoc, useRemoveEvents } from '../lib/trace';
import {
  buildThoughtMapNodes,
  collectHeadingItems,
  locateAnchorElement,
  useReadingThoughtAnchors,
  type HeadingItem,
  type ThoughtMapNode,
  type ThoughtAnchorView,
} from './thought-anchor-model';

const NoteRenderer = dynamic(
  () => import('./NoteRenderer').then((m) => m.NoteRenderer),
  { ssr: false },
);

function thoughtTypeLabel(type: import('../lib/trace/types').ThoughtType | undefined, hasContent: boolean): string {
  if (!type) return hasContent ? 'woven' : 'captured';
  switch (type) {
    case 'citation': return 'citation';
    case 'explanation': return 'explanation';
    case 'inference': return 'inference';
    case 'hypothesis': return 'hypothesis';
    case 'objection': return 'objection';
    case 'question': return 'question';
    case 'conclusion': return 'conclusion';
    default: return hasContent ? 'woven' : 'captured';
  }
}

/** Color for each thought type — epistemic identity made visible. */
function thoughtTypeColor(type: import('../lib/trace/types').ThoughtType | undefined): string {
  switch (type) {
    case 'citation': return 'var(--muted)';
    case 'explanation': return 'var(--accent)';
    case 'inference': return 'var(--tint-purple)';
    case 'hypothesis': return 'var(--tint-orange)';
    case 'objection': return 'var(--tint-red)';
    case 'question': return 'var(--tint-yellow)';
    case 'conclusion': return 'var(--tint-green)';
    default: return 'var(--fg-secondary)';
  }
}

const REVIEW_SCROLL_EVENT = 'loom:review:scroll-to-anchor';
const REVIEW_FOCUS_THOUGHT_EVENT = 'loom:review:focus-thought';

type RelatedDocPreview = {
  docId: string;
  title: string;
};

function deriveSummary(content: string): string {
  const firstLine = content
    .split('\n')
    .find((l) => l.trim().length > 0)
    ?.trim() ?? '';
  return firstLine.length > 100 ? firstLine.slice(0, 100) + '…' : firstLine;
}

export function ReviewThoughtMap({ active }: { active: boolean }) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const smallScreen = useSmallScreen();
  const { traces: allTraces } = useAllTraces();
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [nodes, setNodes] = useState<ThoughtMapNode[]>([]);
  const [activeAnchorId, setActiveAnchorId] = useState<string>('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pendingFocusAnchorId, setPendingFocusAnchorId] = useState<string | null>(null);
  const { thoughtItems, traces, primaryReadingTrace } = useReadingThoughtAnchors(
    ctx.isFree ? null : ctx.docId,
  );
  const append = useAppendEvent();
  const removeEvents = useRemoveEvents();

  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Map is rendered whenever there's at least one thought in a non-free
  // doc. The narrow state is persistent peripheral UI; `active` toggles
  // to wide.
  const isReadingPage = !ctx.isFree && (
    pathname.startsWith('/wiki/') ||
    pathname.startsWith('/knowledge/') ||
    pathname.startsWith('/uploads/')
  );
  const hasThoughts = thoughtItems.length > 0;
  const [introVisibility, setIntroVisibility] = useState(1);
  const panelCrystallized = Boolean(
    primaryReadingTrace?.crystallizedAt,
  );
  const panelDocHref = primaryReadingTrace?.source?.href ?? null;
  const backlinks = useBacklinksForDoc(ctx.isFree ? null : ctx.docId, panelDocHref);
  const uncrystallizePanel = useCallback(async () => {
    if (!primaryReadingTrace) return;
    await append(primaryReadingTrace.id, {
      kind: 'panel-reopen',
      at: Date.now(),
    });
  }, [append, primaryReadingTrace]);
  const panelRelations = useMemo(() => {
    const incoming = new Map<string, RelatedDocPreview>();
    for (const backlink of backlinks) {
      if (!incoming.has(backlink.fromDocId)) {
        incoming.set(backlink.fromDocId, {
          docId: backlink.fromDocId,
          title: backlink.fromDocTitle,
        });
      }
    }

    const candidates = allTraces
      .filter((trace) => trace.kind === 'reading' && !trace.parentId && trace.source?.docId && trace.source?.href)
      .map((trace) => ({
        docId: trace.source!.docId,
        href: trace.source!.href,
        title: trace.source!.sourceTitle ?? trace.title,
      }));

    const outgoing = new Map<string, RelatedDocPreview>();
    for (const thought of thoughtItems) {
      const urls = Array.from((thought.content || '').matchAll(/\[[^\]]*\]\(([^)]+)\)/g))
        .map((match) => match[1]?.trim().split(/\s+/)[0] ?? '')
        .filter(Boolean);
      for (const url of urls) {
        const cleanUrl = url.split('#')[0].split('?')[0];
        const target = candidates.find((candidate) => {
          if (!cleanUrl || candidate.docId === ctx.docId) return false;
          return cleanUrl === candidate.href
            || cleanUrl.endsWith(candidate.href)
            || cleanUrl.endsWith(candidate.href.replace(/^\//, ''));
        });
        if (target && !outgoing.has(target.docId)) {
          outgoing.set(target.docId, {
            docId: target.docId,
            title: target.title,
          });
        }
      }
    }

    return {
      incoming: Array.from(incoming.values()),
      outgoing: Array.from(outgoing.values()),
    };
  }, [allTraces, backlinks, ctx.docId, thoughtItems]);

  // Narrow thought-map presence is an intro/review affordance, not a
  // permanent right sidebar. Near the top of a document it is visible;
  // as the user reads deeper it fades away, then returns in full when
  // review mode is explicitly entered.
  useEffect(() => {
    if (!isReadingPage || !hasThoughts) {
      setIntroVisibility(0);
      return;
    }
    if (active) {
      setIntroVisibility(1);
      return;
    }

    let raf = 0;

    const measure = () => {
      raf = 0;
      const prose = document.querySelector('main .loom-source-prose') as HTMLElement | null;
      if (!prose) {
        setIntroVisibility(0);
        return;
      }
      const proseTop = prose.getBoundingClientRect().top + window.scrollY;
      const depth = Math.max(0, window.scrollY - proseTop);
      const fadeStart = 96;
      const fadeEnd = 760;
      const next =
        depth <= fadeStart
          ? 1
          : depth >= fadeEnd
            ? 0
            : 1 - (depth - fadeStart) / (fadeEnd - fadeStart);
      setIntroVisibility(next);
    };

    const requestMeasure = () => {
      if (raf) return;
      raf = requestAnimationFrame(measure);
    };

    requestMeasure();
    window.addEventListener('scroll', requestMeasure, { passive: true });
    window.addEventListener('resize', requestMeasure);

    return () => {
      window.removeEventListener('scroll', requestMeasure);
      window.removeEventListener('resize', requestMeasure);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [active, hasThoughts, isReadingPage]);

  const shouldRender = isReadingPage && (active || (hasThoughts && introVisibility > 0.02));

  // Hide thought map when a learning overlay is open (Rehearsal/Examiner
  // take the same right-side space). Returns when overlay closes.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent).detail?.id;
      setOverlayOpen(id && id !== '__none__');
    };
    // overlay:open fires when any overlay opens; listen for close too
    window.addEventListener('loom:overlay:open', onOpen);
    return () => window.removeEventListener('loom:overlay:open', onOpen);
  }, []);

  // Visibility animation
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (shouldRender) {
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    setVisible(false);
    const id = window.setTimeout(() => setMounted(false), 400);
    return () => window.clearTimeout(id);
  }, [shouldRender]);

  // Heading collection for section TOC (narrow state needs this, and wide
  // state uses it to label each thought with its section).
  useEffect(() => {
    if (!shouldRender) {
      setHeadings([]);
      return;
    }
    const collect = () => setHeadings(collectHeadingItems());
    collect();

    let raf = 0;
    const mut = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(collect);
    });
    const main = document.querySelector('main');
    if (main) mut.observe(main, { childList: true, subtree: true, characterData: true });

    return () => {
      cancelAnimationFrame(raf);
      mut.disconnect();
    };
  }, [shouldRender]);

  useEffect(() => {
    setNodes(buildThoughtMapNodes(headings, thoughtItems));
  }, [thoughtItems, headings]);

  useEffect(() => {
    const onActive = (e: Event) => {
      const anchorId = (e as CustomEvent).detail?.anchorId as string | null | undefined;
      setActiveAnchorId(anchorId ?? '');
    };
    window.addEventListener('loom:review:active-anchor', onActive);
    return () => window.removeEventListener('loom:review:active-anchor', onActive);
  }, []);

  useEffect(() => {
    if (!activeAnchorId) return;
    activeBtnRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeAnchorId]);

  useEffect(() => {
    const onFocusThought = (e: Event) => {
      const anchorId = (e as CustomEvent).detail?.anchorId as string | null | undefined;
      if (!anchorId) return;
      setPendingFocusAnchorId(anchorId);
    };
    window.addEventListener(REVIEW_FOCUS_THOUGHT_EVENT, onFocusThought);
    return () => window.removeEventListener(REVIEW_FOCUS_THOUGHT_EVENT, onFocusThought);
  }, []);

  useEffect(() => {
    if (!active || !pendingFocusAnchorId) return;
    const target = thoughtItems.find((item) => item.anchorId === pendingFocusAnchorId);
    if (!target) return;
    setExpandedKey(target.containerKey);
    setActiveAnchorId(target.anchorId);
    setPendingFocusAnchorId(null);
  }, [active, pendingFocusAnchorId, thoughtItems]);

  // Collapse the expanded thought when leaving wide mode, so next time the
  // user goes wide they start fresh.
  useEffect(() => {
    if (!active) setExpandedKey(null);
  }, [active]);

  // Append-version handler for wide-mode elaboration.
  const handleAppendVersion = useCallback(
    async (thought: ThoughtAnchorView, newContent: string) => {
      if (!newContent.trim()) return;
      const summary = deriveSummary(newContent);
      await append(thought.traceId, {
        kind: 'thought-anchor',
        anchorType: thought.anchorType,
        anchorId: thought.anchorId,
        anchorBlockId: thought.anchorBlockId,
        anchorBlockText: thought.anchorBlockText,
        anchorOffsetPx: thought.anchorOffsetPx,
        anchorCharStart: thought.anchorCharStart,
        anchorCharEnd: thought.anchorCharEnd,
        rangeStartId: thought.rangeStartId,
        rangeStartText: thought.rangeStartText,
        rangeEndId: thought.rangeEndId,
        rangeEndText: thought.rangeEndText,
        summary,
        content: newContent,
        quote: thought.quote,
        thoughtType: thought.thoughtType ?? 'explanation',
        attribution: 'user',
        at: Date.now(),
      });
    },
    [append],
  );

  if (!mounted) return null;
  // Hide when a learning overlay occupies the right side
  if (overlayOpen && !active) return null;

  // Empty state: no reading-page chrome if no captures exist yet.
  const narrowWidth = hasThoughts ? 'clamp(240px, 20vw, 320px)' : '40px';
  const wideWidth = 'min(440px, 40vw)';
  const setReviewActive = (next: boolean) => {
    window.dispatchEvent(
      new CustomEvent('loom:review:set-active', { detail: { active: next } }),
    );
  };

  if (thoughtItems.length === 0 && !active) {
    return null;
  }

  return (
    <aside
      className="loom-thought-map"
      style={{
        position: 'fixed',
        left: smallScreen
          ? '12px'
          : active
            ? 'auto'
            : 'calc(50vw + (var(--stage-width) / 2) + 28px)',
        right: smallScreen ? '12px' : active ? '24px' : 'auto',
        top: smallScreen ? 'auto' : '4rem',
        bottom: smallScreen ? 'max(12px, env(safe-area-inset-bottom, 0px) + 8px)' : 'auto',
        width: smallScreen ? 'auto' : active ? wideWidth : narrowWidth,
        maxHeight: smallScreen
          ? active
            ? 'min(78vh, 720px)'
            : 'min(28vh, 220px)'
          : 'calc(100vh - 6rem)',
        overflowY: 'auto',
        zIndex: 76,
        pointerEvents: visible && (active || introVisibility > 0.16) ? 'auto' : 'none',
        // Narrow mode is an introductory rail that fades with reading depth.
        opacity: visible ? (active ? 1 : 0.46 * introVisibility) : 0,
        transform: visible ? 'translateX(0)' : 'translateX(6px)',
        transition:
          'opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), width 0.4s cubic-bezier(0.22, 1, 0.36, 1), left 0.4s cubic-bezier(0.22, 1, 0.36, 1), right 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        background: smallScreen ? 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))' : 'transparent',
        borderTop: smallScreen ? '0.5px solid var(--mat-border)' : 'none',
        borderBottom: smallScreen ? '0.5px solid var(--mat-border)' : 'none',
        borderRadius: smallScreen ? 16 : 0,
        boxShadow: smallScreen ? 'var(--shadow-2)' : 'none',
        padding: smallScreen ? '0.75rem 0.85rem 0.85rem' : 0,
        backdropFilter: smallScreen ? 'saturate(180%) blur(20px)' : 'none',
        WebkitBackdropFilter: smallScreen ? 'saturate(180%) blur(20px)' : 'none',
      }}
    >
      {(active || smallScreen) && (
        <div
          className="t-caption2"
          style={{
            marginBottom: '0.75rem',
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: '0.62rem', opacity: 0.8 }}>Thought Map</span>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
          <span style={{ color: 'var(--muted)', fontSize: '0.62rem', opacity: 0.7 }}>{thoughtItems.length}</span>
          {smallScreen && (
            <button
              type="button"
              onClick={() => setReviewActive(!active)}
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                color: 'var(--accent)',
                fontSize: '0.66rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              {active ? 'Done' : 'Open'}
            </button>
          )}
        </div>
      )}

      {active ? (
        <WideThoughtList
          thoughts={thoughtItems}
          expandedKey={expandedKey}
          onExpand={setExpandedKey}
          onAppendVersion={handleAppendVersion}
          activeAnchorId={activeAnchorId}
          panelCrystallized={panelCrystallized}
          panelRelations={panelRelations}
          onOpenKesi={() => router.push(ctx.docId ? `/kesi?focus=${encodeURIComponent(ctx.docId)}` : '/kesi')}
          onOpenRelations={() => router.push(ctx.docId ? `/graph?focus=${encodeURIComponent(ctx.docId)}` : '/graph')}
          onUncrystallize={uncrystallizePanel}
        />
      ) : (
        <NarrowSectionTOC
          nodes={nodes}
          activeAnchorId={activeAnchorId}
          activeBtnRef={activeBtnRef}
          smallScreen={smallScreen}
        />
      )}
    </aside>
  );
}

// ── Narrow state: section TOC (preserves prior behavior) ─────────────────

function NarrowSectionTOC({
  nodes,
  activeAnchorId,
  activeBtnRef,
  smallScreen,
}: {
  nodes: ThoughtMapNode[];
  activeAnchorId: string;
  activeBtnRef: React.MutableRefObject<HTMLButtonElement | null>;
  smallScreen: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        borderLeft: smallScreen ? 'none' : '0.5px solid color-mix(in srgb, var(--mat-border) 78%, transparent)',
        paddingLeft: smallScreen ? 0 : '0.62rem',
      }}
    >
      {nodes.map((item) => {
        const sectionNo = String(item.sectionNumber).padStart(2, '0');
        const isActive = activeAnchorId === item.anchorId;
        const pendingOnly = item.hasPendingCapture && !item.summary;
        return (
          <button
            ref={isActive ? activeBtnRef : undefined}
            key={item.id}
            type="button"
            onClick={() => {
              if (item.hasPendingCapture && item.pendingAnchorId) {
                window.dispatchEvent(
                  new CustomEvent('loom:review:set-active', { detail: { active: true } }),
                );
                window.dispatchEvent(
                  new CustomEvent('loom:review:focus-thought', {
                    detail: { anchorId: item.pendingAnchorId },
                  }),
                );
                return;
              }
              if (item.status === 'woven') {
                window.dispatchEvent(
                  new CustomEvent(REVIEW_SCROLL_EVENT, {
                    detail: { anchorId: item.anchorId },
                  }),
                );
                return;
              }
              const el = locateAnchorElement(
                item.anchorId,
                item.anchorBlockId,
                item.anchorBlockText,
              );
              if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Macro → Micro transition: highlight the passage briefly
                el.classList.remove('loom-highlight-passage');
                void el.offsetWidth; // force reflow to restart animation
                el.classList.add('loom-highlight-passage');
                setTimeout(() => el.classList.remove('loom-highlight-passage'), 1600);
              }
              window.dispatchEvent(
                new CustomEvent('loom:review:set-active', { detail: { active: false } }),
              );
              window.dispatchEvent(
                new CustomEvent('loom:chat:focus', {
                  detail: { text: item.text, anchorId: item.anchorId },
                }),
              );
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              borderRadius: 8,
              border: 0,
              background: isActive
                ? 'color-mix(in srgb, var(--accent) 7%, var(--bg))'
                : 'transparent',
              padding: item.level === 2 ? '0.38rem 0.45rem 0.42rem' : '0.26rem 0.45rem 0.32rem 0.9rem',
              color: 'var(--fg)',
              cursor: 'pointer',
              // Passive Fading: older thoughts visually recede.
              // Crystallized items never fade. Uses the item's latest
              // event timestamp if available, otherwise no fading.
              opacity: item.anyCrystallized ? 1
                : (() => {
                    const at = (item as any).latestAt ?? (item as any).at ?? 0;
                    if (!at) return 1;
                    const ageDays = (Date.now() - at) / 86_400_000;
                    return ageDays < 7 ? 1 : ageDays < 30 ? 0.82 : ageDays < 60 ? 0.55 : 0.35;
                  })(),
              transition: 'opacity 0.3s ease',
            }}
          >
            <div
              className="t-caption2"
              style={{
                color: item.status === 'woven' ? 'var(--accent)' : 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: item.status === 'woven' ? 700 : 600,
                marginBottom: item.status === 'woven' && item.summary ? 3 : 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>
                {item.status === 'woven' ? '◆' : '◇'} {sectionNo}
              </span>
              {item.hasPendingCapture && (
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '0.66rem',
                    color: 'var(--muted)',
                    opacity: 0.8,
                    fontWeight: 700,
                  }}
                  title={`${item.pendingCaptureCount} capture${item.pendingCaptureCount === 1 ? '' : 's'} waiting for elaboration`}
                >
                  +{item.pendingCaptureCount}
                </span>
              )}
              {item.status === 'woven' && item.totalVersions > 1 && (
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '0.66rem',
                    color: 'var(--accent)',
                    opacity: 0.7,
                    fontWeight: 600,
                  }}
                  title={`${item.totalVersions} total iteration${item.totalVersions === 1 ? '' : 's'} · max depth v${item.maxDepth}`}
                >
                  × {item.totalVersions}
                </span>
              )}
              {item.anyCrystallized && (
                <span
                  title="Contains crystallized (locked) thoughts"
                  style={{ color: 'var(--tint-indigo)', fontSize: '0.78rem' }}
                >
                  ◈
                </span>
              )}
            </div>
            {item.status === 'woven' && item.summary && (
              <div
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  lineHeight: 1.45,
                  color: 'var(--fg-secondary)',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {item.summary}
              </div>
            )}
            {pendingOnly && item.pendingQuote && (
              <div
                style={{
                  fontSize: '0.74rem',
                  color: 'var(--muted)',
                  fontStyle: 'italic',
                  lineHeight: 1.45,
                  marginTop: 2,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {item.pendingQuote.length > 120 ? `${item.pendingQuote.slice(0, 120)}…` : item.pendingQuote}
              </div>
            )}
            {!pendingOnly && item.hasPendingCapture && item.summary && (
              <div
                className="t-caption2"
                style={{
                  marginTop: 3,
                  color: 'var(--muted)',
                  letterSpacing: '0.03em',
                  fontWeight: 700,
                }}
              >
                ↳ +{item.pendingCaptureCount} pending
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Wide state: per-thought list with inline elaboration ─────────────────

function WideThoughtList({
  thoughts,
  expandedKey,
  onExpand,
  onAppendVersion,
  activeAnchorId,
  panelCrystallized,
  panelRelations,
  onOpenKesi,
  onOpenRelations,
  onUncrystallize,
}: {
  thoughts: ThoughtAnchorView[];
  expandedKey: string | null;
  onExpand: (key: string | null) => void;
  onAppendVersion: (thought: ThoughtAnchorView, content: string) => Promise<void>;
  activeAnchorId: string;
  panelCrystallized: boolean;
  panelRelations: { incoming: RelatedDocPreview[]; outgoing: RelatedDocPreview[] };
  onOpenKesi: () => void;
  onOpenRelations: () => void;
  onUncrystallize: () => Promise<void>;
}) {
  const sectionGroups = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      section: string;
      sectionNo?: number;
      thoughts: ThoughtAnchorView[];
    }>();

    for (const thought of thoughts) {
      const key = `${thought.sectionNumber ?? 9999}::${thought.section}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          section: thought.section,
          sectionNo: thought.sectionNumber,
          thoughts: [],
        });
      }
      groups.get(key)!.thoughts.push(thought);
    }

    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const ao = a.sectionNo ?? 9999;
      const bo = b.sectionNo ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.section.localeCompare(b.section);
    });

    for (const group of sortedGroups) {
      group.thoughts.sort((a, b) => {
        const aActive = a.anchorId === activeAnchorId ? 1 : 0;
        const bActive = b.anchorId === activeAnchorId ? 1 : 0;
        if (aActive !== bActive) return bActive - aActive;

        const aEmpty = a.content.trim() || a.summary.trim() ? 0 : 1;
        const bEmpty = b.content.trim() || b.summary.trim() ? 0 : 1;
        if (aEmpty !== bEmpty) return bEmpty - aEmpty;

        return a.top - b.top || b.at - a.at;
      });
    }

    return sortedGroups;
  }, [thoughts, activeAnchorId]);

  const focusThought = useMemo(() => {
    return thoughts.find((thought) => thought.anchorId === activeAnchorId) ?? thoughts[0] ?? null;
  }, [thoughts, activeAnchorId]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      {focusThought && (
        <WideThoughtHeader
          thought={focusThought}
          panelCrystallized={panelCrystallized}
          panelRelations={panelRelations}
          onOpenRelatedDoc={(docId) => window.location.assign(`/graph?focus=${encodeURIComponent(docId)}`)}
        />
      )}
      {sectionGroups.map((group) => (
        <section key={group.key}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 7,
            }}
          >
            <span
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}
            >
              {group.sectionNo ? `${String(group.sectionNo).padStart(2, '0')} · ` : ''}{group.section}
            </span>
            <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
            <span
              className="t-caption2"
              style={{ color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap', opacity: 0.7 }}
            >
              {group.thoughts.length}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {group.thoughts.map((t) => (
              <WideThoughtCard
                key={t.containerKey}
                thought={t}
                expanded={expandedKey === t.containerKey}
                emphasized={activeAnchorId === t.anchorId}
                panelCrystallized={panelCrystallized}
                onOpenKesi={onOpenKesi}
                onOpenRelations={onOpenRelations}
                onUncrystallize={onUncrystallize}
                onToggle={() =>
                  onExpand(expandedKey === t.containerKey ? null : t.containerKey)
                }
                onAppendVersion={onAppendVersion}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function WideThoughtHeader({
  thought,
  panelCrystallized,
  panelRelations,
  onOpenRelatedDoc,
}: {
  thought: ThoughtAnchorView;
  panelCrystallized: boolean;
  panelRelations: { incoming: RelatedDocPreview[]; outgoing: RelatedDocPreview[] };
  onOpenRelatedDoc: (docId: string) => void;
}) {
  const goToSource = () => {
    window.dispatchEvent(
      new CustomEvent(REVIEW_SCROLL_EVENT, {
        detail: { anchorId: thought.anchorId },
      }),
    );
  };

  const heading = thought.summary.trim() || thought.content.trim() || 'This weave is still taking shape.';
  const excerpt = thought.quote?.trim() || thought.anchorBlockText?.trim() || '';

  return (
    <section
      style={{
        padding: '0.1rem 0 0.95rem',
        borderBottom: '0.5px solid var(--mat-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          Weaving now
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
        <span className="t-caption2" style={{ color: 'var(--accent)', fontWeight: 700, whiteSpace: 'nowrap' }}>
          {thought.sectionNumber ? `${String(thought.sectionNumber).padStart(2, '0')} · ` : ''}{thought.section}
        </span>
      </div>

      <div
        style={{
          fontFamily: 'var(--display)',
          fontSize: '0.98rem',
          fontWeight: 600,
          letterSpacing: '-0.016em',
          lineHeight: 1.35,
          marginBottom: 8,
          color: 'var(--fg)',
        }}
      >
        {heading}
      </div>

      {excerpt ? (
        <div
          style={{
            fontSize: '0.78rem',
            color: 'var(--muted)',
            fontStyle: 'italic',
            lineHeight: 1.5,
            paddingLeft: 10,
            borderLeft: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
            marginBottom: 10,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {excerpt}
        </div>
      ) : null}

      <div
        className="t-caption2"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          color: 'var(--muted)',
          letterSpacing: '0.04em',
        }}
      >
        <button
          type="button"
          onClick={goToSource}
          style={{
            appearance: 'none',
            border: 0,
            background: 'transparent',
            color: 'var(--fg-secondary)',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          Source
        </button>
      </div>
      {(panelRelations.incoming.length > 0 || panelRelations.outgoing.length > 0) && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {panelRelations.incoming.length > 0 && (
            <RelationPreviewRow
              label="Referenced by"
              items={panelRelations.incoming}
              onOpen={onOpenRelatedDoc}
            />
          )}
          {panelRelations.outgoing.length > 0 && (
            <RelationPreviewRow
              label="Points to"
              items={panelRelations.outgoing}
              onOpen={onOpenRelatedDoc}
            />
          )}
        </div>
      )}
    </section>
  );
}

function WideThoughtCard({
  thought,
  expanded,
  emphasized,
  panelCrystallized,
  onOpenKesi,
  onOpenRelations,
  onUncrystallize,
  onToggle,
  onAppendVersion,
}: {
  thought: ThoughtAnchorView;
  expanded: boolean;
  emphasized: boolean;
  panelCrystallized: boolean;
  onOpenKesi: () => void;
  onOpenRelations: () => void;
  onUncrystallize: () => Promise<void>;
  onToggle: () => void;
  onAppendVersion: (thought: ThoughtAnchorView, content: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBuf, setEditBuf] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) {
      // Auto-focus + place cursor at end when expanding
      const t = window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 120); // wait for the expand animation
      return () => window.clearTimeout(t);
    }
  }, [expanded]);

  useEffect(() => {
    if (!emphasized) return;
    cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [emphasized]);

  const save = useCallback(async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await onAppendVersion(thought, text);
      setDraft('');
    } finally {
      setSaving(false);
    }
  }, [draft, saving, thought, onAppendVersion]);

  const saveEdit = useCallback(async () => {
    const text = editBuf.trim();
    const original = (thought.content || thought.summary).trim();
    if (!text || text === original || saving) { setEditing(false); return; }
    setSaving(true);
    try {
      await onAppendVersion(thought, text);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }, [editBuf, saving, thought, onAppendVersion]);

  const startEditing = useCallback(() => {
    if (panelCrystallized) return;
    setEditBuf(thought.content || thought.summary);
    setEditing(true);
    requestAnimationFrame(() => {
      const ta = editRef.current;
      if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    });
  }, [thought, panelCrystallized]);

  const hasContent = Boolean(thought.content.trim() || thought.summary.trim());

  return (
    <div
      ref={cardRef}
      style={{
        borderRadius: 0,
        borderBottom: '0.5px solid var(--mat-border)',
        background: 'transparent',
        padding: '10px 0 11px',
        transition:
          'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
        boxShadow: 'none',
      }}
    >
      {/* Header: section label + version count */}
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          border: 0,
          padding: 0,
          marginBottom: 8,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span
          className="t-caption2"
          style={{
            color: emphasized ? 'var(--accent)' : thoughtTypeColor(thought.thoughtType),
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
          }}
        >
          ◆ {thoughtTypeLabel(thought.thoughtType, hasContent)}
        </span>
        {thought.versionCount > 1 && (
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: '0.66rem',
              color: 'var(--accent)',
              opacity: 0.7,
              fontWeight: 600,
            }}
          >
            v{thought.versionCount}
          </span>
        )}
        {thought.isCrystallized && (
          <span
            title="Crystallized (locked)"
            style={{ color: 'var(--tint-indigo)', fontSize: '0.82rem' }}
          >
            ◈
          </span>
        )}
      </button>

      {/* Quote — always visible. Explicit user-select: text so the user can
          drag-select inside the card to copy or re-quote; default behavior
          in WKWebView sometimes treats position:fixed asides as unselectable. */}
      {thought.quote && (
        <div
          style={{
            fontSize: '0.78rem',
            color: 'var(--muted)',
            fontStyle: 'italic',
            lineHeight: 1.5,
            marginBottom: 8,
            paddingLeft: 10,
            borderLeft: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            cursor: 'text',
          }}
        >
          {thought.quote.length > 220 && !expanded
            ? `${thought.quote.slice(0, 220)}…`
            : thought.quote}
        </div>
      )}

      {/* Content — latest version, click to edit */}
      {hasContent && editing ? (
        <textarea
          ref={editRef}
          value={editBuf}
          onChange={(e) => setEditBuf(e.target.value)}
          onBlur={() => void saveEdit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void saveEdit(); }
            if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); }
          }}
          style={{
            width: '100%',
            minHeight: 60,
            maxHeight: 400,
            padding: '6px 0',
            fontFamily: 'var(--display)',
            fontSize: '0.86rem',
            lineHeight: 1.55,
            color: 'var(--fg)',
            background: 'transparent',
            border: 0,
            borderBottom: '0.5px solid var(--accent)',
            borderRadius: 0,
            outline: 'none',
            resize: 'none',
            // @ts-ignore
            fieldSizing: 'content',
          }}
        />
      ) : hasContent ? (
        <div
          onClick={expanded ? startEditing : undefined}
          style={{
            fontSize: '0.86rem',
            lineHeight: 1.55,
            color: 'var(--fg)',
            overflow: expanded ? 'visible' : 'hidden',
            display: expanded ? 'block' : '-webkit-box',
            WebkitLineClamp: expanded ? undefined : 3,
            WebkitBoxOrient: 'vertical',
            userSelect: 'text',
            WebkitUserSelect: 'text',
            cursor: expanded && !panelCrystallized ? 'text' : 'default',
          }}
          className="note-rendered"
        >
          <NoteRenderer source={thought.content || thought.summary} />
        </div>
      ) : (
        <div
          style={{
            fontSize: '0.78rem',
            color: 'var(--muted)',
            fontStyle: 'italic',
            opacity: 0.66,
          }}
        >
          这一纬还没织完 — {expanded ? '写下你的第一版理解…' : '展开继续'}
        </div>
      )}

      {/* Inline elaboration textarea — only when expanded */}
      {expanded && panelCrystallized ? (
        <div
          style={{
            marginTop: 10,
            padding: '10px 0 0',
            borderTop: '0.5px solid var(--mat-border)',
          }}
        >
          <div
            className="t-caption2"
            style={{
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
              marginBottom: 6,
            }}
          >
            Settled into Kesi
          </div>
          <div
            style={{
              color: 'var(--fg-secondary)',
              fontSize: '0.8rem',
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            This panel is no longer provisional. If you want to keep weaving here, uncrystallize it first.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" onClick={onOpenKesi} style={settledActionStyle(true)}>
              Kesi
            </button>
            <button type="button" onClick={onOpenRelations} style={settledActionStyle(false)}>
              Relations
            </button>
            <button type="button" onClick={() => void onUncrystallize()} style={settledActionStyle(false)}>
              Uncrystallize
            </button>
          </div>
        </div>
      ) : expanded ? (
        <div style={{ marginTop: 10 }}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.stopPropagation();
                void save();
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                onToggle();
              }
            }}
            placeholder={
              thought.versionCount === 0 || !hasContent
                ? '写下这一段在你心里的意思…'
                : `追加第 v${thought.versionCount + 1} 版…`
            }
            style={{
              width: '100%',
              minHeight: 72,
              maxHeight: 280,
              padding: '8px 10px',
              fontFamily: 'var(--display)',
              fontSize: '0.85rem',
              lineHeight: 1.55,
              color: 'var(--fg)',
              background: 'var(--bg)',
              border: 0,
              borderBottom: '0.5px solid var(--mat-border)',
              borderRadius: 0,
              outline: 'none',
              resize: 'none',
              // @ts-ignore — modern CSS, unknown to TS types
              fieldSizing: 'content',
            }}
          />
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 6,
              fontSize: '0.7rem',
              color: 'var(--muted)',
            }}
          >
            <span>⌘↩ 保存 · Esc 取消</span>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!draft.trim() || saving}
              style={{
                background: draft.trim() ? 'var(--accent)' : 'transparent',
                color: draft.trim() ? 'var(--bg)' : 'var(--muted)',
                border: 0,
                borderRadius: 6,
                padding: '3px 10px',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: draft.trim() ? 'pointer' : 'default',
                opacity: saving ? 0.5 : 1,
              }}
            >
              {saving ? '…' : '✓'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function settledActionStyle(primary: boolean) {
  return {
    appearance: 'none' as const,
    border: `0.5px solid ${primary ? 'color-mix(in srgb, var(--accent) 38%, var(--mat-border))' : 'var(--mat-border)'}`,
    background: primary ? 'color-mix(in srgb, var(--accent) 10%, var(--bg-elevated))' : 'transparent',
    color: primary ? 'var(--accent)' : 'var(--fg-secondary)',
    borderRadius: 999,
    padding: '0.42rem 0.72rem',
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  };
}

function RelationPreviewRow({
  label,
  items,
  onOpen,
}: {
  label: string;
  items: RelatedDocPreview[];
  onOpen: (docId: string) => void;
}) {
  return (
    <div
      className="t-caption2"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        color: 'var(--muted)',
        letterSpacing: '0.04em',
      }}
    >
      <span>{label}</span>
      {items.slice(0, 2).map((item, index) => (
        <button
          key={`${label}-${item.docId}`}
          type="button"
          onClick={() => onOpen(item.docId)}
          style={{
            appearance: 'none',
            border: 0,
            background: 'transparent',
            color: 'var(--accent)',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.02em',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {item.title}
          {index < Math.min(items.length, 2) - 1 ? <span style={{ color: 'var(--muted)' }}> · </span> : null}
        </button>
      ))}
    </div>
  );
}
