'use client';
import { useEffect, useState } from 'react';

export function KeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const [showTop, setShowTop] = useState(false);
  const [lastG, setLastG] = useState(0);

  useEffect(() => {
    const inField = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };

    const handler = (e: KeyboardEvent) => {
      if (inField(e)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'j': // next chapter (LLM wiki only)
          jumpAdjacent('next');
          break;
        case 'k': // previous
          jumpAdjacent('prev');
          break;
        case '?':
          setShowHelp((v) => !v);
          break;
        case 'Escape':
          setShowHelp(false);
          break;
        case 'g': {
          const now = Date.now();
          if (now - lastG < 500) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setLastG(0);
          } else setLastG(now);
          break;
        }
        case 'G':
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lastG]);

  // Owns the global shortcut help modal.
  return (
    <>
      {showHelp && (
        <div
          onClick={(e) => e.target === e.currentTarget && setShowHelp(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', zIndex: 130,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
            animation: 'lpFade 0.2s var(--ease)',
          }}
        >
          <div style={{
            background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
            borderTop: '0.5px solid var(--mat-border)',
            borderBottom: '0.5px solid var(--mat-border)',
            padding: '1.4rem 1.6rem', minWidth: 400, maxWidth: '90vw',
          }}>
            <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.1rem', fontWeight: 700 }}>Keyboard shortcuts</h2>
            <table style={{ fontSize: '0.85rem', width: '100%' }}>
              <tbody>
                {SHORTCUTS.map(([keys, desc]) => (
                  <tr key={desc}>
                    <td style={{ padding: '0.3rem 0.6rem 0.3rem 0', whiteSpace: 'nowrap' }}>
                      {keys.split(' ').map((k, i) => (
                        <kbd key={i} style={{
                          display: 'inline-block', minWidth: 18, padding: '1px 0',
                          margin: '0 2px',
                          background: 'transparent', border: 0,
                          borderBottom: '0.5px solid var(--mat-border)',
                          fontFamily: 'var(--mono)', fontSize: '0.78em',
                        }}>{k}</kbd>
                      ))}
                    </td>
                    <td style={{ padding: '0.3rem 0', color: 'var(--muted)' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button
                onClick={() => setShowHelp(false)}
                style={{
                  background: 'transparent', border: 0,
                  borderBottom: '0.5px solid var(--mat-border)',
                  padding: '0.35rem 0', cursor: 'pointer', color: 'var(--fg-secondary)',
                  fontSize: '0.85rem',
                }}
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const SHORTCUTS: [string, string][] = [
  ['⌘ K', 'Search'],
  ['⌘ /', 'Review current document'],
  ['j', 'Next chapter (LLM wiki)'],
  ['k', 'Previous chapter'],
  ['g g', 'Back to top'],
  ['G', 'Jump to bottom'],
  ['?', 'Toggle this help'],
  ['Esc', 'Close dialogs'],
];

function jumpAdjacent(dir: 'next' | 'prev') {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
  // Look for visible PrevNext links rendered at the bottom of chapters
  const target = links.find((a) => {
    const txt = a.textContent ?? '';
    if (dir === 'next' && /next/i.test(txt) && /→|›/.test(txt)) return true;
    if (dir === 'prev' && /prev/i.test(txt) && /←|‹/.test(txt)) return true;
    return false;
  });
  if (target) target.click();
}
