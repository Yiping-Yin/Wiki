'use client';
/**
 * FreeInput · the scratchpad for free-mode thinking.
 *
 * On non-document pages (home, today, kesi, etc.), the user has no source
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
import { contextFromPathname } from '../lib/doc-context';
import { recompileSystemPrompt } from '../lib/ai/system-prompt';
import { readAiCliPreference } from '../lib/ai-cli';
import { useTracesForDoc, useAppendEvent } from '../lib/trace';
import { ensureReadingTrace } from '../lib/trace/source-bound';

export function FreeInput() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const [value, setValue] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { traces } = useTracesForDoc(ctx.isFree ? ctx.docId : null);
  const append = useAppendEvent();

  // Only render on /today — the daily thinking surface.
  // Home page has HomeLoom when empty and Resume list when not;
  // neither needs a persistent input. /kesi, /about etc. are not thinking pages.
  if (!ctx.isFree || pathname !== '/today') return null;

  const send = async () => {
    const text = value.trim();
    if (!text || streaming) return;
    setValue('');
    setStreaming(true);

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

      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: text }],
          cli: readAiCliPreference(),
          context: recompileSystemPrompt({
            sourceTitle: ctx.sourceTitle,
            href: ctx.href,
            priorArtifact,
          }),
        }),
        signal: ac.signal,
      });

      if (r.ok && r.body) {
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let raw = '';
        while (true) {
          const { value: chunk, done } = await reader.read();
          if (done) break;
          raw += decoder.decode(chunk, { stream: true });
          const lines = raw.split('\n');
          raw = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              if (json.delta) {
                buf += json.delta;
                // Mirror to LiveArtifact via event
                window.dispatchEvent(new CustomEvent('loom:artifact:stream', {
                  detail: { docId: ctx.docId, content: buf },
                }));
              }
            } catch {}
          }
        }
      }

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
      if (e.name !== 'AbortError') console.error(e);
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
        padding: '0 max(1rem, calc((100vw - 760px) / 2)) 0.8rem',
      }}>
        <div
          onClick={activate}
          style={{
            height: 1,
            borderRadius: 0.5,
            background: 'var(--mat-border)',
            opacity: 0.5,
            cursor: 'pointer',
            transition: 'opacity 0.2s var(--ease), background 0.2s var(--ease)',
          }}
          onMouseEnter={(e) => { const s = (e.currentTarget as HTMLElement).style; s.opacity = '0.8'; s.background = 'var(--accent)'; }}
          onMouseLeave={(e) => { const s = (e.currentTarget as HTMLElement).style; s.opacity = '0.5'; s.background = 'var(--mat-border)'; }}
        />
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
      padding: '0 max(1rem, calc((100vw - 760px) / 2)) 1.2rem',
      pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        background: 'var(--bg-translucent)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        border: '0.5px solid var(--mat-border)',
        borderRadius: 16,
        padding: '0.6rem 0.8rem',
        boxShadow: 'var(--shadow-2)',
        animation: 'lpFade 0.18s var(--ease)',
      }}>
        <span style={{
          color: 'var(--accent)',
          fontSize: '0.82rem',
          fontWeight: 700,
          flexShrink: 0,
          paddingBottom: 2,
        }}>✦</span>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            const el = e.target;
            el.style.height = 'auto';
            el.style.height = Math.min(120, el.scrollHeight) + 'px';
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
            if (e.key === 'Escape' && !value) {
              setExpanded(false);
            }
          }}
          onBlur={() => { if (!value && !streaming) setExpanded(false); }}
          placeholder="think…"
          rows={1}
          disabled={streaming}
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
            opacity: streaming ? 0.5 : 1,
          }}
        />
      </div>
    </div>
  );
}
