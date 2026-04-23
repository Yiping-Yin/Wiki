'use client';
/**
 * IngestionOverlay · file import panel, triggered by ⌘E → I.
 * Lazy-loads trace data only when active.
 */
import { useEffect, useState } from 'react';
import { getAiSurface } from '../lib/ai/stage-model';
import { useLoomOverlay } from '../lib/ai/use-loom-overlay';
import { useSmallScreen } from '../lib/use-small-screen';
import { IngestionPanel } from './unified/IngestionPanel';

export function IngestionOverlay() {
  const smallScreen = useSmallScreen();
  const ingestionSurface = getAiSurface('ingestion');
  const { mounted, visible, close } = useLoomOverlay({
    id: 'ingestion',
  });

  if (!mounted) return null;

  return (
    <div
      className="loom-ingestion-overlay"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: smallScreen ? 0 : 'auto',
        width: smallScreen ? '100vw' : 440,
        maxWidth: smallScreen ? '100vw' : '42vw',
        zIndex: 900,
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg)',
        borderLeft: smallScreen ? 'none' : '0.5px solid var(--mat-border)',
        boxShadow: smallScreen ? 'none' : 'var(--shadow-panel-left)',
        animation: visible
          ? 'loom-slide-in-right 0.25s cubic-bezier(0.22, 1, 0.36, 1) both'
          : 'loom-slide-out-right 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        paddingTop: smallScreen ? 'max(8px, env(safe-area-inset-top, 0px))' : 0,
        paddingBottom: smallScreen ? 'max(8px, env(safe-area-inset-bottom, 0px))' : 0,
      }}
    >
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--mat-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
        <strong style={{ color: 'var(--accent)', flex: 1 }}>{ingestionSurface.launcherTitle}</strong>
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.62rem', cursor: 'pointer', opacity: 0.6 }} onClick={() => close(true)}>Esc ×</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <IngestionInner />
      </div>
    </div>
  );
}

function IngestionInner() {
  const [notes, setNotes] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { traceStore } = await import('../lib/trace/store');
      const { notesFromTraces } = await import('../lib/note/from-trace');
      const traces = await traceStore.getAll();
      setNotes(notesFromTraces(traces));
    };
    load();
    const refresh = () => load();
    window.addEventListener('loom:trace:changed', refresh);
    return () => window.removeEventListener('loom:trace:changed', refresh);
  }, []);

  return <IngestionPanel existingIngested={notes} />;
}
