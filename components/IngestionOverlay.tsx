'use client';
/**
 * IngestionOverlay · file import panel, triggered by ⌘E → I.
 * Lazy-loads trace data only when active.
 */
import { useEffect, useState } from 'react';
import { useSmallScreen } from '../lib/use-small-screen';
import { useAnimatedPresence } from '../lib/use-animated-presence';
import { IngestionPanel } from './unified/IngestionPanel';

export function IngestionOverlay() {
  const smallScreen = useSmallScreen();
  const [active, setActive] = useState(false);
  const { mounted, visible } = useAnimatedPresence(active, 250);

  // Triggered by ⌘P (⌘E → I)
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.id === 'ingestion') setActive((a) => !a);
    };
    window.addEventListener('loom:overlay:toggle', handler);
    return () => window.removeEventListener('loom:overlay:toggle', handler);
  }, []);

  // Mutual exclusion
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.id !== 'ingestion') setActive(false);
    };
    window.addEventListener('loom:overlay:open', handler);
    return () => window.removeEventListener('loom:overlay:open', handler);
  }, []);

  // Esc closes
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
      setActive(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  useEffect(() => {
    if (!active) window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: '__none__' } }));
  }, [active]);

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
        boxShadow: smallScreen ? 'none' : '-8px 0 24px rgba(0,0,0,0.12)',
        animation: visible
          ? 'loom-slide-in-right 0.25s cubic-bezier(0.22, 1, 0.36, 1) both'
          : 'loom-slide-out-right 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
        paddingTop: smallScreen ? 'max(8px, env(safe-area-inset-top, 0px))' : 0,
        paddingBottom: smallScreen ? 'max(8px, env(safe-area-inset-bottom, 0px))' : 0,
      }}
    >
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--mat-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
        <strong style={{ color: 'var(--accent)', flex: 1 }}>Import</strong>
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.62rem', cursor: 'pointer', opacity: 0.6 }} onClick={() => setActive(false)}>Esc ×</span>
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
