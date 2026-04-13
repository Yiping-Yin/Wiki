'use client';
/**
 * KeyboardHelpOverlay · Toggled by "?" key. Shows all keyboard shortcuts.
 */
import { useEffect, useState } from 'react';

type Shortcut = { keys: string; label: string };
type Group = { title: string; items: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: 'Learning',
    items: [
      { keys: '✦ click', label: 'Ask AI about the selection' },
      { keys: '⌘⇧A', label: 'Capture selection as a thought-anchor' },
      { keys: '⌘ click', label: 'Capture directly from the warp thread' },
      { keys: '⌥ click', label: 'Highlight the selection' },
      { keys: '⌘/', label: 'Toggle thought map wide / narrow' },
    ],
  },
  {
    title: 'Tools (via ⌘P)',
    items: [
      { keys: 'Rehearsal', label: 'Write from memory · ⌘K transform · ⌘S save' },
      { keys: 'Examiner', label: 'AI tests your understanding · ⌘↩ submit' },
      { keys: 'Import', label: 'Drag-drop .md/.txt files' },
      { keys: 'Export', label: 'Download notes as JSON or Markdown' },
    ],
  },
  {
    title: 'Navigation',
    items: [
      { keys: '⌘P', label: 'Search everything (docs, tools, export)' },
      { keys: '⌘K', label: 'Search docs' },
      { keys: 'Esc', label: 'Close any open panel' },
      { keys: '?', label: 'Toggle this help' },
    ],
  },
];

export function KeyboardHelpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable);
      if (!inEditable && (e.key === '?' || (e.shiftKey && e.key === '/'))) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0,
        background: 'color-mix(in srgb, var(--bg) 85%, transparent)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40, animation: 'loom-overlay-fade-in 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420, width: '100%', maxHeight: '85vh', overflow: 'auto',
          background: 'var(--bg-elevated)', border: '0.5px solid var(--mat-border)',
          borderRadius: 16, padding: '24px 28px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.18)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingBottom: 12, borderBottom: '0.5px solid var(--mat-border)' }}>
          <strong style={{ fontSize: '0.88rem', color: 'var(--accent)' }}>Shortcuts</strong>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: '0.64rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>? toggle · Esc close</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div style={{ fontSize: '0.6rem', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}>
                {g.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {g.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: '0.78rem', lineHeight: 1.5 }}>
                    <kbd style={{ flex: '0 0 auto', padding: '2px 8px', fontSize: '0.72rem', fontFamily: 'var(--mono)', background: 'var(--bg)', border: '0.5px solid var(--mat-border)', borderRadius: 4, color: 'var(--fg)', minWidth: 70, textAlign: 'center' }}>
                      {it.keys}
                    </kbd>
                    <span style={{ color: 'var(--fg-secondary)' }}>{it.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid var(--mat-border)', textAlign: 'center', fontSize: '0.7rem', color: 'var(--muted)' }}>
          <a href="/help" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }} onClick={() => setOpen(false)}>Full guide →</a>
        </div>
      </div>
    </div>
  );
}
