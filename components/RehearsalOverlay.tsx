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
import { replaceLoomOverlay } from '../lib/ai/surface-actions';
import { useLoomOverlay } from '../lib/ai/use-loom-overlay';
import { contextFromPathname } from '../lib/doc-context';
import { consumeOverlayResume } from '../lib/overlay-resume';
import { useSmallScreen } from '../lib/use-small-screen';
import { RehearsalPanel } from './unified/RehearsalPanel';

export function RehearsalOverlay() {
  const smallScreen = useSmallScreen();
  const [resumeDraft, setResumeDraft] = useState('');
  const [resumeLabel, setResumeLabel] = useState('');
  const pathname = usePathname();
  const ctx = contextFromPathname(pathname);
  const { active, mounted, visible, open } = useLoomOverlay({
    id: 'rehearsal',
    pathname,
    onToggleDetail: (detail) => {
      if (typeof detail.seedDraft === 'string') setResumeDraft(detail.seedDraft);
      if (typeof detail.seedLabel === 'string') setResumeLabel(detail.seedLabel);
    },
  });

  useEffect(() => {
    const href = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : null);
    if (!href) return;
    const payload = consumeOverlayResume(sessionStorage, {
      href,
      overlay: 'rehearsal',
    });
    if (!payload) return;
    setResumeDraft(payload.seedDraft ?? '');
    setResumeLabel(payload.seedLabel ?? '');
    open({ id: 'rehearsal', seedDraft: payload.seedDraft, seedLabel: payload.seedLabel });
  }, [open, pathname]);

  const onSaved = useCallback((next: 'stay' | 'examine' = 'stay') => {
    if (next === 'examine') {
      replaceLoomOverlay({ id: 'examiner' });
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
        zIndex: 'var(--z-popover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        animation: visible
          ? 'loom-overlay-fade-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) both'
          : 'loom-modal-exit 0.2s cubic-bezier(0.22, 1, 0.36, 1) both',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: smallScreen ? '100vw' : 720,
          height: smallScreen ? '100vh' : '82vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
          borderTop: '0.5px solid var(--mat-border)',
          borderBottom: '0.5px solid var(--mat-border)',
          borderRadius: 0,
          boxShadow: smallScreen ? 'none' : 'var(--shadow-2)',
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
