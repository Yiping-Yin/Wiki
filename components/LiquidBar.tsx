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
  const [near, setNear] = useState(false);
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

  // Mouse-near-bottom-center auto-show
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dyBottom = window.innerHeight - e.clientY;
      const cx = window.innerWidth / 2;
      const dx = Math.abs(e.clientX - cx);
      setNear(dyBottom < 140 && dx < 360);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    emitLiquidSend(text);
    setDraft('');
    setFocused(false);
    inputRef.current?.blur();
  };

  if (hideInReading) return null;

  const visible = focused || near || draft.length > 0;

  return (
    <div
      style={{
        position: 'fixed', bottom: 16, left: '50%',
        transform: `translateX(-50%) ${visible ? 'translateY(0)' : 'translateY(8px)'}`,
        zIndex: 46,
        width: focused ? 'min(640px, calc(100vw - 80px))' : 'min(440px, calc(100vw - 80px))',
        opacity: visible ? 1 : 0.32,
        transition: 'all 0.32s var(--ease-spring)',
      }}
    >
      <div
        className="glass"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.55rem 0.85rem 0.55rem 1rem',
          borderRadius: 999,
          boxShadow: focused ? 'var(--shadow-3)' : 'var(--shadow-2)',
          border: '0.5px solid ' + (focused ? 'var(--accent)' : 'var(--border)'),
          transition: 'all 0.25s var(--ease)',
        }}
      >
        <span style={{
          color: focused ? 'var(--accent)' : 'var(--muted)',
          fontSize: '0.95rem', flexShrink: 0,
          transition: 'color 0.2s var(--ease)',
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
          placeholder="Ask anything · ⌘L for full chat"
          style={{
            flex: 1, border: 0, background: 'transparent',
            color: 'var(--fg)',
            fontSize: '0.88rem', fontFamily: 'var(--display)',
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
              width: 26, height: 26, cursor: 'pointer',
              fontSize: '0.78rem', lineHeight: 1,
              flexShrink: 0,
              boxShadow: 'var(--shadow-1)',
            }}
          >↑</button>
        ) : (
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)', flexShrink: 0, paddingRight: 4 }}>⌘L</span>
        )}
      </div>
    </div>
  );
}
