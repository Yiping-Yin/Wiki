'use client';
/**
 * RehearsalOverlay · full-screen writing surface for retrieval practice.
 *
 * Covers the entire document — you write from memory, can't peek.
 * This is intentional: looking at the doc while rehearsing defeats
 * the purpose. The friction of Esc → peek → ⌘E back IS learning.
 *
 * Triggered by ⌘E (no selection) or ⌘P → Rehearsal.
 */
import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { OVERLAY_RESUME_KEY, type OverlayResumePayload } from '../lib/overlay-resume';
import { useAnimatedPresence } from '../lib/use-animated-presence';
import { RehearsalPanel } from './unified/RehearsalPanel';

export function RehearsalOverlay() {
  const [active, setActive] = useState(false);
  const [resumeDraft, setResumeDraft] = useState('');
  const [resumeLabel, setResumeLabel] = useState('');
  const { mounted, visible } = useAnimatedPresence(active, 250);
  const pathname = usePathname();
  const ctx = contextFromPathname(pathname);

  // Triggered by ⌘E (no selection) or ⌘P → Rehearsal
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id === 'rehearsal') {
        if (typeof detail.seedDraft === 'string') setResumeDraft(detail.seedDraft);
        if (typeof detail.seedLabel === 'string') setResumeLabel(detail.seedLabel);
        setActive((a) => !a);
      }
    };
    window.addEventListener('loom:overlay:toggle', handler);
    return () => window.removeEventListener('loom:overlay:toggle', handler);
  }, []);

  // Mutual exclusion
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.id !== 'rehearsal') setActive(false);
    };
    window.addEventListener('loom:overlay:open', handler);
    return () => window.removeEventListener('loom:overlay:open', handler);
  }, []);

  // Esc closes (but not from inside textarea — let textarea handle its own Esc)
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
      if (payload.overlay !== 'rehearsal' || payload.href !== window.location.pathname) return;
      sessionStorage.removeItem(OVERLAY_RESUME_KEY);
      setResumeDraft(payload.seedDraft ?? '');
      setResumeLabel(payload.seedLabel ?? '');
      setActive(true);
    } catch {}
  }, []);

  const onSaved = useCallback((next: 'stay' | 'examine' = 'stay') => {
    window.dispatchEvent(new CustomEvent('loom:trace:changed'));
    if (next === 'examine') {
      window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: 'examiner' } }));
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('loom:overlay:toggle', { detail: { id: 'examiner' } }));
      });
    }
  }, []);

  if (!mounted) return null;
  if (ctx.isFree) return null;

  return (
    <div
      className="loom-rehearsal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: visible
          ? 'loom-overlay-fade-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both'
          : 'loom-modal-exit 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 680,
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 16,
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          animation: visible
            ? 'loom-overlay-fade-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both'
            : 'loom-modal-exit 0.2s ease both',
        }}
      >
        <RehearsalPanel
          docId={ctx.docId}
          onSaved={onSaved}
          seedDraft={resumeDraft}
          seedLabel={resumeLabel}
        />
      </div>
    </div>
  );
}
