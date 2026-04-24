'use client';
/**
 * First-run soft prompt: shown at the top of user-work surfaces (Home, Today,
 * Browse, Knowledge) when no Anthropic API key is configured. Hidden once the
 * user sets a key in Settings, or dismisses the banner.
 *
 * Per the "Learn, Don't Organize" north star and Focus Discipline memory, this
 * is a soft prompt, not a hard gate — the reading loop works without AI, so
 * the banner never blocks primary work. It only nudges. Dismissal persists per
 * session (sessionStorage) so it doesn't re-appear every navigation.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isNativeMode } from '../lib/is-native-mode';

const DISMISS_KEY = 'loom:ai-key-banner-dismissed';

function isReadingPath(pathname: string) {
  return (
    pathname.startsWith('/wiki/') ||
    pathname.startsWith('/knowledge/') ||
    pathname.startsWith('/uploads/')
  );
}

export function AiKeyMissingBanner() {
  const pathname = usePathname() ?? '/';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    // Native shell handles provider + key setup via FirstRunProviderSheet
    // and AIProviderSettingsView; the banner becomes redundant chrome there
    // and `/api/ai-key-status` doesn't exist under static export anyway.
    if (isNativeMode()) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/ai-key-status', { cache: 'no-store' });
        if (!res.ok) return;
        const payload = (await res.json()) as { anthropic?: string };
        if (!cancelled && payload.anthropic === 'unset') {
          setVisible(true);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // Don't show on pure reading surfaces — those are focus mode; the banner
  // would be chrome on top of chrome-free pages.
  if (!visible || isReadingPath(pathname)) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch {}
    setVisible(false);
  };

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        padding: '0.55rem var(--space-5)',
        fontSize: 'var(--fs-small)',
        color: 'var(--fg-secondary)',
        background: 'color-mix(in srgb, var(--accent-soft) 18%, var(--mat-thin-bg))',
        borderBottom: '0.5px solid color-mix(in srgb, var(--accent) 24%, var(--mat-border))',
      }}
    >
      <span aria-hidden style={{ fontSize: 'var(--fs-body)' }}>✦</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        Add your Anthropic API key in Settings (<kbd style={kbdStyle}>⌘</kbd><kbd style={kbdStyle}>,</kbd>) to enable AI features. Reading and anchoring work without it.
      </span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          border: 0,
          background: 'transparent',
          color: 'var(--muted)',
          cursor: 'pointer',
          padding: '2px 6px',
          fontSize: 'var(--fs-small)',
          borderRadius: 'var(--r-1)',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '1px 5px',
  margin: '0 1px',
  fontFamily: 'var(--mono)',
  fontSize: 'var(--fs-caption)',
  border: '0.5px solid var(--mat-border)',
  borderRadius: 4,
  background: 'var(--mat-thin-bg)',
};
