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
  useTracesForDoc,
  useAppendEvent,
  useRemoveEvents,
  type Trace,
} from '../lib/trace';
import { recompileSystemPrompt, commitSystemPrompt, discussionSystemPrompt } from '../lib/ai/system-prompt';
import { readAiCliPreference } from '../lib/ai-cli';
import { contextFromPathname } from '../lib/doc-context';
import { ensureReadingTrace } from '../lib/trace/source-bound';
import { getCurrentDocBody } from './DocBodyProvider';
import { rootReadingTraces } from './thought-anchor-model';

const NoteRenderer = dynamic(() => import('./NoteRenderer').then((m) => m.NoteRenderer), { ssr: false });

type Anchor = {
  text: string;
  rect: { top: number; left: number; right: number; bottom: number; height: number };
  localOffsetPx?: number;
  charStart?: number;
  charEnd?: number;
};

type Turn = { q: string; a: string };

const MAIN_FOCUS_CLASS = 'loom-chat-focus-active';

function stableFragmentAnchorId(blockId: string, charStart: number, charEnd: number) {
  return `${blockId}::frag:${Math.max(0, charStart)}-${Math.max(charStart, charEnd)}`;
}

function normalizedBlockText(el: HTMLElement | null) {
  if (!el) return '';
  return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 280);
}

function rangeTextOffsets(block: HTMLElement, range: Range) {
  let start = 0;
  let end = 0;
  try {
    const startRange = document.createRange();
    startRange.selectNodeContents(block);
    startRange.setEnd(range.startContainer, range.startOffset);
    start = startRange.toString().length;

    const endRange = document.createRange();
    endRange.selectNodeContents(block);
    endRange.setEnd(range.endContainer, range.endOffset);
    end = endRange.toString().length;
  } catch {
    const text = range.toString();
    start = 0;
    end = text.length;
  }
  return {
    start: Math.max(0, Math.min(start, end)),
    end: Math.max(start, end),
  };
}

function ensureBlockAnchorId(block: HTMLElement, proseContainer: HTMLElement) {
  if (block.id) return block.id;
  const children = Array.from(proseContainer.children).filter((c) => {
    const el = c as HTMLElement;
    if (el.hasAttribute('data-loom-system')) return false;
    if (el.classList.contains('tag-row')) return false;
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') return false;
    return true;
  });
  const index = children.indexOf(block);
  const stableId = `loom-block-${Math.max(0, index)}`;
  block.id = stableId;
  return stableId;
}

