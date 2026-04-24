'use client';
/**
 * ExaminerOverlay · AI examiner panel with enter/exit animation.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getAiSurface } from '../lib/ai/stage-model';
import { useLoomOverlay } from '../lib/ai/use-loom-overlay';
import { contextFromPathname } from '../lib/doc-context';
import { consumeOverlayResume } from '../lib/overlay-resume';
import { useSmallScreen } from '../lib/use-small-screen';
import { AIExaminer } from './unified/AIExaminer';
import { WeftShuttle } from './DocViewer';

export function ExaminerOverlay() {
  const smallScreen = useSmallScreen();
  const examinerSurface = getAiSurface('examiner');
  const pathname = usePathname();
  const ctx = contextFromPathname(pathname);
  const { active, mounted, visible, close, open } = useLoomOverlay({
    id: 'examiner',
    pathname,
  });

  useEffect(() => {
    const href = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : null);
    if (!href) return;
    const payload = consumeOverlayResume(sessionStorage, {
      href,
      overlay: 'examiner',
    });
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
      console.warn('[loom-app-shell] consumeOverlayResume:examiner', JSON.stringify({
        href,
        matched: Boolean(payload),
      }));
    }
    if (!payload) return;
    open({ id: 'examiner' });
  }, [open, pathname]);

  if (!mounted) return null;
  if (ctx.isFree) return null;

  return (
    <div
      className="loom-examiner-overlay"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: smallScreen ? 0 : 'auto',
        width: smallScreen ? '100vw' : 400,
        maxWidth: smallScreen ? '100vw' : '38vw',
        zIndex: 'var(--z-popover)',
        display: 'flex', flexDirection: 'column',
        background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
        borderLeft: smallScreen ? 'none' : '0.5px solid color-mix(in srgb, var(--mat-border) 80%, transparent)',
        boxShadow: smallScreen ? 'none' : 'var(--shadow-panel-left)',
        animation: visible
          ? 'loom-slide-in-right 0.25s cubic-bezier(0.22, 1, 0.36, 1) both'
          : 'loom-slide-out-right 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}
    >
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--mat-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
        <strong style={{ color: 'var(--fg-secondary)', flex: 1, fontWeight: 600 }}>{examinerSurface.launcherTitle}</strong>
        <button
          type="button"
          onClick={() => close(true)}
          aria-label="Close examiner (Esc)"
          style={{
            appearance: 'none',
            border: 0,
            background: 'transparent',
            color: 'var(--fg-secondary)',
            fontFamily: 'var(--mono)',
            fontSize: '0.62rem',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 3,
          }}
        >
          Esc
        </button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px 14px' }}>
        <ExaminerInner docId={ctx.docId} />
      </div>
    </div>
  );
}

function ExaminerInner({ docId }: { docId: string }) {
  const [contextNotes, setContextNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { traceStore } = await import('../lib/trace/store');
      const { notesFromTraces } = await import('../lib/note/from-trace');
      const traces = await traceStore.getAll();
      const allNotes = notesFromTraces(traces);
      setContextNotes(allNotes.filter((n: any) => n.anchor.target === docId));
      setLoading(false);
    };
    load();
    const refresh = () => load();
    window.addEventListener('loom:trace:changed', refresh);
    return () => window.removeEventListener('loom:trace:changed', refresh);
  }, [docId]);

  if (loading) {
    return (
      <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
        <WeftShuttle width={72} />
      </div>
    );
  }
  return <AIExaminer docId={docId} contextNotes={contextNotes} />;
}
