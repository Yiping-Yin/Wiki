'use client';
/**
 * SourceCorrectTrigger · keyboard entry for Source Correct.
 *
 * Watches for ⌘⇧. (Cmd-Shift-Period) while the user has a text selection
 * inside `.loom-source-prose`. On match, it opens `SourceCorrectModal` with
 * the selection as the "before" string and 20 chars of surrounding context
 * for disambiguation.
 *
 * Design choice: keyboard-only trigger (no floating button on selection).
 * A popup toolbar during reading would violate Loom's reading-focus rule —
 * typos are rare, a shortcut plus `?` help-overlay entry is enough.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { SourceCorrectModal } from './SourceCorrectModal';
import { isNativeMode } from '../lib/is-native-mode';

const CONTEXT_PAD = 20;
const MIN_SEL = 1;

type Pending = {
  docId: string;
  before: string;
  contextBefore: string;
  contextAfter: string;
};

export function SourceCorrectTrigger() {
  const pathname = usePathname() ?? '';
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    // `/api/source-corrections` is stripped under static export and
    // there's no native write path yet. Don't claim the ⌘⇧. shortcut
    // in the shipped app — saving would 404.
    if (isNativeMode()) return;

    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key !== '.' && e.key !== '>') return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const container = range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer.closest('.loom-source-prose')
        : range.commonAncestorContainer.parentElement?.closest('.loom-source-prose');
      if (!container) return;
      const before = sel.toString();
      if (before.trim().length < MIN_SEL) return;

      const ctx = contextFromPathname(pathname);
      if (!ctx.docId.startsWith('know/')) return;

      // Extract surrounding context from the prose container's innerText so the
      // saved correction can disambiguate when `before` appears multiple times.
      const full = (container as HTMLElement).innerText ?? '';
      const idx = full.indexOf(before);
      const contextBefore = idx > 0 ? full.slice(Math.max(0, idx - CONTEXT_PAD), idx) : '';
      const contextAfter = idx >= 0
        ? full.slice(idx + before.length, idx + before.length + CONTEXT_PAD)
        : '';

      e.preventDefault();
      setPending({ docId: ctx.docId, before, contextBefore, contextAfter });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname]);

  if (!pending) return null;
  return (
    <SourceCorrectModal
      docId={pending.docId}
      before={pending.before}
      contextBefore={pending.contextBefore}
      contextAfter={pending.contextAfter}
      onClose={() => setPending(null)}
    />
  );
}
