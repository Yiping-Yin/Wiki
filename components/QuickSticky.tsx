'use client';
/**
 * QuickSticky · margin tap to note
 *
 * Click in the empty space to the right of the prose → a tiny input
 * appears at that position. Type a thought, Enter saves it.
 * Like writing in the margin of a textbook.
 *
 * §1: appears only when tapped. Disappears after commit.
 * No keyboard shortcut — the trigger is spatial.
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { useAppendEvent } from '../lib/trace';
import { ensureReadingTrace } from '../lib/trace/source-bound';

export function QuickSticky() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const [pos, setPos] = useState({ top: 0, right: 24 });
  const inputRef = useRef<HTMLInputElement>(null);
  const append = useAppendEvent();

  const commit = async () => {
    const text = value.trim();
    if (!text || ctx.isFree) { setActive(false); return; }
    const trace = await ensureReadingTrace({
      docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle,
    });
    await append(trace.id, {
      kind: 'sticky',
      text,
      scrollY: pos.top - window.scrollY,
      at: Date.now(),
    });
    setActive(false);
    setValue('');
  };

  useEffect(() => {
    if (ctx.isFree) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const main = document.querySelector('main');
      if (!main || !main.contains(target)) return;

      // Don't trigger on interactive elements or content
      if (target.closest('a, button, input, textarea, select, [contenteditable], .prose-notion, .sidebar, .loom-pdf-frame, [data-loom-system], mark')) return;

      // Don't trigger during text selection
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;

      // Only in the right margin
      const prose = main.querySelector('.prose-notion');
      if (!prose) return;
      const proseRect = prose.getBoundingClientRect();
      if (e.clientX <= proseRect.right + 10) return;

      e.preventDefault();
      setPos({
        top: e.clientY + window.scrollY,
        right: Math.max(24, window.innerWidth - e.clientX + 10),
      });
      setActive(true);
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [ctx.isFree]);

  if (!active) return null;

  return (
    <div style={{
      position: 'absolute',
      top: pos.top,
      right: pos.right,
      zIndex: 80,
      animation: 'lpFade 0.14s var(--ease)',
    }}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setActive(false); setValue(''); }
        }}
        onBlur={() => { if (!value.trim()) setActive(false); }}
        placeholder="note…"
        style={{
          width: 160,
          background: 'var(--bg-translucent)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          border: '0.5px solid var(--accent)',
          borderRadius: 8,
          padding: '5px 9px',
          color: 'var(--fg)',
          fontSize: '0.78rem',
          fontFamily: 'var(--display)',
          outline: 'none',
          boxShadow: 'var(--shadow-2)',
        }}
      />
    </div>
  );
}
