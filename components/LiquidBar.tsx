'use client';
/**
 * Three-state Liquid AI Bar:
 *   • idle    — tiny ✦ glow circle (32px), nearly invisible
 *   • peeked  — "Ask Claude…" pill (~360px), fades in on bottom-center hover
 *   • focused — full input bar (~640px), expands on click/focus
 *
 * Hidden in reading mode.
 */
import { useEffect, useRef, useState } from 'react';

const LIQUID_OPEN_EVENT = 'wiki:liquid:send';

export function emitLiquidSend(text: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LIQUID_OPEN_EVENT, { detail: { text } }));
  }
}

type State = 'idle' | 'peeked' | 'focused';

export function LiquidBar() {
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<State>('idle');
  const [hideInReading, setHideInReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const check = () => setHideInReading(document.body.classList.contains('reading-mode'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dyBottom = window.innerHeight - e.clientY;
      const cx = window.innerWidth / 2;
      const dx = Math.abs(e.clientX - cx);
      const inZone = dyBottom < 110 && dx < 280;
      setState((cur) => {
        if (cur === 'focused') return 'focused';
        if (inZone) {
          if (idleTimer.current) clearTimeout(idleTimer.current);
          return 'peeked';
        }
        if (cur === 'peeked') {
          if (idleTimer.current) clearTimeout(idleTimer.current);
          idleTimer.current = window.setTimeout(() => setState('idle'), 700);
        }
        return cur;
      });
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    emitLiquidSend(text);
    setDraft('');
    setState('idle');
    inputRef.current?.blur();
  };

  if (hideInReading) return null;

  const isIdle = state === 'idle';
  const isFocused = state === 'focused';

  const expand = () => {
    if (state !== 'focused') {
      setState('focused');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  return (
    <div
      onClick={expand}
      style={{
        position: 'fixed', bottom: 20, left: '50%',
        transform: `translateX(-50%)`,
        zIndex: 46,
        width: isFocused ? 'min(640px, calc(100vw - 80px))'
            : isIdle ? 36
            : 'min(360px, calc(100vw - 80px))',
        height: isIdle ? 36 : 'auto',
        cursor: isFocused ? 'default' : 'pointer',
        transition: 'width 0.32s var(--ease-spring), height 0.32s var(--ease-spring)',
      }}
    >
      <div
        className="glass"
        style={{
          display: 'flex', alignItems: 'center',
          gap: isIdle ? 0 : 10,
          padding: isIdle ? 0 : '0.55rem 0.9rem 0.55rem 1rem',
          borderRadius: 999,
          width: '100%', height: isIdle ? 36 : 'auto',
          justifyContent: isIdle ? 'center' : 'flex-start',
          boxShadow: isFocused ? 'var(--shadow-3)' : isIdle ? 'var(--shadow-1)' : 'var(--shadow-2)',
          border: '0.5px solid ' + (isFocused ? 'var(--accent)' : 'var(--border)'),
          opacity: isIdle ? 0.42 : 1,
          transition: 'all 0.32s var(--ease)',
        }}
      >
        <span style={{
          color: 'var(--accent)',
          fontSize: isIdle ? '0.85rem' : '1rem',
          flexShrink: 0,
          fontWeight: 600,
          transition: 'font-size 0.2s var(--ease)',
        }}>✦</span>
        {!isIdle && (
          <>
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setState('focused')}
              onBlur={() => setTimeout(() => {
                if (!draft.trim()) setState('idle');
              }, 150)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                } else if (e.key === 'Escape') {
                  setDraft('');
                  inputRef.current?.blur();
                }
              }}
              placeholder={isFocused ? 'Type to ask…' : 'Ask Claude anything'}
              style={{
                flex: 1, border: 0, background: 'transparent',
                color: 'var(--fg)',
                fontSize: '0.86rem', fontFamily: 'var(--display)',
                outline: 'none',
                letterSpacing: '-0.005em',
                minWidth: 0,
              }}
            />
            {draft.trim() ? (
              <button
                onClick={(e) => { e.stopPropagation(); send(); }}
                aria-label="Send"
                style={{
                  background: 'var(--accent)', color: '#fff',
                  border: 0, borderRadius: '50%',
                  width: 24, height: 24, cursor: 'pointer',
                  fontSize: '0.72rem', lineHeight: 1,
                  flexShrink: 0,
                  boxShadow: 'var(--shadow-1)',
                }}
              >↑</button>
            ) : (
              <span style={{
                fontSize: '0.65rem', color: 'var(--muted)',
                flexShrink: 0, fontWeight: 600,
                fontFamily: 'var(--mono)',
              }}>⌘L</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
