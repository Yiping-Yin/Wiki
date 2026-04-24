'use client';
/**
 * ChatFocus · §37 · the Chat half of Loom's two-geometry AI
 *
 * Triggered by clicking SelectionWarp ✦ on a selection. The document
 * collapses everything except the paragraph containing the selection,
 * leaving a vertical focus tunnel: collapsed-above ▪ focus ▪ discussion ▪
 * collapsed-below. The user discusses ONE paragraph with AI in place,
 * not in a panel. The doc itself opens to make room, like a book opening
 * to a single bookmarked page.
 *
 * Geometry encodes intent: vertical opening = "this paragraph is the topic".
 *
 * Esc / scroll-away / × dismisses, the doc closes back, the user is
 * back to immersive reading. ✓ commits the discussion into one
 * anchored note, which later appears as part of the centered Live Note
 * during review mode.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import {
  ensureBlockAnchorId,
  normalizeBlockText,
  rangeTextOffsets,
  resolveBlockElement,
  stableFragmentAnchorId,
} from '../lib/passage-locator';
import { isThoughtPositionCrystallized } from '../lib/thought-containers';
import { getAiStage, getAiSurface } from '../lib/ai/stage-model';
import { formatAiRuntimeErrorMessage, resolveAiNotice } from '../lib/ai-provider-health';
import { runAiText } from '../lib/ai/runtime';
import {
  buildClarificationPasses,
  getDisplayedPassAnswer,
  getCurrentSynthesis,
  resolvePassSelection,
  resolvePinnedPassAfterTurnChange,
  shouldShowClarificationHistory,
} from '../lib/chat-focus-history';
import { resolveChatFocusLayoutMode } from '../lib/chat-focus-layout-mode';
import { computeDesktopChatFocusSpacer } from '../lib/chat-focus-spacing';
import { resolveChatFocusStage } from '../lib/chat-focus-stage';
import { buildSourceStub } from '../lib/chat-focus-source';
import { resolveClarificationViewMode, type ClarificationViewMode } from '../lib/chat-focus-view';
import { computeChatFocusPosition } from '../lib/chat-focus-layout';
import { openSettingsPanel } from '../lib/settings-panel';
import { useAiHealth } from '../lib/use-ai-health';
import { useFocusLock } from '../lib/focus-layer';
import {
  useTracesForDoc,
  useAppendEvent,
  type Trace,
} from '../lib/trace';
import { recompileSystemPrompt, commitSystemPrompt, discussionSystemPrompt } from '../lib/ai/system-prompt';
import { contextFromPathname } from '../lib/doc-context';
import { useSmallScreen } from '../lib/use-small-screen';
import { ensureReadingTrace } from '../lib/trace/source-bound';
import { getCurrentDocBody } from './DocBodyProvider';
import { WeftShuttle } from './DocViewer';
import { rootReadingTraces } from './thought-anchor-model';
import { AiInlineHint } from './unified/AiStagePrimitives';
import { ThoughtTypePicker } from './ThoughtTypePicker';
import { RelatesToPicker } from './RelatesToPicker';
import { createManualWeave, type WeaveKind } from '../lib/weave';
import { usePanel } from '../lib/panel';

const NoteRenderer = dynamic(() => import('./NoteRenderer').then((m) => m.NoteRenderer), { ssr: false });

type Anchor = {
  text: string;
  rect: { top: number; left: number; right: number; bottom: number; height: number };
  localOffsetPx?: number;
  blockId?: string;
  blockText?: string;
  charStart?: number;
  charEnd?: number;
};

type Turn = { q: string; a: string };

type ThoughtType = import('../lib/trace/types').ThoughtType;

/**
 * Infer the epistemic type of a thought from the discussion turns.
 * Heuristic based on the user's question patterns.
 */
function inferThoughtType(turns: Turn[]): ThoughtType {
  if (turns.length === 0) return 'explanation';
  const allQuestions = turns.map((t) => t.q.toLowerCase()).join(' ');

  // Objection signals
  if (/不对|错|wrong|disagree|但是|however|反驳|问题是|可是/.test(allQuestions)) return 'objection';
  // Question signals (unresolved)
  if (/为什么|why|how come|怎么回事|什么原因/.test(allQuestions) && turns.length === 1) return 'question';
  // Hypothesis signals
  if (/如果|假设|suppose|what if|是不是可以|会不会/.test(allQuestions)) return 'hypothesis';
  // Inference signals
  if (/所以|因此|说明|意味着|therefore|implies|推出/.test(allQuestions)) return 'inference';
  // Citation/quote-heavy (single short question like "解释" on a formula)
  if (turns.length === 1 && allQuestions.length < 10) return 'explanation';

  return 'explanation';
}

const MAIN_FOCUS_CLASS = 'loom-chat-focus-active';

function resolveOpenTarget(anchorId: string, anchorBlockId?: string, anchorBlockText?: string): HTMLElement | null {
  return resolveBlockElement({ anchorId, anchorBlockId, anchorBlockText });
}

function isDisplayMathBlock(el: HTMLElement) {
  return !!el.matches('p') && !!el.querySelector(':scope > .katex-display');
}

function isParagraphBlock(el: HTMLElement) {
  return el.matches('p');
}

function meaningfulChildren(proseContainer: HTMLElement) {
  return Array.from(proseContainer.children).filter((c) => {
    const el = c as HTMLElement;
    if (el.hasAttribute('data-loom-system')) return false;
    if (el.classList.contains('tag-row')) return false;
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') return false;
    return true;
  }) as HTMLElement[];
}

function deriveAnchorRange(block: HTMLElement, proseContainer: HTMLElement) {
  const children = meaningfulChildren(proseContainer);
  const idx = children.indexOf(block);
  const prev = idx > 0 ? children[idx - 1] : null;
  const next = idx >= 0 && idx < children.length - 1 ? children[idx + 1] : null;

  let rangeStartEl = block;
  let rangeEndEl = block;

  if (isDisplayMathBlock(block) && prev && isParagraphBlock(prev)) {
    rangeStartEl = prev;
  }
  if (isParagraphBlock(block) && next && isDisplayMathBlock(next)) {
    rangeEndEl = next;
  }

  return { rangeStartEl, rangeEndEl };
}

