'use client';
/**
 * Reading mode: hides sidebar, TOC, scroll progress, ChatPanel.
 * Press `r` (outside inputs) to toggle. Persists to localStorage.
 * No floating button — toggle is in the FloatingDock.
 *
 * Other components subscribe via `useReadingMode()`.
 */
import { useEffect, useState, useCallback } from 'react';

const KEY = 'wiki:reading-mode';
const EVENT = 'wiki:reading-mode:changed';

export function setReadingMode(on: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, on ? '1' : '0');
  document.body.classList.toggle('reading-mode', on);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { on } }));
}

export function getReadingMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(KEY) === '1';
}

export function useReadingMode(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const v = getReadingMode();
    setOn(v);
    document.body.classList.toggle('reading-mode', v);
    const onChange = () => setOn(getReadingMode());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  const toggle = useCallback(() => setReadingMode(!getReadingMode()), []);
  return [on, toggle];
}

export function ReadingMode() {
  // Just registers the keyboard shortcut + initial body class.
  // The visible toggle lives in FloatingDock.
  const [, toggle] = useReadingMode();

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

  return null;
}
