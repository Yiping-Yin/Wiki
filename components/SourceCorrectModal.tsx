'use client';
/**
 * SourceCorrectModal · diff-review surface for a Source Correct.
 *
 * Source docs are truth — we don't let AI rewrite them. But user-visible
 * typos / mis-extractions need a fix path, and this is it: a small diff
 * modal that shows the selected span, lets the user edit it, and hits the
 * `/api/source-corrections` endpoint. The server enforces a small edit
 * distance so this can't be turned into a freeform rewrite channel.
 *
 * Successful save triggers a page reload so the corrected body flows
 * through `readKnowledgeDocBody` naturally. (Client-side patching would be
 * lower-latency but would leak a second source of truth.)
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { TextInput } from './TextInput';

type Props = {
  docId: string;
  before: string;
  contextBefore: string;
  contextAfter: string;
  onClose: () => void;
};

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev: number[] = new Array(n + 1);
  const cur: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = cur[j];
  }
  return prev[n];
}

export function SourceCorrectModal({ docId, before, contextBefore, contextAfter, onClose }: Props) {
  const [after, setAfter] = useState(before);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const dist = editDistance(before, after);
  const noChange = before === after;
  const tooBig = dist > 20;

  const save = async () => {
    if (saving || noChange || tooBig) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/source-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: docId,
          before,
          after,
          contextBefore,
          contextAfter,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'save failed');
        return;
      }
      onClose();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'color-mix(in srgb, var(--bg) 70%, transparent)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        zIndex: 9997,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: '100%',
          background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 'var(--r-3)',
          padding: '20px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ fontSize: '0.88rem', color: 'var(--fg-secondary)', fontWeight: 600 }}>Correct source text</strong>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: '0.64rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            ⏎ save · esc cancel
          </span>
        </div>

        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          <span style={{ opacity: 0.7 }}>…{contextBefore}</span>
          <span style={{ color: 'var(--tint-red, #c94a4a)', textDecoration: 'line-through' }}>{before}</span>
          <span style={{ opacity: 0.7 }}>{contextAfter}…</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="loom-smallcaps" style={{ fontSize: '0.82rem', color: 'var(--muted)', fontFamily: 'var(--serif)', fontWeight: 500 }}>
            Replacement
          </label>
          <TextInput
            ref={inputRef}
            size="md"
            invalid={tooBig}
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
          />
          <div style={{ display: 'flex', gap: 10, fontSize: '0.66rem', color: 'var(--muted)' }}>
            <span>edit distance {dist}/20{tooBig ? ' — too big; use an edit surface for rewrites' : ''}</span>
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '0.76rem', color: 'var(--tint-red, #c94a4a)' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button tone="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            tone="primary"
            size="md"
            busy={saving}
            disabled={saving || noChange || tooBig}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save correction'}
          </Button>
        </div>
      </div>
    </div>
  );
}
