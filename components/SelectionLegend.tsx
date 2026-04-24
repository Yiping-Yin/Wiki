'use client';
/**
 * SelectionLegend · passive discoverability aid for reading-view gestures.
 *
 * When the user has a live text selection inside `.loom-source-prose`, a thin
 * strip surfaces at the bottom of the viewport listing the three selection
 * verbs: Ask, Anchor, Highlight. It is a legend, not a toolbar — nothing is
 * clickable. Experts see it as background; newcomers learn by exposure.
 *
 * Why passive, not interactive: Loom's main content is for reading and
 * thinking, not editing. A popping toolbar would interrupt reading flow and
 * push the interaction model away from gesture-first (trackpad-native). The
 * legend teaches the existing shortcuts without replacing them.
 */

import { useEffect, useState } from 'react';

const MIN_LEN = 2;

export function SelectionLegend() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const recalc = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setVisible(false);
        return;
      }
      const range = sel.getRangeAt(0);
      const prose = (range.commonAncestorContainer as Element | null)?.parentElement?.closest?.(
        '.loom-source-prose',
      ) ?? (range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer.closest('.loom-source-prose')
        : null);
      if (!prose) {
        setVisible(false);
        return;
      }
      const text = sel.toString().trim();
      setVisible(text.length >= MIN_LEN);
    };
    document.addEventListener('selectionchange', recalc);
    return () => document.removeEventListener('selectionchange', recalc);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
        padding: '6px 12px',
        borderRadius: 'var(--r-3)',
        border: '0.5px solid var(--mat-border)',
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        color: 'var(--fg-secondary)',
        fontFamily: 'var(--mono)',
        fontSize: '0.7rem',
        letterSpacing: '0.02em',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        pointerEvents: 'none',
        zIndex: 40,
        animation: 'loom-selection-legend-fade 150ms ease-out',
      }}
    >
      <span>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>✦</span>
        <span style={{ marginLeft: 6 }}>Ask</span>
      </span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>
        <span>⌘⇧A</span>
        <span style={{ marginLeft: 6 }}>Anchor</span>
      </span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>
        <span>⌥</span>
        <span style={{ marginLeft: 6 }}>Highlight</span>
      </span>
      <span style={{ opacity: 0.4 }}>·</span>
      <span>
        <span>⌘⇧.</span>
        <span style={{ marginLeft: 6 }}>Correct</span>
      </span>
    </div>
  );
}
