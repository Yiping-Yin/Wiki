'use client';
import { useRef, useState } from 'react';
import { isNativeMode } from '../../lib/is-native-mode';

/**
 * Minimal intake trigger — a "+" that opens the native file picker.
 * Sits in the Intake header hairline. No modal, no dialog, no copy.
 * §1: the file picker IS the interface. §16: 3 steps max (click → pick → done).
 */
export function UploadButton({
  variant = 'icon',
  label = 'Add files',
}: {
  variant?: 'icon' | 'button';
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // `/api/upload` is stripped under static export. Native users drag a
  // file onto the window (SwiftUI `.onDrop` on ContentView opens the
  // native IngestionView) or use File → Open. Hide the web button so
  // its click doesn't dead-end in a 404.
  if (typeof window !== 'undefined' && isNativeMode()) return null;

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', f);
        const r = await fetch('/api/upload', { method: 'POST', body: fd });
        if (r.ok) {
          const j = await r.json();
          if (j.href) { window.location.href = j.href; return; }
        }
      }
      window.location.reload();
    } catch {} finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.csv,.tsv,.json,.ipynb,.xlsx,.xls"
        onChange={(e) => upload(e.target.files)}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Upload file"
        title="Upload file"
        style={{
          background: variant === 'button' ? 'var(--bg-translucent)' : 'transparent',
          border: variant === 'button' ? '0.5px solid var(--mat-border)' : 0,
          cursor: busy ? 'default' : 'pointer',
          color: variant === 'button' ? 'var(--fg)' : 'var(--muted)',
          fontSize: variant === 'button' ? '0.82rem' : '1rem',
          lineHeight: 1,
          padding: variant === 'button' ? '0.46rem 0.72rem' : '0 4px',
          opacity: busy ? 0.3 : variant === 'button' ? 0.88 : 0.5,
          transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
          flexShrink: 0,
          borderRadius: variant === 'button' ? 999 : 0,
          boxShadow: variant === 'button' ? 'var(--shadow-1)' : 'none',
          fontFamily: variant === 'button' ? 'var(--display)' : 'inherit',
          fontWeight: variant === 'button' ? 600 : 400,
          letterSpacing: variant === 'button' ? '-0.01em' : 'normal',
          display: 'inline-flex',
          alignItems: 'center',
          gap: variant === 'button' ? 8 : 0,
        }}
        onMouseEnter={(e) => {
          if (!busy) {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.color = variant === 'button' ? 'var(--fg)' : 'var(--accent)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = busy ? '0.3' : variant === 'button' ? '0.88' : '0.5';
          e.currentTarget.style.color = variant === 'button' ? 'var(--fg)' : 'var(--muted)';
        }}
      >
        {variant === 'button' ? (
          <>
            <span className="loom-smallcaps" style={{ color: 'var(--muted)', fontFamily: 'var(--serif)', fontWeight: 500, fontSize: '0.82rem' }}>
              Intake
            </span>
            <span>{label}</span>
          </>
        ) : '+'}
      </button>
    </>
  );
}
