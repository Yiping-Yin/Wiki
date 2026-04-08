'use client';
/**
 * Global drag-and-drop overlay. Drop ANY file anywhere on the page → uploads
 * to /api/upload → navigates to /uploads/<name> when ready.
 *
 * Apple-style large translucent overlay with file icon + helper text.
 */
import { useEffect, useRef, useState } from 'react';

export function DropZone() {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCounter.current++;
      setDragging(true);
    };
    const onDragLeave = () => {
      dragCounter.current--;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragging(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length === 0) return;

      setBusy(true);
      setError(null);
      try {
        // Upload one at a time, navigate to first
        let firstHref: string | null = null;
        for (const f of files) {
          setProgress({ name: f.name, pct: 0 });
          const fd = new FormData();
          fd.append('file', f);
          const r = await fetch('/api/upload', { method: 'POST', body: fd });
          const j = await r.json();
          if (!r.ok) {
            setError(`${f.name}: ${j.error ?? 'failed'}`);
            continue;
          }
          if (!firstHref) firstHref = j.href;
        }
        if (firstHref) {
          window.location.href = firstHref;
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setBusy(false);
        setProgress(null);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  if (!dragging && !busy && !error) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: dragging ? 'rgba(0,113,227,0.15)' : 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: dragging || busy ? 'none' : 'auto',
        animation: 'lpFade 0.18s var(--ease)',
      }}
      onClick={() => { if (error) setError(null); }}
    >
      <div className="glass" style={{
        padding: '2.5rem 3rem',
        borderRadius: 'var(--r-4)',
        border: '2px dashed ' + (dragging ? 'var(--accent)' : 'rgba(255,255,255,0.3)'),
        textAlign: 'center',
        maxWidth: 480,
        boxShadow: 'var(--shadow-3)',
      }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '0.6rem' }}>
          {error ? '⚠️' : busy ? '⏳' : '📥'}
        </div>
        <div style={{
          fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--display)',
          letterSpacing: '-0.018em', marginBottom: 6,
        }}>
          {error ? 'Upload failed'
           : busy && progress ? `Uploading ${progress.name}…`
           : busy ? 'Uploading…'
           : 'Drop to upload'}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          {error
            ? error
            : 'PDF · DOCX · PPTX · CSV · JSON · IPYNB · TXT · MD'}
        </div>
        {error && (
          <button
            onClick={() => setError(null)}
            style={{
              marginTop: '1rem', background: 'var(--accent)', color: '#fff',
              border: 0, borderRadius: 'var(--r-1)', padding: '0.5rem 1.2rem',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
            }}
          >Dismiss</button>
        )}
      </div>
    </div>
  );
}
