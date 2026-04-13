'use client';
/**
 * ExaminerOverlay · AI examiner panel with enter/exit animation.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { OVERLAY_RESUME_KEY, type OverlayResumePayload } from '../lib/overlay-resume';
import { useAnimatedPresence } from '../lib/use-animated-presence';
import { AIExaminer } from './unified/AIExaminer';
import { WeftShuttle } from './DocViewer';

export function ExaminerOverlay() {
  const [active, setActive] = useState(false);
  const { mounted, visible } = useAnimatedPresence(active, 250);
  const pathname = usePathname();
  const ctx = contextFromPathname(pathname);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.id === 'examiner') setActive((a) => !a);
    };
    window.addEventListener('loom:overlay:toggle', handler);
    return () => window.removeEventListener('loom:overlay:toggle', handler);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.id !== 'examiner') setActive(false);
    };
    window.addEventListener('loom:overlay:open', handler);
    return () => window.removeEventListener('loom:overlay:open', handler);
  }, []);

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

  useEffect(() => { setActive(false); }, [pathname]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(OVERLAY_RESUME_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as OverlayResumePayload;
      if (payload.overlay !== 'examiner' || payload.href !== window.location.pathname) return;
      sessionStorage.removeItem(OVERLAY_RESUME_KEY);
      setActive(true);
    } catch {}
  }, []);

  if (!mounted) return null;
  if (ctx.isFree) return null;

  return (
    <div
      className="loom-examiner-overlay"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 440, maxWidth: '42vw', zIndex: 900,
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg)',
        borderLeft: '0.5px solid var(--mat-border)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.12)',
        animation: visible
          ? 'loom-slide-in-right 0.25s cubic-bezier(0.22, 1, 0.36, 1) both'
          : 'loom-slide-out-right 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}
    >
      <div style={{ padding: '10px 16px', borderBottom: '0.5px solid var(--mat-border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.72rem' }}>
        <strong style={{ color: 'var(--accent)', flex: 1 }}>Examiner</strong>
        <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '0.62rem', cursor: 'pointer', opacity: 0.6 }} onClick={() => setActive(false)}>Esc ×</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
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