function resolveOpenTarget(anchorId: string): HTMLElement | null {
  const direct = document.getElementById(anchorId) as HTMLElement | null;
  if (direct) return direct;

  const prose = document.querySelector('main .loom-source-prose') as HTMLElement | null;
  if (!prose) return null;
  const children = meaningfulChildren(prose);
  const blockId = anchorId.includes('::frag:') ? anchorId.split('::frag:')[0] : anchorId;

  if (blockId.startsWith('loom-block-')) {
    const idx = parseInt(blockId.slice('loom-block-'.length), 10);
    return children[idx] ?? null;
  }
  if (blockId.startsWith('p-')) {
    const idx = parseInt(blockId.slice(2), 10);
    return children[idx] ?? null;
  }
  return null;
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
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [focusedEl, setFocusedEl] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamBuf, setStreamBuf] = useState('');
  const [committing, setCommitting] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 720 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const rangeStartElRef = useRef<HTMLElement | null>(null);
  const rangeEndElRef = useRef<HTMLElement | null>(null);
  const restoreViewportTopRef = useRef<number | null>(null);
  const restoreScrollYRef = useRef<number | null>(null);
  const restoreRafRef = useRef<number | null>(null);

  const ctx = anchor
    ? contextFromPathname(typeof window !== 'undefined' ? window.location.pathname : '/')
    : null;
  const { traces, loading } = useTracesForDoc(ctx?.docId ?? null);
  const append = useAppendEvent();
  const removeEvents = useRemoveEvents();
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

  // Listen for activation
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string; anchorId?: string };

      let block: HTMLElement | null = null;
      let proseContainer: HTMLElement | null = null;
      let selectionRange: Range | null = null;

      if (detail.anchorId) {
        const target = resolveOpenTarget(detail.anchorId);
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
        const charOffsets = detail.anchorId || !selectionRange ? null : rangeTextOffsets(block, selectionRange);
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
        localOffsetPx: Math.max(4, selectionRect.top - rect.top + 4),
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

      // Position the discussion overlay below the focused element, but
      // always size it to the full prose width. If the focused block is
      // a narrow display-math / code / media block, using its own width
      // would collapse the input into a tiny strip.
      const newRect = (block as HTMLElement).getBoundingClientRect();
      const proseRect = (proseContainer as HTMLElement).getBoundingClientRect();
      const stageEl = proseContainer.closest('.with-toc') as HTMLElement | null;
      const stageRect = stageEl?.getBoundingClientRect() ?? proseRect;
      setPosition({
        top: newRect.bottom + window.scrollY + 16,
        left: stageRect.left + window.scrollX,
        width: stageRect.width,
      });

      // Clear native selection — focus mode replaces it visually
      window.getSelection()?.removeAllRanges();

      // Focus the input
      setTimeout(() => inputRef.current?.focus(), 200);
    };
    window.addEventListener('loom:chat:focus', onOpen);
    return () => window.removeEventListener('loom:chat:focus', onOpen);
  }, []);

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
    if (focusedEl) focusedEl.removeAttribute('data-loom-chat-focus');
    document.body.classList.remove(MAIN_FOCUS_CLASS);
    setAnchor(null);
    setFocusedEl(null);
    setTurns([]);
    setDraft('');
    setStreamBuf('');
    setStreaming(false);
    setCommitting(false);
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
      if (restoreRafRef.current) cancelAnimationFrame(restoreRafRef.current);
      document.body.classList.remove(MAIN_FOCUS_CLASS);
      document
        .querySelectorAll('[data-loom-chat-focus]')
        .forEach((el) => el.removeAttribute('data-loom-chat-focus'));
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

  // Stream chat
  const streamChat = useCallback(async (
    messages: { role: 'user' | 'assistant'; content: string }[],
    context: string,
    mirrorToArtifact: boolean,
    docIdForMirror: string | null,
  ): Promise<string> => {
    let assistantBuf = '';
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, cli: readAiCliPreference(), context }),
        signal: ac.signal,
      });
      if (!r.ok || !r.body) throw new Error('chat failed');
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            if (json.delta) {
              assistantBuf += json.delta;
              setStreamBuf(assistantBuf);
              if (mirrorToArtifact && docIdForMirror) {
                window.dispatchEvent(new CustomEvent('loom:artifact:stream', {
                  detail: { docId: docIdForMirror, content: assistantBuf },
                }));
              }
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') assistantBuf = `[error: ${e.message}]`;
    } finally {
      abortRef.current = null;
    }
    return assistantBuf;
  }, []);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming || !ctx || !anchor) return;
    setDraft('');
    setStreaming(true);
    setStreamBuf('');

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
      }),
      false,
      null,
    );

    setStreaming(false);
    if (answer && !answer.startsWith('[error:')) {
      setTurns((prev) => [...prev, { q: text, a: answer }]);
      setStreamBuf('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [draft, streaming, ctx, turns, anchor, streamChat, existingNotes]);

  const commit = useCallback(async () => {
    if (turns.length === 0 || committing || !ctx || !anchor) return;
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
        quotedAnchor: { selection: anchor.text },
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
      const anchorBlockText = normalizedBlockText(focusedEl);
      const rangeStartId = proseContainer && rangeStartElRef.current
        ? ensureBlockAnchorId(rangeStartElRef.current, proseContainer)
        : anchorId;
      const rangeStartText = normalizedBlockText(rangeStartElRef.current);
      const rangeEndId = proseContainer && rangeEndElRef.current
        ? ensureBlockAnchorId(rangeEndElRef.current, proseContainer)
        : anchorId;
      const rangeEndText = normalizedBlockText(rangeEndElRef.current);
      const anchorType: 'heading' | 'paragraph' = focusedEl?.tagName.match(/^H[1-6]$/)
        ? 'heading' : 'paragraph';

      // One passage should have one anchored note. Asking again about the
      // same passage updates that note instead of stacking another one in
      // the same physical slot.
      await removeEvents(
        traceId,
        (e) =>
          e.kind === 'thought-anchor'
          && (
            (
              e.anchorId === anchorId
              && (e.rangeStartId ?? e.anchorId) === rangeStartId
              && (e.rangeEndId ?? e.anchorId) === rangeEndId
            )
            || (
              (e.anchorBlockText ?? '') === anchorBlockText
              && (e.anchorCharStart ?? 0) === (anchor.charStart ?? 0)
              && (e.anchorCharEnd ?? 0) === (anchor.charEnd ?? Math.max(0, anchor.text.length))
              && (e.rangeStartText ?? '') === rangeStartText
              && (e.rangeEndText ?? '') === rangeEndText
            )
          ),
      );

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
        at: Date.now(),
      });
    }
    close();
  }, [turns, committing, activeTrace, activeTraceId, ctx, anchor, append, removeEvents, streamChat, close, focusedEl]);

  if (!anchor) return null;

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        // 长度(横向)和主体 prose 一样宽,读作文档的延续。
        // 高度(纵向)紧凑,只够一行输入 + 回答内容。
        width: position.width,
        zIndex: 60,
        opacity: 1,
        animation: 'chatFocusIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}
    >
      {/* Hairline left border anchors the discussion to the doc visually,
          like a margin note bracket. Background ensures no text bleed-through. */}
      <div style={{
        borderLeft: '1px solid var(--accent)',
        paddingLeft: '1rem',
        paddingTop: '0.4rem',
        paddingBottom: '0.4rem',
        background: 'var(--bg)',
        borderRadius: '0 8px 8px 0',
      }}>
        {/* Accumulated turns */}
        {turns.map((t, i) => (
          <div key={i} style={{ marginBottom: '1rem' }}>
            <div style={{
              fontSize: '0.86rem',
              fontStyle: 'italic',
              color: 'var(--accent)',
              marginBottom: 6,
              opacity: 0.85,
            }}>— {t.q}</div>
            <div className="prose-notion" style={{
              fontSize: '0.94rem',
              lineHeight: 1.6,
              padding: 0,
              maxWidth: 'none',
              color: 'var(--fg-secondary)',
            }}>
              <NoteRenderer source={t.a} />
            </div>
          </div>
        ))}

        {/* In-flight stream */}
        {streaming && streamBuf && !committing && (
          <div className="prose-notion" style={{
            fontSize: '0.94rem',
            lineHeight: 1.6,
            padding: 0,
            maxWidth: 'none',
            color: 'var(--fg-secondary)',
            marginBottom: '1rem',
          }}>
            <NoteRenderer source={streamBuf} />
          </div>
        )}

        {committing && (
          <div style={{
            fontSize: '0.78rem',
            color: 'var(--muted)',
            fontStyle: 'italic',
            marginBottom: '0.6rem',
          }}>整理中,织成 anchored note…</div>
        )}

        {/* Input — compact row with ✦ + textarea + ✓ + × all close together */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: '0.4rem',
        }}>
          <span style={{
            color: 'var(--accent)',
            fontSize: '0.78rem',
            flexShrink: 0,
            ...(streaming ? { animation: 'loomPulse 2s ease-in-out infinite' } : {}),
          }}>✦</span>
          {streaming && !committing ? (
            <span style={{ flex: 1, minHeight: 22 }} />
          ) : (
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const el = e.target as HTMLTextAreaElement;
                el.style.height = 'auto';
                el.style.height = Math.min(120, el.scrollHeight) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              placeholder={turns.length > 0 ? 'ask another…' : 'ask about this passage…'}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 0,
                outline: 0,
                color: 'var(--fg)',
                fontSize: '0.88rem',
                fontFamily: 'var(--display)',
                letterSpacing: '-0.012em',
                minWidth: 0,
                resize: 'none',
                lineHeight: 1.5,
                minHeight: 22,
                maxHeight: 120,
                padding: 0,
              }}
            />
          )}
          {turns.length > 0 && !streaming && !committing && (
            <button
              onClick={commit}
              aria-label="Commit anchored note"
              title="✓ Commit anchored note"
              style={{
                background: 'transparent', border: 0, cursor: 'pointer',
                color: 'var(--accent)', padding: '0 2px',
                fontSize: '0.88rem', lineHeight: 1, flexShrink: 0,
                opacity: 0.7,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
            >✓</button>
          )}
          <button
            onClick={() => close()}
            aria-label="Close"
            title="Esc"
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--muted)', padding: '0 2px',
              fontSize: '0.88rem', lineHeight: 1, flexShrink: 0,
              opacity: 0.45,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.45'; }}
          >×</button>
        </div>
      </div>

      <style>{`
        @keyframes chatFocusIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
