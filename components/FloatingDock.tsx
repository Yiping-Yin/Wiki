'use client';
/**
 * Single subtle chat-toggle button at bottom-right.
 * Default: 18% opacity. Hover/touch corner: 100%.
 * Reading mode toggle has been moved to the sidebar (no longer floats).
 * Back-to-top is in the StickyTitle bar (no longer floats).
 */
import { useEffect, useRef, useState } from 'react';

const CHAT_TOGGLE_EVENT = 'wiki:chat:toggle';

export function emitChatToggle() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_TOGGLE_EVENT));
  }
}

export function FloatingDock() {
  const [near, setNear] = useState(false);
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dx = window.innerWidth - e.clientX;
      const dy = window.innerHeight - e.clientY;
      const inZone = dx < 180 && dy < 180;
      if (inZone) {
        setNear(true);
        if (idleTimer.current) clearTimeout(idleTimer.current);
      } else if (near) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = window.setTimeout(() => setNear(false), 600);
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [near]);

  return (
    <button
      onClick={emitChatToggle}
      title="Chat (⌘L)"
      aria-label="Open chat"
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 47,
        width: 44, height: 44, borderRadius: '50%',
        background: 'var(--accent)', color: '#fff',
        border: '0.5px solid rgba(255,255,255,0.18)',
        cursor: 'pointer',
        fontSize: '1.05rem',
        boxShadow: near ? 'var(--shadow-3)' : 'var(--shadow-1)',
        opacity: near ? 1 : 0.22,
        transform: near ? 'scale(1)' : 'scale(0.92)',
        transition: 'opacity 0.32s var(--ease), transform 0.32s var(--ease-spring), box-shadow 0.32s var(--ease)',
      }}
      onMouseEnter={(e) => { setNear(true); (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = near ? 'scale(1)' : 'scale(0.92)'; }}
    >
      ✦
    </button>
  );
}
