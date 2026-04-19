'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAllPanels } from '../lib/panel';
import { WEAVE_KINDS, weaveKindLabel, type WeaveKind } from '../lib/weave';

type Props = {
  currentDocId: string | null;
  value: { panelId: string; panelTitle: string; kind: WeaveKind } | null;
  onChange: (next: { panelId: string; panelTitle: string; kind: WeaveKind } | null) => void;
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

export function RelatesToPicker({ currentDocId, value, onChange }: Props) {
  const [expanded, setExpanded] = useState(!!value);
  const [query, setQuery] = useState('');
  const [kindMenuOpen, setKindMenuOpen] = useState(false);
  const { panels } = useAllPanels();
  const searchRef = useRef<HTMLInputElement>(null);
  const kindMenuRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (expanded && !value) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [expanded, value]);

  useEffect(() => {
    if (!kindMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!kindMenuRef.current) return;
      if (kindMenuRef.current.contains(e.target as Node)) return;
      setKindMenuOpen(false);
    };
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, [kindMenuOpen]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = panels
      .filter((p) => p.docId !== currentDocId)
      .filter((p) => {
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          p.summary.toLowerCase().includes(q) ||
          p.centralClaim.toLowerCase().includes(q)
        );
      });
    filtered.sort((a, b) => (b.updatedAt || b.crystallizedAt) - (a.updatedAt || a.crystallizedAt));
    return filtered.slice(0, 8);
  }, [panels, query, currentDocId]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          color: 'var(--muted)',
          fontSize: '0.72rem',
          letterSpacing: '0.02em',
          padding: '2px 0',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        + Relates to…
      </button>
    );
  }

  if (value) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 6px',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 6,
          background: 'var(--surface-2)',
          fontSize: '0.72rem',
          maxWidth: '100%',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ color: 'var(--muted)' }}>Relates to</span>
        <span ref={kindMenuRef} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            type="button"
            onClick={() => setKindMenuOpen((v) => !v)}
            style={{
              appearance: 'none',
              border: 0,
              background: 'transparent',
              color: colorFor(value.kind),
              fontWeight: 650,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {weaveKindLabel(value.kind)}
            <span aria-hidden style={{ marginLeft: 3, fontSize: '0.58rem', opacity: 0.6 }}>▾</span>
          </button>
          {kindMenuOpen && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                marginBottom: 4,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 140,
                padding: 4,
                background: 'var(--bg-elevated)',
                border: '0.5px solid var(--mat-border)',
                borderRadius: 6,
                boxShadow: 'var(--shadow-2)',
                zIndex: 30,
              }}
            >
              {WEAVE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    onChange({ ...value, kind: k });
                    setKindMenuOpen(false);
                  }}
                  style={{
                    appearance: 'none',
                    border: 0,
                    background: k === value.kind ? 'var(--surface-2)' : 'transparent',
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
        <span
          style={{
            color: 'var(--fg-secondary)',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={value.panelTitle}
        >
          {value.panelTitle}
        </span>
        <button
          type="button"
          onClick={() => { onChange(null); setExpanded(false); }}
          aria-label="Clear relation"
          style={{
            appearance: 'none',
            border: 0,
            background: 'transparent',
            color: 'var(--muted)',
            fontSize: '0.8rem',
            lineHeight: 1,
            padding: '0 2px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: 6,
        border: '0.5px solid var(--mat-border)',
        borderRadius: 6,
        background: 'var(--surface-2)',
        maxWidth: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>Relates to:</span>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search recent panels…"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '4px 8px',
            fontSize: '0.78rem',
            background: 'var(--bg)',
            border: '0.5px solid var(--mat-border)',
            borderRadius: 4,
            color: 'var(--fg)',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-label="Close"
          style={{
            appearance: 'none',
            border: 0,
            background: 'transparent',
            color: 'var(--muted)',
            fontSize: '0.8rem',
            lineHeight: 1,
            padding: '0 2px',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      {candidates.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: 160,
            overflowY: 'auto',
          }}
        >
          {candidates.map((p) => (
            <button
              key={p.docId}
              type="button"
              onClick={() => onChange({
                panelId: p.docId,
                panelTitle: p.title,
                kind: 'references',
              })}
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                color: 'var(--fg-secondary)',
                textAlign: 'left',
                fontSize: '0.76rem',
                padding: '4px 6px',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{p.title}</span>
              {p.summary && (
                <span style={{
                  color: 'var(--muted)',
                  fontSize: '0.68rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {p.summary.slice(0, 80)}
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: '0.7rem', color: 'var(--muted)', padding: '4px 6px' }}>
          {query ? 'No matching panel.' : 'No other panels yet.'}
        </div>
      )}
    </div>
  );
}
