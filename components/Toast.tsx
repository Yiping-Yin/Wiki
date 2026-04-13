'use client';
/**
 * Global toast system.
 *
 * Usage from anywhere (no React context required):
 *   import { toast } from './Toast';
 *   toast('✓ Saved');
 *   toast('Could not load', { kind: 'warn' });
 *   toast('Failed', { kind: 'error', durationMs: 3500 });
 *
 * Implementation: a single ToastHost is mounted in the root layout. It listens
 * for `wiki:toast` CustomEvents on window and renders a bottom-center stack of
 * material-thick capsules with spring entry/exit.
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

const KIND_META: Record<ToastKind, { color: string; icon: string }> = {
  ok:    { color: 'var(--tint-green)',  icon: '✓' },
  info:  { color: 'var(--tint-blue)',   icon: 'ℹ' },
  warn:  { color: 'var(--tint-orange)', icon: '⚠' },
  error: { color: 'var(--tint-red)',    icon: '✕' },
};

export function ToastHost() {
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

  const dismiss = (id: number) => setItems((prev) => prev.filter((t) => t.id !== id));

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      style={{
        position: 'fixed', bottom: 28, left: '50%',
        transform: 'translateX(-50%)',
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
            className="material-thick toast-item"
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '0.55rem 1rem 0.55rem 0.85rem',
              borderRadius: 999,
              border: 0,
              cursor: 'pointer',
              color: 'var(--fg)',
              fontFamily: 'var(--display)',
              fontWeight: 600,
              fontSize: '0.84rem',
              letterSpacing: '-0.005em',
              animation: 'toastIn 0.36s var(--ease-spring) both',
              maxWidth: 'min(440px, 88vw)',
            }}
          >
            <span style={{
              color: meta.color,
              fontSize: '0.95rem',
              flexShrink: 0,
              fontWeight: 700,
            }}>{meta.icon}</span>
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
