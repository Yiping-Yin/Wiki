'use client';
/**
 * FirstTimeHint · shows a subtle bottom bar on first visit to a doc page.
 *
 * "click warp → ask · ⌘⇧A capture · ⌘/ review"
 *
 * Appears for 4 seconds, then fades out. Only shows once per session
 * (sessionStorage flag). Zero cognitive footprint after first sight —
 * it's a whisper, not a tutorial.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const SEEN_KEY = 'loom:hint:seen';

export function FirstTimeHint() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const pathname = usePathname();

  const isReadingPage =
    pathname.startsWith('/wiki/') || pathname.startsWith('/knowledge/');

  useEffect(() => {
    if (!isReadingPage) return;
    const seen = sessionStorage.getItem(SEEN_KEY);
    if (seen) return;

    // Show after a brief delay (let page render first)
    const showTimer = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem(SEEN_KEY, '1');
    }, 800);

    // Start fading after 4 seconds
    const fadeTimer = setTimeout(() => setFading(true), 4800);

    // Remove after fade completes
    const hideTimer = setTimeout(() => setVisible(false), 5500);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, [isReadingPage]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 800,
        padding: '6px 16px',
        fontSize: '0.72rem',
        fontFamily: 'var(--mono)',
        color: 'var(--muted)',
        background: 'var(--bg-elevated)',
        border: '0.5px solid var(--mat-border)',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        opacity: fading ? 0 : 0.8,
        transition: 'opacity 0.7s ease',
        pointerEvents: 'none',
      }}
    >
      {'select text · click warp ask · '}
      <kbd style={{ padding: '1px 4px', background: 'var(--bg)', border: '0.5px solid var(--mat-border)', borderRadius: 3, fontSize: '0.68rem' }}>⌘⇧A</kbd>
      {' capture · '}
      <kbd style={{ padding: '1px 4px', background: 'var(--bg)', border: '0.5px solid var(--mat-border)', borderRadius: 3, fontSize: '0.68rem' }}>⌘/</kbd>
      {' review'}
    </div>
  );
}
