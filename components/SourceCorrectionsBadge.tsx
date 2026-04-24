'use client';
/**
 * SourceCorrectionsBadge · management surface for existing Source Corrects.
 *
 * When the current `know/` doc has any corrections applied to it, a small
 * fixed badge appears bottom-left showing the count. Clicking opens a panel
 * listing every correction with a per-entry "×" remove and a "Clear all"
 * escape hatch. This is how the user discovers *what* has been corrected on
 * a page and how to roll it back without touching the sidecar file.
 *
 * Quiet by default: the badge renders nothing when there are zero
 * corrections — no empty chrome for the common case.
 */

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';

type Correction = {
  before: string;
  after: string;
  at: number;
  contextBefore?: string;
  contextAfter?: string;
};

export function SourceCorrectionsBadge() {
  const pathname = usePathname() ?? '';
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const docId = contextFromPathname(pathname).docId;
  const active = docId.startsWith('know/');

  const refresh = useCallback(async () => {
    if (!active) { setCorrections([]); return; }
    try {
      const res = await fetch(`/api/source-corrections?id=${encodeURIComponent(docId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setCorrections(Array.isArray(data?.corrections) ? data.corrections : []);
    } catch {}
  }, [docId, active]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Re-check after the user saves from SourceCorrectModal (which triggers a
  // page reload) or navigates between docs.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!active || corrections.length === 0) return null;

  const removeOne = async (index: number) => {
    if (busy) return;
    setBusy(true);
    try {
      // Remove: clear all, then re-post everything except the removed one.
      // Kept simple on purpose — corrections lists are small (< 50 typical).
      const kept = corrections.filter((_, i) => i !== index);
      await fetch(`/api/source-corrections?id=${encodeURIComponent(docId)}`, { method: 'DELETE' });
      for (const c of kept) {
        await fetch('/api/source-corrections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: docId,
            before: c.before,
            after: c.after,
            contextBefore: c.contextBefore,
            contextAfter: c.contextAfter,
          }),
        });
      }
      setCorrections(kept);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const jumpTo = (c: Correction) => {
    const prose = document.querySelector('.loom-source-prose');
    if (!prose) return;
    const full = (prose as HTMLElement).textContent ?? '';
    const needle = (c.contextBefore ?? '') + c.after + (c.contextAfter ?? '');
    const idx = full.indexOf(needle);
    if (idx < 0) return;
    const afterStart = idx + (c.contextBefore ?? '').length;
    const afterEnd = afterStart + c.after.length;

    // Walk text nodes to find the range spanning [afterStart, afterEnd)
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_TEXT);
    let acc = 0;
    let startNode: Text | null = null;
    let startOffsetInNode = 0;
    let endNode: Text | null = null;
    let endOffsetInNode = 0;
    let cur: Node | null = walker.nextNode();
    while (cur) {
      const node = cur as Text;
      const len = node.nodeValue?.length ?? 0;
      if (!startNode && acc + len > afterStart) {
        startNode = node;
        startOffsetInNode = afterStart - acc;
      }
      if (acc + len >= afterEnd) {
        endNode = node;
        endOffsetInNode = afterEnd - acc;
        break;
      }
      acc += len;
      cur = walker.nextNode();
    }
    if (!startNode || !endNode) return;

    const range = document.createRange();
    try {
      range.setStart(startNode, startOffsetInNode);
      range.setEnd(endNode, endOffsetInNode);
    } catch {
      return;
    }

    // Close the panel so the user can see the highlight, then scroll.
    setOpen(false);
    requestAnimationFrame(() => {
      const r = range.getBoundingClientRect();
      const targetY = window.scrollY + r.top - window.innerHeight * 0.35;
      window.scrollTo({ top: targetY, behavior: 'smooth' });

      // Transient floating highlight over the range — no DOM mutation of prose.
      const highlights: HTMLElement[] = [];
      for (const rect of Array.from(range.getClientRects())) {
        const el = document.createElement('div');
        el.style.cssText = [
          'position:fixed',
          `left:${rect.left}px`,
          `top:${rect.top}px`,
          `width:${rect.width}px`,
          `height:${rect.height}px`,
          'background:color-mix(in srgb, var(--accent) 32%, transparent)',
          'border-radius:3px',
          'pointer-events:none',
          'z-index:9995',
          'animation:loom-correction-flash 1600ms ease-out forwards',
        ].join(';');
        document.body.appendChild(el);
        highlights.push(el);
      }
      window.setTimeout(() => {
        for (const el of highlights) el.remove();
      }, 1700);
    });
  };

  const clearAll = async () => {
    if (busy) return;
    if (!window.confirm(`Clear all ${corrections.length} corrections on this doc?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/source-corrections?id=${encodeURIComponent(docId)}`, { method: 'DELETE' });
      setCorrections([]);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${corrections.length} source correction${corrections.length > 1 ? 's' : ''} on this doc — click to manage`}
        style={{
          position: 'fixed',
          left: 16,
          bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
          padding: '5px 10px',
          borderRadius: 999,
          border: '0.5px solid var(--mat-border)',
          background: 'color-mix(in srgb, var(--bg) 90%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          color: 'var(--fg-secondary)',
          fontFamily: 'var(--mono)',
          fontSize: '0.66rem',
          letterSpacing: '0.04em',
          cursor: 'pointer',
          zIndex: 40,
        }}
      >
        ✎ {corrections.length} corrected
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'color-mix(in srgb, var(--bg) 64%, transparent)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            zIndex: 9996,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420,
              maxWidth: '100%',
              maxHeight: '70vh',
              overflowY: 'auto',
              background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
              border: '0.5px solid var(--mat-border)',
              borderRadius: 'var(--r-3)',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ fontSize: '0.82rem', color: 'var(--fg-secondary)', fontWeight: 600 }}>
                Corrections on this doc
              </strong>
              <span style={{ flex: 1 }} />
              <button
                type="button"
                onClick={clearAll}
                disabled={busy}
                style={{
                  padding: '3px 8px',
                  borderRadius: 'var(--r-1)',
                  border: 0,
                  background: 'transparent',
                  color: 'var(--tint-red, #c94a4a)',
                  cursor: busy ? 'wait' : 'pointer',
                  font: 'inherit',
                  fontSize: '0.72rem',
                }}
              >
                Clear all
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {corrections.map((c, i) => (
                <div
                  key={`${c.before}-${c.at}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 'var(--r-2)',
                    background: 'var(--mat-thin-bg)',
                    border: '0.5px solid color-mix(in srgb, var(--mat-border) 60%, transparent)',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => jumpTo(c)}
                    title="Jump to this correction in the doc"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: 'left',
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      font: 'inherit',
                      fontSize: '0.78rem',
                      lineHeight: 1.5,
                      cursor: 'pointer',
                      color: 'var(--fg)',
                    }}
                  >
                    <span style={{ color: 'var(--tint-red, #c94a4a)', textDecoration: 'line-through' }}>
                      {c.before}
                    </span>
                    <span style={{ color: 'var(--muted)', margin: '0 6px' }}>→</span>
                    <span style={{ color: 'var(--accent)' }}>{c.after}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeOne(i)}
                    disabled={busy}
                    aria-label="Remove this correction"
                    style={{
                      width: 22, height: 22, padding: 0,
                      border: 0, background: 'transparent',
                      color: 'var(--muted)', cursor: busy ? 'wait' : 'pointer',
                      fontSize: '1rem', lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '0.66rem', color: 'var(--muted)', fontFamily: 'var(--mono)', textAlign: 'right' }}>
              esc close
            </div>
          </div>
        </div>
      )}
    </>
  );
}
