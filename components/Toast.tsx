'use client';
/**
 * Scoped toast system.
 *
 * Usage from anywhere (no React context required):
 *   import { toast } from './Toast';
 *   toast('Embedding 12 traces…');
 *   toast('Select a trace first', { kind: 'warn' });
 *   toast('Embedding failed', { kind: 'error', durationMs: 3500 });
 *
 * Mount ToastHost only on surfaces that deliberately opt into toast feedback.
 * It listens for `wiki:toast` CustomEvents on window and renders a
 * bottom-center stack of quiet strips with spring entry/exit.
 */
import { useEffect, useState } from 'react';

type ToastKind = 'ok' | 'warn' | 'error' | 'info';
type ToastItem = { id: number; text: string; kind: ToastKind; createdAt: number; durationMs: number };

const EVENT = 'wiki:toast';

/** Fire-and-forget toast — works in any client component. */
export function toast(text: string, opts: { kind?: ToastKind; durationMs?: number } = {}) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, {
    detail: { text, kind: opts.kind ?? 'ok', durationMs: opts.durationMs ?? 1800 },
  }));
}

const KIND_META: Record<ToastKind, { color: string; label: string }> = {
  ok:    { color: 'var(--tint-green)',  label: 'Held' },
  info:  { color: 'var(--tint-blue)',   label: 'Note' },
  warn:  { color: 'var(--tint-orange)', label: 'Watch' },
  error: { color: 'var(--tint-red)',    label: 'Error' },
};

export function ToastHost() {
  const [smallScreen, setSmallScreen] = useState(false);
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let nextId = 1;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string; kind: ToastKind; durationMs: number };
      const id = nextId++;
      setItems((prev) => [...prev, { id, text: detail.text, kind: detail.kind, createdAt: Date.now(), durationMs: detail.durationMs }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, detail.durationMs);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 900px)');
    const apply = () => setSmallScreen(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed',
        bottom: smallScreen ? 'max(12px, env(safe-area-inset-bottom, 0px) + 8px)' : 28,
        left: smallScreen ? 12 : '50%',
        right: smallScreen ? 12 : 'auto',
        transform: smallScreen ? 'none' : 'translateX(-50%)',
        zIndex: 135,
        display: 'flex', flexDirection: 'column-reverse',
        alignItems: 'center', gap: 8,
        pointerEvents: 'none',
      }}
    >
      {items.map((t) => {
        const meta = KIND_META[t.kind];
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '0.52rem 0.9rem 0.52rem 0.75rem',
              borderTop: '0.5px solid var(--mat-border)',
              borderBottom: '0.5px solid var(--mat-border)',
              background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
              cursor: 'pointer',
              color: 'var(--fg)',
              fontFamily: 'var(--display)',
              fontStyle: 'italic',
              fontWeight: 500,
              fontSize: '0.9rem',
              letterSpacing: '-0.012em',
              animation: 'toastIn 0.36s var(--ease-spring) both',
              maxWidth: 'min(440px, 88vw)',
            }}
          >
            <span className="loom-smallcaps" style={{
              color: meta.color,
              fontFamily: 'var(--serif)',
              fontSize: '0.82rem',
              flexShrink: 0,
              fontWeight: 500,
            }}>{meta.label}</span>
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>{t.text}</span>
          </button>
        );
      })}
    </div>
  );
}
