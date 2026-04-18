'use client';
/**
 * FreeInput · the scratchpad for free-mode thinking.
 *
 * On non-document pages (home, today, patterns, etc.), the user has no source
 * passage to select. FreeInput provides the AI entry point: a single
 * textarea at the bottom of the viewport, like a terminal prompt.
 *
 * §1 · appears only on non-doc pages, only when focused or has content.
 * §3 · this IS the one AI input — same trace as GlobalLiveArtifact.
 * §17 · not a chat. No bubbles, no "AI is typing", no history.
 *       Enter sends, answer streams into the Live Note above.
 */
import { useCallback, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { formatAiRuntimeErrorMessage, resolveAiNotice } from '../lib/ai-provider-health';
import { contextFromPathname } from '../lib/doc-context';
import { recompileSystemPrompt } from '../lib/ai/system-prompt';
import { getAiStage, getAiSurface } from '../lib/ai/stage-model';
import { runAiText } from '../lib/ai/runtime';
import { openSettingsPanel } from '../lib/settings-panel';
import { useAiHealth } from '../lib/use-ai-health';
import { useSmallScreen } from '../lib/use-small-screen';
import { useTracesForDoc, useAppendEvent } from '../lib/trace';
import { ensureReadingTrace } from '../lib/trace/source-bound';
import { AiInlineHint } from './unified/AiStagePrimitives';

export function FreeInput() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const freeStage = getAiStage('free-recompile');
  const freeSurface = getAiSurface(freeStage.family);
  const smallScreen = useSmallScreen();
  const { availability } = useAiHealth(pathname === '/today');
  const [value, setValue] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { traces } = useTracesForDoc(ctx.isFree ? ctx.docId : null);
  const append = useAppendEvent();
  const activeNotice = resolveAiNotice(aiError ?? runtimeNotice ?? availability.notice);
  const activeNoticeTone = aiError ? 'error' : (runtimeNotice ? 'muted' : (availability.tone ?? 'muted'));
  const handleNoticeAction = activeNotice.action?.kind === 'open-settings'
    ? openSettingsPanel
    : null;

  // Only render on /today — the daily thinking surface.
  // Home page has HomeLoom when empty and Resume list when not;
  // neither needs a persistent input. /patterns, /about etc. are not thinking pages.
  if (!ctx.isFree || pathname !== '/today') return null;

  const send = async () => {
    const text = value.trim();
    if (!text || streaming) return;
    if (!availability.canSend) {
      setAiError(availability.notice ?? 'AI unavailable — Open Settings to check provider status, then retry.');
      return;
    }
    setValue('');
    setStreaming(true);
    setAiError(null);
    setRuntimeNotice(null);

    try {
      // Ensure a reading trace exists for today's free mode
      const trace = await ensureReadingTrace({
        docId: ctx.docId,
        href: ctx.href,
        sourceTitle: ctx.sourceTitle,
      });

      // Save the user's message to the trace
      await append(trace.id, {
        kind: 'message',
        role: 'user',
        content: text,
        at: Date.now(),
      });

      // Get the current artifact content for recompilation
      const readingTrace = traces.find((t) => t.kind === 'reading' && !t.parentId);
      const priorVersions = (readingTrace?.events ?? [])
        .filter((e): e is Extract<typeof e, { kind: 'recompile' }> => e.kind === 'recompile');
      const priorArtifact = priorVersions[priorVersions.length - 1]?.content ?? '';

      // Stream the recompiled artifact
      const ac = new AbortController();
      abortRef.current = ac;
      let buf = '';

      await runAiText({
        stage: getAiStage('free-recompile').id,
        messages: [{ role: 'user', content: text }],
        context: recompileSystemPrompt({
          sourceTitle: ctx.sourceTitle,
          href: ctx.href,
          priorArtifact,
        }),
        cli: availability.effectiveCli ?? undefined,
        signal: ac.signal,
        onDelta: (_delta, full) => {
          buf = full;
          window.dispatchEvent(new CustomEvent('loom:artifact:stream', {
            detail: { docId: ctx.docId, content: full },
          }));
        },
        onNotice: (notice) => setRuntimeNotice(notice),
      });

      // Commit the recompiled artifact
      if (buf) {
        await append(trace.id, {
          kind: 'recompile',
          content: buf,
          at: Date.now(),
        });
        await append(trace.id, {
          kind: 'message',
          role: 'assistant',
          content: buf,
          at: Date.now(),
        });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setAiError(`${formatAiRuntimeErrorMessage(e?.message ?? String(e))} Press Enter to retry.`);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const activate = () => {
    setExpanded(true);
    setTimeout(() => taRef.current?.focus(), 50);
  };

  // Collapsed: a single thin accent line at the bottom — §2 summoned, not opened
  if (!expanded && !value && !streaming) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        padding: smallScreen
          ? '0 12px max(10px, env(safe-area-inset-bottom, 0px) + 4px)'
          : '0 max(1rem, calc((100vw - 760px) / 2)) 0.8rem',
      }}>
        <div
          onClick={activate}
          style={{
            padding: '12px 0',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { const line = e.currentTarget.firstElementChild as HTMLElement; line.style.opacity = '0.8'; line.style.background = 'var(--accent)'; }}
          onMouseLeave={(e) => { const line = e.currentTarget.firstElementChild as HTMLElement; line.style.opacity = '0.5'; line.style.background = 'var(--mat-border)'; }}
        >
          <div
            style={{
              height: 1,
              borderRadius: 0.5,
              background: 'var(--mat-border)',
              opacity: 0.5,
              transition: 'opacity 0.2s var(--ease), background 0.2s var(--ease)',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      padding: smallScreen
        ? '0 12px max(12px, env(safe-area-inset-bottom, 0px) + 6px)'
        : '0 max(1rem, calc((100vw - 760px) / 2)) 1.2rem',
      pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        background: 'color-mix(in srgb, var(--bg) 94%, transparent)',
        backdropFilter: 'saturate(150%) blur(12px)',
        WebkitBackdropFilter: 'saturate(150%) blur(12px)',
        borderTop: '0.5px solid var(--mat-border)',
        borderBottom: '0.5px solid var(--mat-border)',
        borderRadius: smallScreen ? 14 : 0,
        boxShadow: smallScreen ? 'var(--shadow-1)' : 'none',
        padding: smallScreen ? '0.65rem 0.75rem' : '0.6rem 0.8rem',
        animation: 'lpFade 0.18s var(--ease)',
      }}>
        <span style={{
          color: 'var(--accent)',
          fontSize: '0.82rem',
          fontWeight: 700,
          flexShrink: 0,
          paddingBottom: 2,
          ...(streaming ? { animation: 'loomPulse 2s ease-in-out infinite' } : {}),
        }}>✦</span>
        {streaming ? (
          <span style={{
            flex: 1,
            color: 'var(--muted)',
            fontSize: '0.92rem',
            fontFamily: 'var(--display)',
            letterSpacing: '-0.012em',
            lineHeight: 1.5,
            minHeight: 24,
            display: 'flex',
            alignItems: 'center',
            userSelect: 'none',
          }} />
        ) : (
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => {
              if (runtimeNotice) setRuntimeNotice(null);
              setValue(e.target.value);
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = Math.min(120, el.scrollHeight) + 'px';
            }}
            onKeyDown={(e) => {
              if (aiError) setAiError(null);
              if (runtimeNotice) setRuntimeNotice(null);
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
              if (e.key === 'Escape' && !value) {
                setExpanded(false);
              }
            }}
            onBlur={() => { if (!value && !streaming) setExpanded(false); }}
            placeholder={freeSurface.placeholder ?? `${freeStage.title.toLowerCase()}…`}
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 0,
              outline: 0,
              color: 'var(--fg)',
              fontSize: '0.92rem',
              fontFamily: 'var(--display)',
              letterSpacing: '-0.012em',
              lineHeight: 1.5,
              minHeight: 24,
              maxHeight: 120,
              resize: 'none',
              padding: 0,
            }}
          />
        )}
      </div>
      {aiError && (
        <div style={{ padding: '0.2rem 0 0 1.2rem' }}>
          <AiInlineHint
            tone={activeNoticeTone}
            actionLabel={activeNotice.action?.label}
            onAction={handleNoticeAction}
          >
            {activeNotice.message}
          </AiInlineHint>
        </div>
      )}
      {!aiError && (runtimeNotice ?? availability.notice) ? (
        <div style={{ padding: '0.2rem 0 0 1.2rem' }}>
          <AiInlineHint
            tone={activeNoticeTone}
            actionLabel={activeNotice.action?.label}
            onAction={handleNoticeAction}
          >
            {activeNotice.message}
          </AiInlineHint>
        </div>
      ) : null}
    </div>
  );
}
