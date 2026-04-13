'use client';
/**
 * AnchorDot · §38 · the ◆ mark in the margin
 *
 * Hover previews. Click pins. In review mode, the centered Review Sheet
 * becomes the primary surface instead of exploding all notes at once.
 */
import { useEffect, useRef, useState } from 'react';
import { useSmallScreen } from '../lib/use-small-screen';
import { AnchorCard } from './AnchorCard';

export type AnchorDotProps = {
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
  summary: string;
  content: string;
  quote?: string;
  at: number;
  clusterIndex?: number;
  clusterCount?: number;
};

const CLOSE_DELAY_MS = 140;
const STAGE_SELECTOR = 'main .doc-stage';
const VIEWPORT_VISIBILITY_MARGIN = 40;
const TOP_COLLAPSE_RATIO = 0.08;
const NOTE_ENGAGED_MS = 1800;
const PIN_EVENT = 'loom:anchor:pin';
const PINNED_STATE_EVENT = 'loom:anchor:pinned-state';

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

function locateAnchorEl(anchorId: string, anchorBlockId?: string, anchorBlockText?: string): HTMLElement | null {
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

export function AnchorDot({ anchorId, anchorBlockId, anchorBlockText, anchorOffsetPx, rangeStartId, rangeStartText, rangeEndId, rangeEndText, summary, content, quote, clusterIndex = 0 }: AnchorDotProps) {
  const smallScreen = useSmallScreen();
  const [pos, setPos] = useState<{ relativeTop: number; viewportTop: number; fixedRight: number; outAbove: boolean } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [globallyPinnedId, setGloballyPinnedId] = useState<string | null>(null);
  const [scrollPulse, setScrollPulse] = useState(false);
  const [cardMounted, setCardMounted] = useState(false);
  const [cardVisible, setCardVisible] = useState(false);
  const dotRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const engagedUntilRef = useRef<number>(0);

  // Scroll pulse: briefly brighten when the dot enters the viewport
  useEffect(() => {
    const el = dotRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setScrollPulse(true);
          const t = window.setTimeout(() => setScrollPulse(false), 600);
          return () => clearTimeout(t);
        }
      },
      { threshold: 0.5 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const cancelClose = () => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    cancelClose();
    if (pinned || studyMode) return;
    closeTimerRef.current = window.setTimeout(() => setPreviewOpen(false), CLOSE_DELAY_MS);
  };

  const markNoteEngaged = () => {
    engagedUntilRef.current = Date.now() + NOTE_ENGAGED_MS;
  };

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    const onStudy = (e: Event) => {
      const active = (e as CustomEvent).detail?.active ?? false;
      setStudyMode(active);
      if (active) {
        if (pinned) window.dispatchEvent(new CustomEvent(PINNED_STATE_EVENT, { detail: { anchorId: null } }));
        setPinned(false);
        setPreviewOpen(false);
        return;
      }
      if (!active && !pinned) setPreviewOpen(false);
    };
    window.addEventListener('loom:study-mode', onStudy);
    return () => window.removeEventListener('loom:study-mode', onStudy);
  }, [pinned]);

  useEffect(() => {
    const onPin = (e: Event) => {
      const id = (e as CustomEvent).detail?.anchorId as string | undefined;
      if (!id || id === anchorId) return;
      setPinned(false);
      setPreviewOpen(false);
    };
    window.addEventListener(PIN_EVENT, onPin);
    return () => window.removeEventListener(PIN_EVENT, onPin);
  }, [anchorId]);

  useEffect(() => {
    const onPinnedState = (e: Event) => {
      const id = (e as CustomEvent).detail?.anchorId as string | null | undefined;
      setGloballyPinnedId(id ?? null);
      if (id && id !== anchorId) setPreviewOpen(false);
    };
    window.addEventListener(PINNED_STATE_EVENT, onPinnedState);
    return () => window.removeEventListener(PINNED_STATE_EVENT, onPinnedState);
  }, [anchorId]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!pinned) return;
      const target = e.target as Node | null;
      if (target && (dotRef.current?.contains(target) || cardRef.current?.contains(target))) return;
      window.dispatchEvent(new CustomEvent(PINNED_STATE_EVENT, { detail: { anchorId: null } }));
      setPinned(false);
      setPreviewOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent(PINNED_STATE_EVENT, { detail: { anchorId: null } }));
        setPinned(false);
        setPreviewOpen(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  useEffect(() => {
    const locate = () => {
      const focusEl = locateAnchorEl(anchorId, anchorBlockId, anchorBlockText);
      const startEl = locateAnchorEl(rangeStartId ?? anchorId, anchorBlockId, rangeStartText ?? anchorBlockText);
      const endEl = locateAnchorEl(rangeEndId ?? anchorId, anchorBlockId, rangeEndText ?? anchorBlockText);

      if (!focusEl || !startEl || !endEl) return;

      const focusRect = focusEl.getBoundingClientRect();
      const startRect = startEl.getBoundingClientRect();
      const endRect = endEl.getBoundingClientRect();
      const stageRect = document.querySelector(STAGE_SELECTOR)?.getBoundingClientRect();
      const stageAbsTop = stageRect ? stageRect.top + window.scrollY : 0;
      const localTop = anchorOffsetPx ?? 4;
      setPos({
        relativeTop: focusRect.top + window.scrollY - stageAbsTop + localTop,
        viewportTop: focusRect.top + localTop,
        fixedRight: stageRect ? Math.max(24, window.innerWidth - stageRect.right + 24) : 24,
        outAbove: endRect.bottom < window.innerHeight * TOP_COLLAPSE_RATIO,
      });
    };

    locate();
    window.addEventListener('scroll', locate, { passive: true });
    window.addEventListener('resize', locate);
    return () => {
      window.removeEventListener('scroll', locate);
      window.removeEventListener('resize', locate);
    };
  }, [anchorId, anchorBlockId, anchorBlockText, anchorOffsetPx, rangeStartId, rangeStartText, rangeEndId, rangeEndText]);

  // Better product rule: once a note is opened, it stays solid while the
  // user is reading it. It only collapses after the anchored semantic range
  // has genuinely exited upward (the already-read region).
  useEffect(() => {
    if (!pinned || !pos) return;
    if (pos.outAbove && Date.now() > engagedUntilRef.current) {
      window.dispatchEvent(new CustomEvent(PINNED_STATE_EVENT, { detail: { anchorId: null } }));
      setPinned(false);
      setPreviewOpen(false);
      engagedUntilRef.current = 0;
    }
  }, [pinned, pos]);

  const mode = (!pos) ? null : pinned ? 'pinned' : previewOpen ? 'preview' : null;
  useEffect(() => {
    if (mode) {
      setCardMounted(true);
      const raf = requestAnimationFrame(() => setCardVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setCardVisible(false);
    const timer = window.setTimeout(() => setCardMounted(false), 200);
    return () => window.clearTimeout(timer);
  }, [mode]);

  if (!pos) return null;

  return (
    <>
      <button
        ref={dotRef}
        type="button"
        aria-label={pinned ? 'Close anchored note' : 'Open anchored note'}
        onMouseEnter={() => {
          if (smallScreen) return;
          if (globallyPinnedId && globallyPinnedId !== anchorId) return;
          cancelClose();
          if (!pinned) setPreviewOpen(true);
        }}
        onMouseLeave={smallScreen ? undefined : scheduleClose}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          cancelClose();
          // §X · Side effects OUTSIDE the setState updater.
          // Previously this was inside setPinned((v) => {...}) which caused
          // "Cannot update a component while rendering a different component"
          // in strict mode — React double-invokes updaters for detection,
          // so dispatchEvent fired twice and other AnchorDots' listeners
          // setState'd mid-render. Updaters must be pure.
          const next = !pinned;
          setPinned(next);
          if (next) {
            window.dispatchEvent(new CustomEvent(PIN_EVENT, { detail: { anchorId } }));
            window.dispatchEvent(new CustomEvent(PINNED_STATE_EVENT, { detail: { anchorId } }));
            setPreviewOpen(true);
            markNoteEngaged();
          } else {
            window.dispatchEvent(new CustomEvent(PINNED_STATE_EVENT, { detail: { anchorId: null } }));
            setPreviewOpen(false);
            engagedUntilRef.current = 0;
          }
        }}
        style={{
          position: 'absolute',
          top: pos.relativeTop,
          right: 12 + clusterIndex * 10,
          width: smallScreen ? 28 : 22,
          height: smallScreen ? 28 : 22,
          borderRadius: '50%',
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          zIndex: 10,
          padding: 0,
          margin: smallScreen ? '-11px' : '-8px',
          appearance: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          aria-hidden
          style={{
            width: pinned ? 7 : previewOpen ? 6 : studyMode ? 5 : 4,
            height: pinned ? 7 : previewOpen ? 6 : studyMode ? 5 : 4,
            borderRadius: '50%',
            background: 'var(--accent)',
            opacity: pinned ? 1 : previewOpen ? 0.92 : studyMode ? 0.7 : scrollPulse ? 0.75 : 0.4,
            transition: 'width 0.18s var(--ease), height 0.18s var(--ease), opacity 0.18s var(--ease)',
            boxShadow: pinned ? '0 0 0 4px color-mix(in srgb, var(--accent) 12%, transparent)' : 'none',
          }}
        />
      </button>
      {cardMounted && (
        <div style={{
          opacity: cardVisible ? 1 : 0,
          transform: smallScreen
            ? cardVisible ? 'translateY(0)' : 'translateY(8px)'
            : cardVisible ? 'translateX(0)' : 'translateX(8px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
        }}>
          <AnchorCard
            ref={cardRef}
            mode={mode ?? 'preview'}
            docTop={pos.relativeTop}
            viewportTop={pos.viewportTop}
            fixedRight={pos.fixedRight}
            attentionOpacity={1}
            summary={summary}
            content={content}
            quote={quote}
            onClose={() => {
              window.dispatchEvent(new CustomEvent(PINNED_STATE_EVENT, { detail: { anchorId: null } }));
              setPinned(false);
              setPreviewOpen(false);
              engagedUntilRef.current = 0;
            }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onUserActivity={markNoteEngaged}
          />
        </div>
      )}
    </>
  );
}