export function ChatFocus() {
  const pathname = usePathname() ?? '/';
  const clarifyStage = getAiStage('clarify-passage');
  const commitStage = getAiStage('commit-anchor');
  const selectionSurface = getAiSurface(clarifyStage.family);
  const smallScreen = useSmallScreen();
  const { availability } = useAiHealth();
  const effectiveCli = availability.effectiveCli;
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  // Focus Discipline: while ChatFocus is open, suppress page-level system
  // notices so they don't stack on the user's thinking surface.
  useFocusLock('chat-focus', anchor !== null);
  const [focusedEl, setFocusedEl] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState('');
  const [showWaitingIndicator, setShowWaitingIndicator] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [thoughtTypeOverride, setThoughtTypeOverride] = useState<ThoughtType | null>(null);
  const effectiveThoughtType: ThoughtType = thoughtTypeOverride ?? inferThoughtType(turns);
  const [relatesTo, setRelatesTo] = useState<{ panelId: string; panelTitle: string; kind: WeaveKind } | null>(null);
  /** Inline error state for AI-unreachable / streaming failure. Shown as a
   *  quiet hint in the input area (tier-3 actionable, but non-modal and
   *  self-clearing on next keystroke). Not a toast. */
  const [aiError, setAiError] = useState<string | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const activeNotice = resolveAiNotice(aiError ?? runtimeNotice ?? availability.notice);
  const activeNoticeTone = aiError ? 'error' : (runtimeNotice ? 'muted' : (availability.tone ?? 'muted'));
  const handleNoticeAction = activeNotice.action?.kind === 'open-settings'
    ? openSettingsPanel
    : null;
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 720 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rangeStartElRef = useRef<HTMLElement | null>(null);
  const rangeEndElRef = useRef<HTMLElement | null>(null);
  const restoreViewportTopRef = useRef<number | null>(null);
  const restoreScrollYRef = useRef<number | null>(null);
  const restoreRafRef = useRef<number | null>(null);
  const positionRafRef = useRef<number | null>(null);
  const spacerObserverRef = useRef<ResizeObserver | null>(null);
  const previousTurnCountRef = useRef(turns.length);

  const ctx = anchor
    ? contextFromPathname(typeof window !== 'undefined' ? window.location.pathname : '/')
    : null;
  const currentPanel = usePanel(ctx?.docId ?? null);
  const { traces, loading } = useTracesForDoc(ctx?.docId ?? null);
  const append = useAppendEvent();
  const [activeTraceId, setActiveTraceId] = useState<string | null>(null);

  // Find or create reading trace
  useEffect(() => {
    if (!anchor || !ctx || loading) return;
    if (activeTraceId && traces.find((t) => t.id === activeTraceId)) return;
    const existing = rootReadingTraces(traces)[0];
    if (existing) { setActiveTraceId(existing.id); return; }
    (async () => {
      const t = await ensureReadingTrace({ docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle });
      setActiveTraceId(t.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, ctx?.docId, loading, traces.length]);

  const activeTrace: Trace | null = traces.find((t) => t.id === activeTraceId) ?? rootReadingTraces(traces)[0] ?? null;
  const existingNotes = useMemo(
    () =>
      (activeTrace?.events ?? [])
        .filter((e): e is Extract<typeof e, { kind: 'thought-anchor' }> => e.kind === 'thought-anchor')
        .map((e) => ({ summary: e.summary, quote: e.quote })),
    [activeTrace?.events],
  );

  /**
   * §X · Prior iterations on THIS exact passage.
   *
   * If the user has thought about this same passage before (same block text
   * + overlapping char range), surface those prior iterations to the AI so
   * the new discussion builds on them instead of restarting from scratch.
   * This is the "container of versions" model made visible to the AI.
   *
   * Distinct from `existingNotes`, which lists ALL anchors in the whole doc.
   */
  const priorVersionsOnThisPassage = useMemo(() => {
    if (!anchor || !activeTrace || !focusedEl) return [];
    const currentBlockText = normalizeBlockText(focusedEl);
    if (!currentBlockText) return [];
    const cs = anchor.charStart ?? 0;
    const ce = anchor.charEnd ?? Math.max(0, anchor.text.length);

    return (activeTrace.events ?? [])
      .filter((e): e is Extract<typeof e, { kind: 'thought-anchor' }> => e.kind === 'thought-anchor')
      .filter((e) => {
        const etext = e.anchorBlockText ?? '';
        if (!etext || etext !== currentBlockText) return false;
        const ecs = e.anchorCharStart ?? -1;
        const ece = e.anchorCharEnd ?? -1;
        // Ranges [ecs, ece] and [cs, ce] overlap?
        return ecs <= ce && ece >= cs;
      })
      .sort((a, b) => a.at - b.at)
      .map((e) => ({ summary: e.summary, at: e.at }));
  }, [anchor, activeTrace, focusedEl]);

  /**
   * §X · Is the current passage inside a locally locked thought container?
   *
   * Computed at render time so the commit ✓ button can be shown as disabled
   * with a ◈ hint rather than rejecting the user's click with an alert().
   * This is the preserve-and-deepen fix for the original tier-3 alert — a
   * quiet disabled state is tier-1 silent self-heal (the user sees the lock
   * before they click, not after).
   */
  const isCurrentContainerLocked = useMemo(() => {
    if (!anchor || !activeTrace || !focusedEl) return false;
    return isThoughtPositionCrystallized(activeTrace.events, {
      anchorId: anchor.blockId,
      anchorBlockId: anchor.blockId,
      anchorBlockText: normalizeBlockText(focusedEl),
      anchorCharStart: anchor.charStart ?? 0,
      anchorCharEnd: anchor.charEnd ?? Math.max(0, anchor.text.length),
      target: ctx?.docId,
    });
  }, [anchor, activeTrace, ctx?.docId, focusedEl]);

  // Listen for activation
  const recomputePosition = useCallback(() => {
    if (!focusedEl) return;
    const proseContainer = focusedEl.closest('.loom-source-prose') as HTMLElement | null;
    if (!proseContainer) return;

    const blockRect = (rangeEndElRef.current ?? focusedEl).getBoundingClientRect();
    const proseRect = proseContainer.getBoundingClientRect();
    const proseStyle = window.getComputedStyle(proseContainer);

    setPosition(
      computeChatFocusPosition({
        blockBottom: blockRect.bottom,
        proseLeft: proseRect.left,
        proseWidth: proseRect.width,
        proseMaxWidth: proseStyle.maxWidth,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      }),
    );
  }, [focusedEl]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        text: string;
        anchorId?: string;
        anchorBlockId?: string;
        anchorBlockText?: string;
        charStart?: number;
        charEnd?: number;
        localOffsetPx?: number;
      };

      let block: HTMLElement | null = null;
      let proseContainer: HTMLElement | null = null;
      let selectionRange: Range | null = null;

      if (detail.anchorId) {
        const target = resolveOpenTarget(detail.anchorId, detail.anchorBlockId, detail.anchorBlockText);
        if (!target) return;
        proseContainer = target.closest('.loom-source-prose') as HTMLElement | null;
        if (!proseContainer) return;
        block = target;
      } else {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        selectionRange = sel.getRangeAt(0);

        // Walk up from the selection to find the direct child of
        // .prose-notion that contains it. This works for ANY element type:
        // paragraphs, headings, KaTeX math displays, code blocks, divs,
        // YouTube embeds — whatever is a top-level block in the prose.
        let node: Node | null = selectionRange.commonAncestorContainer;
        while (node && node.nodeType !== Node.ELEMENT_NODE) node = node.parentNode;
        if (!node) return;
        block = node as HTMLElement;
        proseContainer = block.closest('.loom-source-prose') as HTMLElement | null;
        if (!proseContainer) return;
        while (block && block.parentElement !== proseContainer) {
          block = block.parentElement;
          if (!block) return;
        }
      }

      if (!block || !proseContainer) return;

      ensureBlockAnchorId(block, proseContainer);
      const { rangeStartEl, rangeEndEl } = deriveAnchorRange(block, proseContainer);
      rangeStartElRef.current = rangeStartEl;
      rangeEndElRef.current = rangeEndEl;

        const rect = (block as HTMLElement).getBoundingClientRect();
        const selectionRect = detail.anchorId
          ? rect
          : window.getSelection()?.rangeCount
          ? window.getSelection()!.getRangeAt(0).getBoundingClientRect()
          : rect;
        const charOffsets = detail.anchorId
          ? {
              start: detail.charStart ?? 0,
              end: detail.charEnd ?? Math.max(detail.charStart ?? 0, detail.text.length),
            }
          : !selectionRange
            ? null
            : rangeTextOffsets(block, selectionRange);
      restoreViewportTopRef.current = rect.top;
      restoreScrollYRef.current = window.scrollY;
      setAnchor({
        text: detail.text,
        rect: {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          right: rect.right + window.scrollX,
          bottom: rect.bottom + window.scrollY,
          height: rect.height,
        },
        localOffsetPx: detail.localOffsetPx ?? Math.max(4, selectionRect.top - rect.top + 4),
        blockId: detail.anchorBlockId ?? ensureBlockAnchorId(block as HTMLElement, proseContainer),
        blockText: detail.anchorBlockText ?? normalizeBlockText(block as HTMLElement),
        charStart: charOffsets?.start,
        charEnd: charOffsets?.end,
      });
      setFocusedEl(block as HTMLElement);
      setTurns([]);
      setDraft('');
      setStreamBuf('');

      // Apply focus mode to body — CSS collapses all paragraphs
      // EXCEPT the one marked [data-loom-chat-focus]
      block.setAttribute('data-loom-chat-focus', 'true');
      document.body.classList.add(MAIN_FOCUS_CLASS);

      // Position the discussion overlay below the focused element and keep it
      // exactly aligned with the prose subject. Math/code/media selections can
      // still borrow the prose column width, but the overlay should not invent
      // a second width system of its own.
      const newRect = (rangeEndElRef.current ?? block as HTMLElement).getBoundingClientRect();
      const proseRect = (proseContainer as HTMLElement).getBoundingClientRect();
      const proseStyle = window.getComputedStyle(proseContainer as HTMLElement);
      setPosition(
        computeChatFocusPosition({
          blockBottom: newRect.bottom,
          proseLeft: proseRect.left,
          proseWidth: proseRect.width,
          proseMaxWidth: proseStyle.maxWidth,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        }),
      );

      // Clear native selection — focus mode replaces it visually
      window.getSelection()?.removeAllRanges();

      // Focus the input
      setTimeout(() => inputRef.current?.focus(), 200);
    };
    window.addEventListener('loom:chat:focus', onOpen);
    return () => window.removeEventListener('loom:chat:focus', onOpen);
  }, []);

  useEffect(() => {
    if (!anchor || !focusedEl) return;

    const schedule = () => {
      if (positionRafRef.current) cancelAnimationFrame(positionRafRef.current);
      positionRafRef.current = requestAnimationFrame(() => {
        positionRafRef.current = null;
        recomputePosition();
      });
    };

    schedule();
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('resize', schedule);
      if (positionRafRef.current) {
        cancelAnimationFrame(positionRafRef.current);
        positionRafRef.current = null;
      }
    };
  }, [anchor, focusedEl, smallScreen, recomputePosition]);

  // Esc closes
  useEffect(() => {
    if (!anchor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (streaming && abortRef.current) abortRef.current.abort();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, streaming]);

  const close = useCallback((restoreScroll = true) => {
    const restoreEl = focusedEl;
    const desiredTop = restoreViewportTopRef.current;
    const fallbackScrollY = restoreScrollYRef.current;
    if (abortRef.current) abortRef.current.abort();
    spacerObserverRef.current?.disconnect();
    spacerObserverRef.current = null;
    const spacerTarget = rangeEndElRef.current ?? focusedEl;
    if (spacerTarget) spacerTarget.style.marginBottom = '';
    if (focusedEl) focusedEl.removeAttribute('data-loom-chat-focus');
    document.body.classList.remove(MAIN_FOCUS_CLASS);
    setAnchor(null);
    setFocusedEl(null);
    setTurns([]);
    setDraft('');
    setStreamBuf('');
    setStreaming(false);
    setCommitting(false);
    setAiError(null);
    rangeStartElRef.current = null;
    rangeEndElRef.current = null;
    abortRef.current = null;
    if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
    if (restoreScroll) {
      restoreRafRef.current = requestAnimationFrame(() => {
        restoreRafRef.current = requestAnimationFrame(() => {
          if (restoreEl && desiredTop != null && document.contains(restoreEl)) {
            const delta = restoreEl.getBoundingClientRect().top - desiredTop;
            window.scrollBy(0, delta);
          } else if (fallbackScrollY != null) {
            window.scrollTo(0, fallbackScrollY);
          }
          restoreViewportTopRef.current = null;
          restoreScrollYRef.current = null;
          restoreRafRef.current = null;
        });
      });
    } else {
      restoreViewportTopRef.current = null;
      restoreScrollYRef.current = null;
    }
  }, [focusedEl]);

  // Hard cleanup on unmount / refresh / HMR so the page never gets stuck
  // in "only one block visible" mode.
  useEffect(() => {
    return () => {
      spacerObserverRef.current?.disconnect();
      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
      if (positionRafRef.current) cancelAnimationFrame(positionRafRef.current);
      document.body.classList.remove(MAIN_FOCUS_CLASS);
      document
        .querySelectorAll('[data-loom-chat-focus]')
        .forEach((el) => {
          el.removeAttribute('data-loom-chat-focus');
          (el as HTMLElement).style.marginBottom = '';
        });
    };
  }, []);

  // Route changes must always exit ChatFocus. Otherwise the body class can
  // survive onto the next page and make it look blank except for one block.
  useEffect(() => {
    if (!anchor) return;
    close(false);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking anywhere outside the focused block / discussion overlay closes
  // the mode and restores full reading immediately.
  useEffect(() => {
    if (!anchor) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (overlayRef.current?.contains(target)) return;
      if (focusedEl?.contains(target)) return;
      close();
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [anchor, focusedEl, close]);

  // If the focused node disappears from the DOM for any reason, bail out.
  useEffect(() => {
    if (!anchor || !focusedEl) return;
    if (!document.contains(focusedEl)) close();
  }, [anchor, focusedEl, close]);

  // §21 · silence-first latency mask. Stay visually quiet for a short
  // beat, then show a tiny shuttle only if the first token is still not
  // here. This keeps "ask" from looking broken on slow local CLI runs.
  useEffect(() => {
    if (!streaming || committing || streamBuf) {
      setShowWaitingIndicator(false);
      return;
    }
    const id = window.setTimeout(() => setShowWaitingIndicator(true), 600);
    return () => window.clearTimeout(id);
  }, [streaming, committing, streamBuf]);

  // Stream chat
  const streamChat = useCallback(async (
    messages: { role: 'user' | 'assistant'; content: string }[],
    context: string,
    mirrorToArtifact: boolean,
    docIdForMirror: string | null,
    stage: 'clarify-passage' | 'commit-anchor',
  ): Promise<string> => {
    let assistantBuf = '';
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      assistantBuf = await runAiText({
        stage: getAiStage(stage).id,
        messages,
        context,
        cli: effectiveCli ?? undefined,
        signal: ac.signal,
        onDelta: (_delta, full) => {
          assistantBuf = full;
          setStreamBuf(full);
          if (mirrorToArtifact && docIdForMirror) {
            window.dispatchEvent(new CustomEvent('loom:artifact:stream', {
              detail: { docId: docIdForMirror, content: full },
            }));
          }
        },
        onNotice: (notice) => setRuntimeNotice(notice),
      });
    } catch (e: any) {
      if (e.name !== 'AbortError') assistantBuf = `[error: ${e.message}]`;
    } finally {
      abortRef.current = null;
    }
    return assistantBuf;
  }, [effectiveCli]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming || !ctx || !anchor) return;
    if (!availability.canSend) {
      setAiError(availability.notice ?? 'AI unavailable — Open Settings to check provider status, then retry.');
      return;
    }
    setDraft('');
    setStreaming(true);
    setStreamBuf('');
    setAiError(null);
    setRuntimeNotice(null);

    const messages: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const t of turns) {
      messages.push({ role: 'user', content: t.q });
      messages.push({ role: 'assistant', content: t.a });
    }
    const userText = turns.length === 0
      ? `> ${anchor.text.replace(/\n/g, '\n> ')}\n\n${text}`
      : text;
    messages.push({ role: 'user', content: userText });

    const answer = await streamChat(
      messages,
      discussionSystemPrompt({
        sourceTitle: ctx.sourceTitle,
        href: ctx.href,
        sourceBody: getCurrentDocBody(),
        existingNotes,
        priorVersionsOnThisPassage,
        turnCount: turns.length,
      }),
      false,
      null,
      'clarify-passage',
    );

    setStreaming(false);
    if (answer && !answer.startsWith('[error:')) {
      setTurns((prev) => [...prev, { q: text, a: answer }]);
      setStreamBuf('');
      setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setDraft(text);
      setStreamBuf('');
      if (answer && answer.startsWith('[error:')) {
        const rawMsg = answer.slice(7, -1);
        console.error('ChatFocus AI error:', rawMsg);
        setAiError(`${formatAiRuntimeErrorMessage(rawMsg)} Press Enter to retry.`);
      } else {
        setAiError('AI returned no response. Open Settings to check provider status, then press Enter to retry.');
      }
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [draft, streaming, ctx, turns, anchor, availability, streamChat, existingNotes, priorVersionsOnThisPassage]);

  const commit = useCallback(async () => {
    if (turns.length === 0 || committing || !ctx || !anchor) return;
    // Defense-in-depth: even though the commit button is disabled when
    // isCurrentContainerLocked is true, guard the mutation path too in
    // case the button is invoked programmatically or by a keyboard shortcut.
    if (isCurrentContainerLocked) return;

    setCommitting(true);
    setStreaming(true);
    setStreamBuf('');

    const ensuredTrace = activeTrace ?? await ensureReadingTrace({
      docId: ctx.docId,
      href: ctx.href,
      sourceTitle: ctx.sourceTitle,
    });
    const traceId = activeTraceId ?? ensuredTrace.id;
    if (!activeTraceId) setActiveTraceId(ensuredTrace.id);

    for (const t of turns) {
      await append(traceId, {
        kind: 'message',
        role: 'user',
        content: t.q,
        at: Date.now(),
        quotedAnchor: {
          paragraphId: anchor.blockId,
          blockId: anchor.blockId,
          blockText: anchor.blockText,
          offsetPx: anchor.localOffsetPx,
          charStart: anchor.charStart,
          charEnd: anchor.charEnd,
          selection: anchor.text,
        },
      });
      await append(traceId, {
        kind: 'message',
        role: 'assistant',
        content: t.a,
        at: Date.now(),
      });
    }

    // §38 · Write a thought-anchor, NOT a recompile. The anchor is
    // determined by the focused element (viewport-based, deterministic).
    const transcript = turns.map((t, i) => `[scratch ${i + 1}]\nQ: ${t.q}\nA: ${t.a}`).join('\n\n');
    const organizePrompt = [
      `> ${anchor.text.replace(/\n/g, '\n> ')}`,
      ``,
      `Below is a discussion about the quote above. Organize it into:`,
      `1. A 1-2 sentence SUMMARY (the core insight)`,
      `2. A full NOTE (clean markdown, no Q&A formatting)`,
      ``,
      `Format your response as:`,
      `SUMMARY: [your summary]`,
      `---`,
      `[your full note]`,
      ``,
      transcript,
    ].join('\n');

    const answer = await streamChat(
      [{ role: 'user', content: organizePrompt }],
      commitSystemPrompt({
        sourceTitle: ctx.sourceTitle,
        href: ctx.href,
        sourceBody: getCurrentDocBody(),
      }),
      false, // don't mirror — thought-anchors render via AnchorDot, not LiveArtifact
      null,
      'commit-anchor',
    );

    setStreaming(false);
    setCommitting(false);

    if (answer && !answer.startsWith('[error:')) {
      // Parse summary + content from AI response
      const parts = answer.split(/^---$/m);
      let summary = '';
      let content = answer;
      if (parts.length >= 2) {
        const summaryLine = parts[0].replace(/^SUMMARY:\s*/i, '').trim();
        summary = summaryLine || answer.slice(0, 100);
        content = parts.slice(1).join('---').trim();
      } else {
        summary = answer.split('\n')[0].replace(/^SUMMARY:\s*/i, '').trim().slice(0, 100);
      }

      // Determine anchor from the focused element
      const proseContainer = focusedEl?.closest('.loom-source-prose') as HTMLElement | null;
      const anchorId = focusedEl && proseContainer
        ? (
            focusedEl.tagName.match(/^H[1-6]$/)
              ? ensureBlockAnchorId(focusedEl, proseContainer)
              : stableFragmentAnchorId(
                  ensureBlockAnchorId(focusedEl, proseContainer),
                  anchor.charStart ?? 0,
                  anchor.charEnd ?? Math.max(0, anchor.text.length),
                )
          )
        : focusedEl?.id ?? 'loom-block-0';
      const anchorBlockId = focusedEl && proseContainer
        ? ensureBlockAnchorId(focusedEl, proseContainer)
        : focusedEl?.id ?? 'loom-block-0';
      const anchorBlockText = normalizeBlockText(focusedEl);
      const rangeStartId = proseContainer && rangeStartElRef.current
        ? ensureBlockAnchorId(rangeStartElRef.current, proseContainer)
        : anchorId;
      const rangeStartText = normalizeBlockText(rangeStartElRef.current);
      const rangeEndId = proseContainer && rangeEndElRef.current
        ? ensureBlockAnchorId(rangeEndElRef.current, proseContainer)
        : anchorId;
      const rangeEndText = normalizeBlockText(rangeEndElRef.current);
      const anchorType: 'heading' | 'paragraph' = focusedEl?.tagName.match(/^H[1-6]$/)
        ? 'heading' : 'paragraph';

      // §X · Thought anchors are versioned containers, not atomic notes.
      // Asking again about the same passage APPENDS a new version to the
      // existing container — the aggregation layer (buildThoughtAnchorViews)
      // groups events by position into a version chain. The previous
      // implementation called removeEvents() here to enforce one-note-per-
      // passage, which killed version history. Keeping all versions is what
      // makes the Thought Map meaningful (depth = count, not just presence).
      //
      // Exception: typo fixes and small corrections to the latest version
      // are handled via direct edit (see AnchorCard), not by re-running
      // ChatFocus. Every ChatFocus commit = a new version.

      await append(traceId, {
        kind: 'thought-anchor',
        anchorType,
        anchorId,
        anchorBlockId,
        anchorBlockText,
        anchorOffsetPx: anchor.localOffsetPx ?? 4,
        anchorCharStart: anchor.charStart,
        anchorCharEnd: anchor.charEnd,
        rangeStartId,
        rangeStartText,
        rangeEndId,
        rangeEndText,
        summary,
        content,
        quote: anchor.text,
        thoughtType: effectiveThoughtType,
        attribution: 'mixed',
        at: Date.now(),
      });

      if (relatesTo && ctx) {
        try {
          await createManualWeave({
            fromPanelId: ctx.docId,
            toPanelId: relatesTo.panelId,
            fromTitle: currentPanel.panel?.title ?? ctx.sourceTitle ?? ctx.docId,
            toTitle: relatesTo.panelTitle,
            kind: relatesTo.kind,
            evidence: [{
              anchorId,
              snippet: summary || content.slice(0, 96),
              at: Date.now(),
            }],
          });
        } catch {
          // best-effort — don't block commit flow
        }
      }
    }
    close();
  }, [turns, committing, activeTrace, activeTraceId, ctx, anchor, append, streamChat, close, focusedEl, isCurrentContainerLocked, effectiveThoughtType, relatesTo, currentPanel.panel?.title]);

  const hasEditorialBody =
    turns.length > 0
    || (!!streamBuf && !committing)
    || committing
    || !!aiError
    || !!runtimeNotice
    || !availability.canSend;
  const stage = resolveChatFocusStage({
    turnCount: turns.length,
    streaming,
    committing,
    canSend: availability.canSend,
    hasNotice: !!(aiError || runtimeNotice || availability.notice),
  });
  const desktopEditorial = !smallScreen;
  const layoutMode = resolveChatFocusLayoutMode({ smallScreen, stage });
  const clarificationPasses = useMemo(() => buildClarificationPasses(turns), [turns]);
  const currentSynthesis = useMemo(() => getCurrentSynthesis(turns, streamBuf), [turns, streamBuf]);
  const sourceStub = useMemo(() => buildSourceStub(anchor?.text ?? ''), [anchor?.text]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedPassIndex, setSelectedPassIndex] = useState<number | null>(null);
  const [viewModePreference, setViewModePreference] = useState<ClarificationViewMode | null>(null);
  const waitingProviderLabel = effectiveCli === 'claude' ? 'Claude CLI' : 'Codex CLI';

  useEffect(() => {
    if (!shouldShowClarificationHistory(turns.length)) {
      setHistoryOpen(false);
      setSelectedPassIndex(null);
    }
  }, [turns.length]);

  useEffect(() => {
    setSelectedPassIndex((current) => resolvePinnedPassAfterTurnChange(current, previousTurnCountRef.current, turns.length));
    previousTurnCountRef.current = turns.length;
  }, [turns.length]);

  useEffect(() => {
    setViewModePreference(null);
  }, [anchor?.blockId, anchor?.text]);

  const viewMode = resolveClarificationViewMode(viewModePreference, hasEditorialBody);
  const showSplitLayout = stage === 'accumulate' && layoutMode === 'split';
  const showHistory = stage === 'accumulate' && shouldShowClarificationHistory(turns.length);
  const showSourceSummary = stage !== 'accumulate';

  const displayedSynthesis = getDisplayedPassAnswer(
    clarificationPasses,
    selectedPassIndex,
    currentSynthesis,
  );
  const latestQuestion = turns[turns.length - 1]?.q ?? '';

  useEffect(() => {
    const spacerTarget = rangeEndElRef.current ?? focusedEl;
    if (!focusedEl || !spacerTarget) return;

    const applySpacer = () => {
      const overlayHeight = overlayRef.current?.getBoundingClientRect().height ?? 0;
      const spacer = computeDesktopChatFocusSpacer({
        overlayHeight,
        active: hasEditorialBody,
        smallScreen,
      });
      spacerTarget.style.marginBottom = spacer > 0 ? `${spacer}px` : '';
    };

    applySpacer();

    if (typeof ResizeObserver !== 'undefined' && overlayRef.current) {
      spacerObserverRef.current?.disconnect();
      const observer = new ResizeObserver(() => applySpacer());
      observer.observe(overlayRef.current);
      spacerObserverRef.current = observer;
    }

    return () => {
      spacerObserverRef.current?.disconnect();
      spacerObserverRef.current = null;
      spacerTarget.style.marginBottom = '';
    };
  }, [focusedEl, hasEditorialBody, smallScreen, showSplitLayout, historyOpen, viewMode, draft, streamBuf, turns.length, aiError, runtimeNotice]);

  if (!anchor) return null;

  return (
    <div
      ref={overlayRef}
      style={{
        position: smallScreen ? 'fixed' : 'absolute',
        top: smallScreen ? 'auto' : position.top,
        left: smallScreen ? 12 : position.left,
        right: smallScreen ? 12 : 'auto',
        bottom: smallScreen ? 'max(12px, env(safe-area-inset-bottom, 0px) + 8px)' : 'auto',
        // 长度(横向)和主体 prose 一样宽,读作文档的延续。
        // 高度(纵向)紧凑,只够一行输入 + 回答内容。
        width: smallScreen ? 'auto' : position.width,
        maxHeight: smallScreen ? 'min(56vh, 440px)' : 'none',
        overflowY: smallScreen ? 'auto' : 'visible',
        zIndex: 60,
        opacity: 1,
        animation: 'chatFocusIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}
    >
      <div
        className="loom-chat-focus-shell"
        style={{
          position: 'relative',
          // Focus Discipline: ChatFocus must not leak the body text behind it.
          // Previously desktop-editorial mode used transparent shell, which
          // stacked ghostly body + ChatFocus + health notice in the same
          // visual region. Give it a subtle but opaque body-colored backdrop
          // so only ChatFocus speaks. smallScreen retains its frosted pane.
          background: hasEditorialBody
            ? (smallScreen
                ? 'color-mix(in srgb, var(--bg) 88%, var(--bg-elevated) 12%)'
                : 'color-mix(in srgb, var(--bg) 94%, transparent)')
            : 'color-mix(in srgb, var(--bg) 94%, transparent)',
          border: hasEditorialBody
            ? (smallScreen
                ? '0.5px solid color-mix(in srgb, var(--mat-border) 84%, transparent)'
                : 'none')
            : 'none',
          borderRadius: hasEditorialBody ? (smallScreen ? 16 : 6) : 0,
          boxShadow: hasEditorialBody
            ? (smallScreen ? 'var(--shadow-2)' : 'none')
            : 'none',
          backdropFilter: hasEditorialBody
            ? (smallScreen ? 'saturate(138%) blur(20px)' : 'saturate(120%) blur(4px)')
            : 'none',
          WebkitBackdropFilter: hasEditorialBody
            ? (smallScreen ? 'saturate(138%) blur(20px)' : 'saturate(120%) blur(4px)')
            : 'none',
          overflow: desktopEditorial ? 'visible' : 'hidden',
        }}
      >
        {hasEditorialBody ? (
          <>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 1,
            background: smallScreen
              ? 'linear-gradient(to bottom, color-mix(in srgb, var(--accent) 72%, white 28%), color-mix(in srgb, var(--accent) 54%, transparent))'
              : 'color-mix(in srgb, var(--accent) 46%, var(--mat-border))',
            opacity: smallScreen ? 0.62 : 0.46,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '0 auto 0 0',
            width: smallScreen ? 22 : 24,
            background: smallScreen
              ? 'linear-gradient(to right, color-mix(in srgb, var(--accent-soft) 38%, transparent), transparent)'
              : 'linear-gradient(to right, color-mix(in srgb, var(--accent-soft) 16%, transparent), transparent)',
            opacity: smallScreen ? 0.42 : 0.12,
            pointerEvents: 'none',
          }}
        />
        </>
        ) : null}
        <div style={{
          paddingLeft: smallScreen ? '1rem' : '1.1rem',
          paddingRight: smallScreen ? '0.95rem' : '0.1rem',
          paddingTop: hasEditorialBody ? (smallScreen ? '0.9rem' : '0.24rem') : '0',
          paddingBottom: smallScreen ? '0.9rem' : '0.18rem',
        }}>
        {hasEditorialBody ? (
        <button
          className="loom-chat-focus-close"
          onClick={() => close()}
          aria-label="Close"
          title="Esc"
          style={{
            position: 'absolute',
            top: 8,
            right: 10,
            background: 'transparent',
            border: 0,
            cursor: 'pointer',
            color: 'color-mix(in srgb, var(--muted) 82%, transparent)',
            padding: 0,
            fontSize: '0.74rem',
            lineHeight: 1,
            opacity: smallScreen ? 0.22 : 0,
            transition: 'opacity 160ms var(--ease), color 160ms var(--ease)',
          }}
        >×</button>
        ) : null}
        {hasEditorialBody ? (
          showSplitLayout ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(220px, 0.38fr) minmax(0, 0.62fr)',
                gap: 20,
                marginBottom: desktopEditorial ? '0.72rem' : '0.72rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.74rem',
                  lineHeight: 1.48,
                  color: 'var(--fg-secondary)',
                  opacity: 0.88,
                  borderRight: '0.5px solid color-mix(in srgb, var(--mat-border) 22%, transparent)',
                  paddingRight: 16,
                }}
              >
                <div className="loom-smallcaps" style={{ color: 'var(--muted)', fontFamily: 'var(--serif)', fontSize: '0.82rem', marginBottom: 8 }}>
                  Current source
                </div>
                <div style={{ fontStyle: 'normal' }}>
                  {/* Render through NoteRenderer so LaTeX ($…$ / $$…$$) that
                     we captured from KaTeX annotations displays as math
                     rather than a raw string. */}
                  <NoteRenderer source={sourceStub.full} />
                </div>
              </div>
              <div
                className="prose-notion"
                style={{
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                  fontFamily: 'var(--serif)',
                  maxWidth: 'none',
                  color: 'var(--fg)',
                }}
              >
                {displayedSynthesis ? <NoteRenderer source={displayedSynthesis} /> : null}
              </div>
            </div>
          ) : (
            <div
              style={{
                marginBottom: desktopEditorial ? '0.42rem' : '0.72rem',
                fontSize: '0.74rem',
                lineHeight: 1.45,
                color: 'var(--fg-secondary)',
                opacity: 0.86,
                borderBottom: desktopEditorial ? '0.5px solid color-mix(in srgb, var(--mat-border) 26%, transparent)' : 'none',
                paddingBottom: desktopEditorial ? '0.34rem' : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span className="loom-smallcaps" style={{ color: 'var(--muted)', fontFamily: 'var(--serif)', fontSize: '0.82rem' }}>
                  {showSourceSummary ? 'Current source' : (viewMode === 'source' ? 'Current source' : 'Current synthesis')}
                </span>
                {!showSourceSummary ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => setViewModePreference('synthesis')}
                      style={{
                        background: 'transparent',
                        border: 0,
                        padding: 0,
                        cursor: 'pointer',
                        color: viewMode === 'synthesis' ? 'var(--fg)' : 'var(--muted)',
                        fontFamily: 'var(--serif)',
                        fontStyle: 'italic',
                        fontVariant: 'small-caps',
                        textTransform: 'lowercase',
                        fontSize: '0.78rem',
                        letterSpacing: '0.06em',
                        opacity: viewMode === 'synthesis' ? 0.96 : 0.62,
                      }}
                    >
                      Synthesis
                    </button>
                    <button
                      onClick={() => setViewModePreference('source')}
                      style={{
                        background: 'transparent',
                        border: 0,
                        padding: 0,
                        cursor: 'pointer',
                        color: viewMode === 'source' ? 'var(--fg)' : 'var(--muted)',
                        fontFamily: 'var(--serif)',
                        fontStyle: 'italic',
                        fontVariant: 'small-caps',
                        textTransform: 'lowercase',
                        fontSize: '0.78rem',
                        letterSpacing: '0.06em',
                        opacity: viewMode === 'source' ? 0.96 : 0.62,
                      }}
                    >
                      Source
                    </button>
                  </div>
                ) : null}
              </div>
              <div style={{ fontStyle: showSourceSummary || viewMode === 'source' ? 'normal' : 'italic' }}>
                {/* Render through NoteRenderer — LaTeX wrapped in $…$/$$…$$
                   (emitted when user selected a KaTeX formula) should
                   display as math, not as a literal string. */}
                <NoteRenderer source={showSourceSummary
                  ? sourceStub.preview
                  : (viewMode === 'source' ? sourceStub.full : sourceStub.preview)} />
              </div>
            </div>
          )
        ) : null}
        {!showSplitLayout && viewMode === 'synthesis' && displayedSynthesis ? (
          <div
            style={{
              marginBottom: desktopEditorial ? '0.72rem' : '1.15rem',
            }}
          >
            {selectedPassIndex == null && turns.length > 1 ? (
              <div style={{
                fontSize: '0.72rem',
                fontWeight: 500,
                letterSpacing: '-0.01em',
                color: 'color-mix(in srgb, var(--accent) 70%, white 30%)',
                marginBottom: 10,
                opacity: 0.72,
              }}>— {latestQuestion}</div>
            ) : null}
            <div className="prose-notion" style={{
              fontSize: 'inherit',
              lineHeight: 'inherit',
              fontFamily: 'var(--serif)',
              padding: 0,
              maxWidth: 'none',
              color: 'var(--fg)',
              background: desktopEditorial ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 10%, transparent) 0%, transparent 100%)' : 'none',
            }}>
              <NoteRenderer source={displayedSynthesis} />
            </div>
          </div>
        ) : null}

        {/* In-flight stream */}
        {!showSplitLayout && viewMode === 'synthesis' && streaming && streamBuf && !committing && !turns.length && (
          <div className="prose-notion" style={{
            fontSize: 'inherit',
            lineHeight: 'inherit',
            fontFamily: 'var(--serif)',
            padding: 0,
            maxWidth: 'none',
            color: 'var(--fg)',
            marginBottom: desktopEditorial ? '0.72rem' : '1.15rem',
            background: desktopEditorial ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 10%, transparent) 0%, transparent 100%)' : 'none',
          }}>
            <NoteRenderer source={streamBuf} />
          </div>
        )}

        {viewMode === 'synthesis' && showHistory ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: desktopEditorial ? '0.75rem' : '0.9rem',
              color: 'var(--muted)',
              fontSize: '0.74rem',
            }}
          >
            <button
              onClick={() => setHistoryOpen((open) => !open)}
              style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                cursor: 'pointer',
                color: 'inherit',
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontVariant: 'small-caps',
                textTransform: 'lowercase',
                fontSize: 'inherit',
                letterSpacing: '0.08em',
                opacity: 0.7,
              }}
            >
              {historyOpen ? 'Hide passes' : 'Previous passes'}
            </button>
            {!historyOpen ? (
              <span style={{ opacity: 0.6 }}>
                {clarificationPasses.map((pass) => pass.label).join(' · ')}
              </span>
            ) : null}
          </div>
        ) : null}

        {historyOpen && clarificationPasses.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: smallScreen ? '1fr' : 'minmax(168px, 220px) minmax(0, 1fr)',
              gap: 12,
              marginBottom: desktopEditorial ? '0.82rem' : '1rem',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {clarificationPasses.map((pass) => {
                const active = selectedPassIndex === pass.index;
                return (
                  <button
                    key={pass.index}
                    onClick={() => setSelectedPassIndex((current) => resolvePassSelection(current, pass.index))}
                    style={{
                      textAlign: 'left',
                      background: active ? 'color-mix(in srgb, var(--accent-soft) 48%, transparent)' : 'transparent',
                      border: active ? '0.5px solid color-mix(in srgb, var(--accent) 26%, var(--mat-border))' : '0.5px solid color-mix(in srgb, var(--mat-border) 48%, transparent)',
                      borderRadius: 8,
                      padding: '0.42rem 0.55rem',
                      cursor: 'pointer',
                      color: active ? 'var(--fg)' : 'var(--fg-secondary)',
                      fontSize: '0.78rem',
                      lineHeight: 1.35,
                    }}
                  >
                    <div style={{ color: active ? 'var(--fg)' : 'var(--fg)', fontWeight: 500 }}>
                      {pass.delta}
                    </div>
                    <div style={{ marginTop: 2, color: 'var(--muted)', fontSize: '0.7rem', opacity: 0.74 }}>
                      {pass.label}
                    </div>
                  </button>
                );
              })}
            </div>
            <div
              className="prose-notion"
              style={{
                fontSize: 'inherit',
                lineHeight: 'inherit',
                fontFamily: 'var(--serif)',
                maxWidth: 'none',
                color: 'var(--fg-secondary)',
                opacity: 0.92,
              }}
            >
              <NoteRenderer source={displayedSynthesis} />
            </div>
          </div>
        ) : null}

        {committing && (
          <AiInlineHint>{commitStage.title}…</AiInlineHint>
        )}

        {/* Input — compact row with ✦ + textarea + ✓ + × all close together */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: hasEditorialBody ? 8 : 6,
          marginTop: hasEditorialBody ? (desktopEditorial ? '0.28rem' : '0.95rem') : '0.12rem',
          padding: hasEditorialBody
            ? (smallScreen ? '0.62rem 0.72rem' : '0.18rem 0 0.02rem 0')
            : (smallScreen ? '0.18rem 0.18rem 0.08rem 0.08rem' : '0.06rem 0 0.02rem 0'),
          borderTop: hasEditorialBody
            ? (smallScreen ? '0.5px solid color-mix(in srgb, var(--mat-border) 72%, transparent)' : 'none')
            : 'none',
          background: smallScreen
            ? 'color-mix(in srgb, var(--bg-translucent) 82%, transparent)'
            : hasEditorialBody
              ? 'transparent'
              : 'transparent',
          borderRadius: hasEditorialBody ? (smallScreen ? 10 : 0) : 0,
          border: hasEditorialBody ? 'none' : 'none',
        }}>
          <span style={{
            color: 'var(--accent)',
            fontSize: hasEditorialBody ? '0.72rem' : '0.62rem',
            flexShrink: 0,
            opacity: hasEditorialBody ? (smallScreen ? 0.76 : 0.34) : 0.36,
            ...(streaming ? { animation: 'loomPulse 2s ease-in-out infinite' } : {}),
          }}>✦</span>
          {streaming && !committing ? (
            <div
              style={{
                flex: 1,
                minHeight: 22,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {showWaitingIndicator ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)', fontSize: '0.72rem' }}>
                  <WeftShuttle width={56} height={12} />
                  <span>Waiting on {waitingProviderLabel}…</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <textarea
                ref={inputRef}
                className="loom-chat-focus-input"
                value={draft}
                aria-label="Ask about this passage"
                onChange={(e) => {
                  setDraft(e.target.value);
                  if (aiError) setAiError(null);
                  if (runtimeNotice) setRuntimeNotice(null);
                  const el = e.target as HTMLTextAreaElement;
                  el.style.height = 'auto';
                  el.style.height = Math.min(120, el.scrollHeight) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder={
                  turns.length > 0
                    ? 'Continue the annotation…'
                    : 'Write into this margin…'
                }
                rows={1}
                style={{
                  background: 'transparent',
                  border: 0,
                  outline: 0,
                  color: hasEditorialBody ? 'var(--fg)' : 'color-mix(in srgb, var(--fg) 88%, var(--muted))',
                  fontSize: hasEditorialBody ? (smallScreen ? '0.92rem' : '0.86rem') : '0.88rem',
                  fontFamily: 'var(--serif)',
                  letterSpacing: '-0.006em',
                  minWidth: 0,
                  resize: 'none',
                  lineHeight: hasEditorialBody ? (desktopEditorial ? 1.45 : 1.55) : 1.4,
                  minHeight: hasEditorialBody ? 22 : 20,
                  maxHeight: 120,
                  padding: 0,
                }}
              />
              {aiError && (
                <AiInlineHint
                  tone={activeNoticeTone}
                  actionLabel={activeNotice.action?.label}
                  onAction={handleNoticeAction}
                >
                  {activeNotice.message}
                </AiInlineHint>
              )}
            </div>
          )}
          {turns.length > 0 && !streaming && !committing && (
            <>
              <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 8 }}>
                <ThoughtTypePicker
                  value={effectiveThoughtType}
                  onChange={setThoughtTypeOverride}
                  disabled={isCurrentContainerLocked}
                />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 8, minWidth: 0, flex: '1 1 auto' }}>
                <RelatesToPicker
                  currentDocId={ctx?.docId ?? null}
                  value={relatesTo}
                  onChange={setRelatesTo}
                />
              </span>
              <button
                className="loom-chat-focus-commit"
                onClick={commit}
                disabled={isCurrentContainerLocked}
                aria-label={isCurrentContainerLocked ? 'Container locked · unlock with ◈ to iterate' : 'Commit anchored note'}
                    title={isCurrentContainerLocked ? '◈ This local thought is locked. Unlock it on the card to iterate.' : '✓ Commit anchored note'}
                style={{
                  background: 'transparent', border: 0,
                  cursor: isCurrentContainerLocked ? 'not-allowed' : 'pointer',
                  color: isCurrentContainerLocked ? 'var(--tint-indigo)' : 'var(--accent)',
                  padding: '0 2px',
                  fontSize: '0.84rem', lineHeight: 1, flexShrink: 0,
                  opacity: smallScreen ? (isCurrentContainerLocked ? 0.36 : 0.62) : 0.16,
                  transition: 'opacity 160ms var(--ease), color 160ms var(--ease)',
                }}
              >{isCurrentContainerLocked ? '◈' : '✓'}</button>
            </>
          )}
        </div>
      </div>
      </div>

      <style>{`
        @keyframes chatFocusIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .loom-chat-focus-input::placeholder {
          color: color-mix(in srgb, var(--muted) 82%, transparent);
          opacity: 1;
        }

        .loom-chat-focus-close:hover,
        .loom-chat-focus-close:focus-visible {
          opacity: 0.74;
          color: var(--muted);
        }

        @media (min-width: 901px) {
          .loom-chat-focus-shell:hover .loom-chat-focus-commit,
          .loom-chat-focus-shell:focus-within .loom-chat-focus-commit {
            opacity: 0.52 !important;
          }
        }
      `}</style>
    </div>
  );
}
