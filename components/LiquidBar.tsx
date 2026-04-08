'use client';
/**
 * Liquid AI Bar — always-visible Spotlight-style chat input at bottom-center.
 *
 * Default state: faint glass pill, ~440px wide, "Ask anything" placeholder.
 *   - Hover → fully visible.
 *   - Click or focus → expands to 640px, focused input.
 *   - Type and press ⏎ → opens the ChatPanel drawer with the text pre-filled
 *     and auto-sent. Drawer takes over the conversation from there.
 *   - ⌘K still owns search; ⌘L still toggles the chat panel.
 *
 * The actual chat lives in ChatPanel — this bar is the entry point.
 */
import { useEffect, useRef, useState } from 'react';
import { emitChatToggle } from './FloatingDock';

const LIQUID_OPEN_EVENT = 'wiki:liquid:send';

export function emitLiquidSend(text: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LIQUID_OPEN_EVENT, { detail: { text } }));
  }
}

export function LiquidBar() {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const [hideInReading, setHideInReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Watch reading-mode body class
  useEffect(() => {
    const check = () => setHideInReading(document.body.classList.contains('reading-mode'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Open ChatPanel directly with no text
  const openPanel = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('wiki:chat:toggle'));
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    emitLiquidSend(text);
    setDraft('');
    setFocused(false);
    inputRef.current?.blur();
  };

  if (hideInReading) return null;

  // Always visible — opacity 1; just expands when focused
  return (
    <div
      style={{
        position: 'fixed', bottom: 18, left: '50%',
        transform: `translateX(-50%)`,
        zIndex: 46,
        width: focused ? 'min(680px, calc(100vw - 80px))' : 'min(480px, calc(100vw - 80px))',
        transition: 'width 0.32s var(--ease-spring)',
      }}
    >
      <div
        className="glass"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0.65rem 0.95rem 0.65rem 1.1rem',
          borderRadius: 999,
          boxShadow: focused ? 'var(--shadow-3)' : 'var(--shadow-2)',
          border: '0.5px solid ' + (focused ? 'var(--accent)' : 'var(--border-strong)'),
          transition: 'all 0.25s var(--ease)',
        }}
      >
        <span style={{
          color: focused ? 'var(--accent)' : 'var(--accent)',
          fontSize: '1.05rem', flexShrink: 0,
          transition: 'color 0.2s var(--ease)',
          fontWeight: 600,
        }}>✦</span>
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 100)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            } else if (e.key === 'Escape') {
              setDraft('');
              inputRef.current?.blur();
            }
          }}
          placeholder="Ask Claude anything…"
          style={{
            flex: 1, border: 0, background: 'transparent',
            color: 'var(--fg)',
            fontSize: '0.92rem', fontFamily: 'var(--display)',
            outline: 'none',
            letterSpacing: '-0.005em',
          }}
        />
        {draft.trim() ? (
          <button
            onClick={send}
            aria-label="Send"
            style={{
              background: 'var(--accent)', color: '#fff',
              border: 0, borderRadius: '50%',
              width: 28, height: 28, cursor: 'pointer',
              fontSize: '0.82rem', lineHeight: 1,
              flexShrink: 0,
              boxShadow: 'var(--shadow-1)',
            }}
          >↑</button>
        ) : (
          <button
            onClick={openPanel}
            aria-label="Open chat panel"
            title="Open full chat (⌘L)"
            style={{
              background: 'transparent', border: 0, cursor: 'pointer',
              color: 'var(--muted)', fontSize: '0.7rem',
              padding: '4px 8px', borderRadius: 999,
              flexShrink: 0,
              fontWeight: 600,
            }}
          >⌘L</button>
        )}
      </div>
    </div>
  );
}
