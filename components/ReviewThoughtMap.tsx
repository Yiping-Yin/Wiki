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
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { useAppendEvent } from '../lib/trace';
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

const REVIEW_SCROLL_EVENT = 'loom:review:scroll-to-anchor';
const REVIEW_FOCUS_THOUGHT_EVENT = 'loom:review:focus-thought';

function deriveSummary(content: string): string {
  const firstLine = content
    .split('\n')
    .find((l) => l.trim().length > 0)
    ?.trim() ?? '';
  return firstLine.length > 100 ? firstLine.slice(0, 100) + '…' : firstLine;
}

export function ReviewThoughtMap({ active }: { active: boolean }) {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [nodes, setNodes] = useState<ThoughtMapNode[]>([]);
  const [activeAnchorId, setActiveAnchorId] = useState<string>('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pendingFocusAnchorId, setPendingFocusAnchorId] = useState<string | null>(null);
  const { thoughtItems, traces } = useReadingThoughtAnchors(
    ctx.isFree ? null : ctx.docId,
  );
  const append = useAppendEvent();

  const activeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Map is rendered whenever there's at least one thought in a non-free
  // doc. The narrow state is persistent peripheral UI; `active` toggles
  // to wide.
  const isReadingPage = !ctx.isFree && (
    pathname.startsWith('/wiki/') || pathname.startsWith('/knowledge/')
  );
  const hasThoughts = thoughtItems.length > 0;
  // Always render on reading pages — even empty, show a thin hint strip.
  // This restores the unified view's "always see your notes" advantage.
  const shouldRender = isReadingPage;

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
        at: Date.now(),
      });
    },
    [append],
  );

  if (!mounted) return null;
  // Hide when a learning overlay occupies the right side
  if (overlayOpen && !active) return null;

  // Empty state: thin strip (~40px). With thoughts: full narrow width.
  const narrowWidth = hasThoughts ? 'clamp(240px, 20vw, 320px)' : '40px';
  const wideWidth = 'min(440px, 40vw)';

  // Empty: no captures on this doc. Show thin hint strip.
  // Also hide when an overlay is open (it takes the right side).
  if (thoughtItems.length === 0 && !active) {
    // Render nothing when there are no captures — no visual noise
    return null;
  }

  return (
    <aside
      className="loom-thought-map"
      style={{
        position: 'fixed',
        left: active
          ? 'auto'
          : 'calc(50vw + (var(--stage-width) / 2) + 28px)',
        right: active ? '24px' : 'auto',
        top: '4rem',
        width: active ? wideWidth : narrowWidth,
        maxHeight: 'calc(100vh - 6rem)',
        overflowY: 'auto',
        zIndex: 76,
        pointerEvents: visible ? 'auto' : 'none',
        // Narrow mode: visible but peripheral. Wide mode: fully present.
        opacity: visible ? (active ? 1 : 0.46) : 0,
        transform: visible ? 'translateX(0)' : 'translateX(6px)',
        transition:
          'opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1), transform 0.4s cubic-bezier(0.22, 1, 0.36, 1), width 0.4s cubic-bezier(0.22, 1, 0.36, 1), left 0.4s cubic-bezier(0.22, 1, 0.36, 1), right 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {active && (
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
        </div>
      )}

      {active ? (
        <WideThoughtList
          thoughts={thoughtItems}
          expandedKey={expandedKey}
          onExpand={setExpandedKey}
          onAppendVersion={handleAppendVersion}
          activeAnchorId={activeAnchorId}
        />
      ) : (
        <NarrowSectionTOC
          nodes={nodes}
          activeAnchorId={activeAnchorId}
          activeBtnRef={activeBtnRef}
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
}: {
  nodes: ThoughtMapNode[];
  activeAnchorId: string;
  activeBtnRef: React.MutableRefObject<HTMLButtonElement | null>;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        borderLeft: '0.5px solid var(--mat-border)',
        paddingLeft: '0.72rem',
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
}: {
  thoughts: ThoughtAnchorView[];
  expandedKey: string | null;
  onExpand: (key: string | null) => void;
  onAppendVersion: (thought: ThoughtAnchorView, content: string) => Promise<void>;
  activeAnchorId: string;
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

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
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

function WideThoughtCard({
  thought,
  expanded,
  emphasized,
  onToggle,
  onAppendVersion,
}: {
  thought: ThoughtAnchorView;
  expanded: boolean;
  emphasized: boolean;
  onToggle: () => void;
  onAppendVersion: (thought: ThoughtAnchorView, content: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const hasContent = Boolean(thought.content.trim() || thought.summary.trim());

  return (
    <div
      ref={cardRef}
      style={{
        borderRadius: 12,
        border: '0.5px solid var(--mat-border)',
        background: emphasized
          ? 'color-mix(in srgb, var(--accent) 4%, var(--bg-elevated))'
          : 'var(--bg-elevated)',
        padding: '10px 13px 11px',
        transition:
          'border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease',
        borderColor: emphasized
          ? 'color-mix(in srgb, var(--accent) 26%, var(--mat-border))'
          : expanded
          ? 'color-mix(in srgb, var(--accent) 18%, var(--mat-border))'
          : 'var(--mat-border)',
        boxShadow: emphasized
          ? '0 6px 18px color-mix(in srgb, var(--accent) 8%, rgba(0,0,0,0.07))'
          : expanded ? '0 3px 10px rgba(0,0,0,0.05)' : 'none',
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
            color: hasContent ? 'var(--accent)' : 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontWeight: 700,
          }}
        >
          ◆ {hasContent ? 'woven' : 'captured'}
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

      {/* Content — latest version */}
      {hasContent ? (
        <div
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
            cursor: 'text',
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
      {expanded && (
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
              border: '0.5px solid var(--mat-border)',
              borderRadius: 8,
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
      )}
    </div>
  );
}
