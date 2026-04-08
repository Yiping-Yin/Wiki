'use client';
/**
 * Reading mode: hides sidebar, TOC, RAGChat, scroll progress.
 * Press `r` (outside inputs) to toggle. Persists to localStorage.
 * Visible state class: <body class="reading-mode">
 */
import { useEffect, useState, useCallback } from 'react';

const KEY = 'wiki:reading-mode';

export function ReadingMode() {
  const [on, setOn] = useState(false);

  // initial load
  useEffect(() => {
    const v = localStorage.getItem(KEY) === '1';
    setOn(v);
    document.body.classList.toggle('reading-mode', v);
  }, []);

  const toggle = useCallback(() => {
    setOn((cur) => {
      const next = !cur;
      localStorage.setItem(KEY, next ? '1' : '0');
      document.body.classList.toggle('reading-mode', next);
      return next;
    });
  }, []);

  // keyboard shortcut: r (when not in input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  return (
    <button
      onClick={toggle}
      title={on ? 'Exit reading mode (R)' : 'Reading mode (R)'}
      aria-label="Toggle reading mode"
      style={{
        position: 'fixed', top: 12, right: 12, zIndex: 95,
        width: 36, height: 36, borderRadius: '50%',
        background: on ? 'var(--accent)' : 'var(--bg)',
        color: on ? '#fff' : 'var(--fg)',
        border: '1px solid var(--border)',
        cursor: 'pointer', fontSize: '1rem',
        boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        transition: 'all 0.15s',
      }}
    >
      {on ? '×' : '◉'}
    </button>
  );
}
