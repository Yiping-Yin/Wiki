'use client';
/**
 * QuickSticky · ⌘J · the post-it note
 *
 * Press ⌘J on any document page → a tiny input appears at the current
 * scroll position in the margin. Type a thought, press Enter → saved
 * as a lightweight sticky event in the trace. Esc to cancel.
 *
 * §1: appears only when summoned. Disappears after commit.
 * §16: 2 steps — ⌘J → type → Enter. Done.
 * §④: faster than grabbing a post-it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { useAppendEvent } from '../lib/trace';
import { ensureReadingTrace } from '../lib/trace/source-bound';

export function QuickSticky() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const [active, setActive] = useState(false);
  const [value, setValue] = useState('');
  const [top, setTop] = useState(300);
  const inputRef = useRef<HTMLInputElement>(null);
  const append = useAppendEvent();

  const activate = useCallback(() => {
    if (ctx.isFree) return; // only on document pages
    setTop(window.scrollY + window.innerHeight * 0.4);
    setActive(true);
    setValue('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [ctx.isFree]);

  const commit = useCallback(async () => {
    const text = value.trim();
    if (!text) { setActive(false); return; }
    const trace = await ensureReadingTrace({
      docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle,
    });
    await append(trace.id, {
      kind: 'sticky',
      text,
      scrollY: top,
      at: Date.now(),
    });
    setActive(false);
    setValue('');
  }, [value, ctx, top, append]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        activate();
      }
    };
    window.addEventListener('keydown', onKey);

    // Listen for native macOS app shortcut
    const onNative = () => activate();
    window.addEventListener('loom:quick-sticky', onNative);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('loom:quick-sticky', onNative);
    };
  }, [activate]);

  if (!active) return null;

  return (
    <div style={{
      position: 'absolute',
      top,
      right: 'max(24px, calc((100vw - 760px) / 2 - 200px))',
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
          width: 180,
          background: 'var(--bg-translucent)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          border: '0.5px solid var(--accent)',
          borderRadius: 8,
          padding: '6px 10px',
          color: 'var(--fg)',
          fontSize: '0.82rem',
          fontFamily: 'var(--display)',
          outline: 'none',
          boxShadow: 'var(--shadow-2)',
        }}
      />
    </div>
  );
}
