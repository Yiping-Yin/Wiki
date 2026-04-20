'use client';

import { useEffect, useRef, useState } from 'react';
import type { ThoughtType } from '../lib/trace/types';

type Props = {
  value: ThoughtType;
  onChange: (next: ThoughtType) => void;
  disabled?: boolean;
};

const THOUGHT_TYPES: ThoughtType[] = [
  'citation',
  'explanation',
  'inference',
  'hypothesis',
  'objection',
  'question',
  'conclusion',
];

const DESCRIPTIONS: Record<ThoughtType, string> = {
  citation: 'quoting or paraphrasing source',
  explanation: 'unpacking source meaning',
  inference: 'conclusion drawn from source',
  hypothesis: 'speculative, not yet supported',
  objection: 'disagreement or challenge',
  question: 'unresolved query',
  conclusion: 'settled judgment',
};

function colorFor(type: ThoughtType): string {
  switch (type) {
    case 'objection': return 'var(--tint-orange)';
    case 'hypothesis': return 'var(--tint-purple)';
    case 'question': return 'var(--tint-yellow)';
    case 'conclusion': return 'var(--tint-green)';
    case 'inference': return 'var(--tint-blue)';
    case 'citation': return 'var(--tint-teal)';
    case 'explanation':
    default: return 'var(--muted)';
  }
}

export function ThoughtTypePicker({ value, onChange, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

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

  return (
    <span ref={rootRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        className="t-caption2"
        style={{
          fontSize: '0.62rem',
          color: 'var(--muted)',
          letterSpacing: '0.04em',
        }}
      >
        type:
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="Change thought type"
        aria-expanded={open}
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          color: colorFor(value),
          fontSize: '0.68rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          padding: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          textTransform: 'lowercase',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {value}
        <span aria-hidden style={{ marginLeft: 3, fontSize: '0.58rem', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 220,
            padding: 4,
            background: 'var(--bg-elevated)',
            border: '0.5px solid var(--mat-border)',
            borderRadius: 6,
            boxShadow: 'var(--shadow-2)',
            zIndex: 30,
          }}
        >
          {THOUGHT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onChange(t); setOpen(false); }}
              style={{
                appearance: 'none',
                border: 0,
                background: t === value ? 'var(--surface-2)' : 'transparent',
                color: 'var(--fg)',
                textAlign: 'left',
                padding: '6px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              <span style={{
                color: colorFor(t),
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}>
                {t}
              </span>
              <span style={{
                color: 'var(--muted)',
                fontSize: '0.64rem',
                lineHeight: 1.3,
              }}>
                {DESCRIPTIONS[t]}
              </span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
