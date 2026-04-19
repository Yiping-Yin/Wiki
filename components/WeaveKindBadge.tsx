'use client';

import { useEffect, useRef, useState } from 'react';
import { setWeaveKind, WEAVE_KINDS, weaveKindLabel, type WeaveKind } from '../lib/weave';

type Props = {
  weaveId: string;
  kind: WeaveKind;
  compact?: boolean;
};

function colorFor(kind: WeaveKind): string {
  switch (kind) {
    case 'supports': return 'var(--tint-green)';
    case 'refines': return 'var(--tint-blue)';
    case 'contradicts': return 'var(--tint-orange)';
    case 'depends-on': return 'var(--tint-purple)';
    case 'references':
    default: return 'var(--muted)';
  }
}

export function WeaveKindBadge({ weaveId, kind, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<WeaveKind>(kind);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setCurrent(kind);
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const select = async (next: WeaveKind) => {
    setOpen(false);
    if (next === current) return;
    setCurrent(next);
    try {
      await setWeaveKind(weaveId, next);
    } catch {
      setCurrent(kind);
    }
  };

  if (current === 'references' && !open && !compact) {
    return (
      <button
        type="button"
        ref={rootRef as unknown as React.RefObject<HTMLButtonElement>}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        aria-label="Change relation kind"
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          color: 'var(--muted)',
          fontSize: '0.62rem',
          letterSpacing: '0.05em',
          padding: 0,
          cursor: 'pointer',
          opacity: 0.6,
        }}
      >
        (kind)
      </button>
    );
  }

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="Change relation kind"
        aria-expanded={open}
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          color: colorFor(current),
          fontSize: '0.64rem',
          fontWeight: 700,
          letterSpacing: '0.05em',
          padding: 0,
          cursor: 'pointer',
          textTransform: 'lowercase',
        }}
      >
        {weaveKindLabel(current)}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 120,
            padding: 4,
            background: 'var(--bg-elevated)',
            border: '0.5px solid var(--mat-border)',
            borderRadius: 6,
            boxShadow: 'var(--shadow-2)',
            zIndex: 20,
          }}
        >
          {WEAVE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => void select(k)}
              style={{
                appearance: 'none',
                border: 0,
                background: k === current ? 'var(--surface-2)' : 'transparent',
                color: colorFor(k),
                fontSize: '0.72rem',
                fontWeight: 600,
                textAlign: 'left',
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {weaveKindLabel(k)}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
