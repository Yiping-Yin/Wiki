'use client';
import { useRef, useState } from 'react';

/**
 * Minimal upload trigger — a "+" that opens the native file picker.
 * Sits in the Uploads header hairline. No modal, no dialog, no copy.
 * §1: the file picker IS the interface. §16: 3 steps max (click → pick → done).
 */
export function UploadButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

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
          background: 'transparent',
          border: 0,
          cursor: busy ? 'default' : 'pointer',
          color: 'var(--muted)',
          fontSize: '1rem',
          lineHeight: 1,
          padding: '0 4px',
          opacity: busy ? 0.3 : 0.5,
          transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent)'; } }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--muted)'; }}
      >+</button>
    </>
  );
}
