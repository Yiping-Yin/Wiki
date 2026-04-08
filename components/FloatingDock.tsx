'use client';
/**
 * Auto-hide floating action dock at bottom-right.
 *
 * Three buttons stacked vertically: chat / reading mode / back to top.
 * Default state: very faint dot — only the chat button shows at 12% opacity.
 * On mouse approach (within 200px) or touch the corner: full opacity, all
 * three buttons appear with stagger.
 *
 * The chat panel state is held in window event bus so we don't need a parent.
 */
import { useEffect, useRef, useState } from 'react';
import { useReadingMode } from './ReadingMode';

const CHAT_TOGGLE_EVENT = 'wiki:chat:toggle';

export function emitChatToggle() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHAT_TOGGLE_EVENT));
  }
}

export function FloatingDock() {
  const [near, setNear] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [readingOn, toggleReading] = useReadingMode();
  const idleTimer = useRef<number | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const dx = window.innerWidth - e.clientX;
      const dy = window.innerHeight - e.clientY;
      const inZone = dx < 200 && dy < 250;
      if (inZone) {
        setNear(true);
        if (idleTimer.current) clearTimeout(idleTimer.current);
      } else if (near) {
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = window.setTimeout(() => setNear(false), 800);
      }
    };
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [near]);

  // While reading, never auto-show — only show when mouse really enters
  const shouldShow = near;

  const buttons: { key: string; icon: string; title: string; onClick: () => void; primary?: boolean }[] = [];

  if (showTop) {
    buttons.push({
      key: 'top', icon: '↑', title: 'Back to top (g g)',
      onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    });
  }
  buttons.push({
    key: 'reading', icon: readingOn ? '📖' : '◉',
    title: readingOn ? 'Exit reading mode (R)' : 'Reading mode (R)',
    onClick: toggleReading,
  });
  buttons.push({
    key: 'chat', icon: '✦', title: 'Chat (⌘L)',
    onClick: emitChatToggle, primary: true,
  });

  return (
    <div
      style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 47,
        display: 'flex', flexDirection: 'column', gap: 10,
        alignItems: 'flex-end', pointerEvents: 'none',
      }}
    >
      {buttons.map((b, i) => (
        <button
          key={b.key}
          onClick={b.onClick}
          title={b.title}
          aria-label={b.title}
          className="dock-fab"
          style={{
            width: b.primary ? 52 : 44, height: b.primary ? 52 : 44,
            borderRadius: '50%',
            background: b.primary ? 'var(--accent)' : 'rgba(255,255,255,0.92)',
            color: b.primary ? '#fff' : 'var(--fg)',
            border: '0.5px solid rgba(0,0,0,0.08)',
            cursor: 'pointer',
            fontSize: b.primary ? '1.35rem' : '1.05rem',
            boxShadow: 'var(--shadow-2)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            opacity: shouldShow ? 1 : (b.primary ? 0.18 : 0),
            transform: shouldShow ? 'translateX(0) scale(1)' : `translateX(${b.primary ? 0 : 12}px) scale(${b.primary ? 1 : 0.85})`,
            pointerEvents: shouldShow || b.primary ? 'auto' : 'none',
            transition: `opacity 0.28s var(--ease) ${i * 30}ms, transform 0.28s var(--ease-spring) ${i * 30}ms`,
          }}
        >{b.icon}</button>
      ))}
    </div>
  );
}
