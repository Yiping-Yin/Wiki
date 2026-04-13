'use client';
/**
 * Global drag-and-drop overlay. Drop ANY file anywhere on the page.
 *
 * Context-aware: on /knowledge/<category> pages, files go to that
 * category's directory in the Knowledge system. Elsewhere, files go
 * to the flat uploads folder. The "blackboard" metaphor — drop files
 * on the board you're looking at.
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useKnowledgeNav } from '../lib/use-knowledge-nav';
import { useSmallScreen } from '../lib/use-small-screen';

/** Detect knowledge category from current URL path. Returns the
 *  category directory name for the Knowledge system, or null. */
function detectCategory(pathname: string, knowledgeCategories: Array<{ slug: string; label: string }>): string | null {
  const m = pathname.match(/^\/knowledge\/([^/]+)/);
  if (!m) return null;
  const cat = knowledgeCategories.find((c) => c.slug === m[1]);
  return cat?.label ?? null;
}

export function DropZone() {
  const pathname = usePathname() ?? '/';
  const smallScreen = useSmallScreen();
  const { knowledgeCategories } = useKnowledgeNav();
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
        const category = detectCategory(window.location.pathname, knowledgeCategories);
        let firstHref: string | null = null;
        for (const f of files) {
          setProgress({ name: f.name, pct: 0 });
          const fd = new FormData();
          fd.append('file', f);
          if (category) fd.append('category', category);
          const r = await fetch('/api/upload', { method: 'POST', body: fd });
          const j = await r.json();
          if (!r.ok) {
            setError(`${f.name}: ${j.error ?? 'failed'}`);
            continue;
          }
          if (!firstHref) firstHref = j.href;
        }
        if (firstHref) {
          // For category uploads, reload to refresh the ingest-generated nav
          if (category) window.location.reload();
          else window.location.href = firstHref;
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
  }, [knowledgeCategories]);

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
        padding: smallScreen
          ? 'max(12px, env(safe-area-inset-top, 0px)) 12px max(12px, env(safe-area-inset-bottom, 0px))'
          : 0,
      }}
      role="button"
      aria-label="Dismiss upload overlay"
      onClick={() => { if (error) setError(null); }}
    >
      <div className="glass" style={{
        padding: smallScreen ? '1.35rem 1.15rem' : '2.5rem 3rem',
        borderRadius: smallScreen ? '18px' : 'var(--r-4)',
        border: '2px dashed ' + (dragging ? 'var(--accent)' : 'rgba(255,255,255,0.3)'),
        textAlign: 'center',
        width: smallScreen ? '100%' : 'auto',
        maxWidth: smallScreen ? 380 : 480,
        boxShadow: 'var(--shadow-3)',
      }}>
        <div style={{
          fontSize: '0.68rem',
          marginBottom: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          fontWeight: 700,
          color: error ? 'var(--tint-red)' : busy ? 'var(--accent)' : 'var(--muted)',
        }}>
          {error ? 'Upload error' : busy ? 'Uploading' : 'Drop files'}
        </div>
        <div style={{
          fontSize: '1.3rem', fontWeight: 700, fontFamily: 'var(--display)',
          letterSpacing: '-0.018em', marginBottom: 6,
        }}>
          {error ? 'Upload failed'
           : busy ? ''
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
