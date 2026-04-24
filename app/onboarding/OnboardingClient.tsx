'use client';

import { useState, useEffect, CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ScanScopePicker } from '../../components/ScanScopePicker';
import { TextInput } from '../../components/TextInput';
import { WeftShuttle } from '../../components/DocViewer';

type Phase = 'pick' | 'scope' | 'scanning' | 'done' | 'error';

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: Record<string, { postMessage: (msg: unknown) => void }>;
    };
    loomOnboarding?: {
      receiveFolder: (path: string) => void;
      receiveFolderError: (reason: string) => void;
    };
  }
}

/**
 * First-run web surface. Mirrors `loom-entry.jsx` OnboardingSurface —
 * Cormorant-italic display title, italic EB Garamond body, paper-bordered
 * literary buttons, no iOS-blue. Preserves functional paths: POST
 * /api/content-root, POST /api/ingest, ScanScopePicker persist.
 */
export function OnboardingClient() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('pick');
  const [folder, setFolder] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [manualPath, setManualPath] = useState<string>('');
  const [scopeModalOpen, setScopeModalOpen] = useState(false);
  const [showManualPath, setShowManualPath] = useState(false);

  useEffect(() => {
    // Swift posts the chosen folder back via evaluateJavaScript; expose the
    // receiver on window so the native shell can invoke it.
    window.loomOnboarding = {
      receiveFolder: (p: string) => {
        setFolder(p);
        void saveAndIngest(p);
      },
      receiveFolderError: (reason: string) => {
        setError(reason || 'folder selection cancelled');
      },
    };
    return () => {
      delete window.loomOnboarding;
    };
  }, []);

  const saveAndIngest = async (p: string) => {
    setError('');
    try {
      const save = await fetch('/api/content-root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentRoot: p }),
      });
      if (!save.ok) {
        const body = await save.json().catch(() => ({}));
        throw new Error(body.error || `save failed (${save.status})`);
      }
      setFolder(p);
      // Hand off to scope picker — the picker persists scope and triggers
      // the ingest itself. Avoids scanning everything only to narrow later.
      setPhase('scope');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  const skipScopeAndIngestAll = async () => {
    setPhase('scanning');
    try {
      const ing = await fetch('/api/ingest', { method: 'POST' });
      if (!ing.ok) {
        const body = await ing.json().catch(() => ({}));
        throw new Error(body.error || `ingest failed (${ing.status})`);
      }
      setPhase('done');
      setTimeout(() => router.push('/desk'), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  const pickFolder = () => {
    const handler = window.webkit?.messageHandlers?.loomChooseFolder;
    if (handler) {
      handler.postMessage({});
    } else {
      // Browser fallback — Swift handler only exists inside the Loom app.
      setError('Folder picker requires the Loom app. Paste a path below instead.');
      setShowManualPath(true);
    }
  };

  return (
    <main
      style={{
        background: 'var(--bg)',
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        fontFamily: 'var(--serif)',
        color: 'var(--fg)',
      }}
    >
      <section
        style={{
          width: 'clamp(30rem, 36vw + 8rem, 44rem)',
          maxWidth: '100%',
          paddingTop: 'clamp(5rem, 8vh, 8rem)',
          paddingBottom: 'clamp(3rem, 6vh, 5rem)',
          paddingLeft: '2rem',
          paddingRight: '2rem',
        }}
      >
        <Eyebrow>Frontispiece · the first book</Eyebrow>

        <h1
          style={{
            fontFamily: 'var(--display)',
            fontSize: 'clamp(2.2rem, 2.4vw + 1rem, 3.4rem)',
            fontWeight: 400,
            lineHeight: 1.02,
            letterSpacing: '-0.02em',
            margin: '1.25rem 0 0',
            color: 'var(--fg)',
          }}
        >
          A room
          <br />
          <span style={{ fontStyle: 'italic', color: 'var(--fg-secondary)' }}>for slow reading.</span>
        </h1>

        <p
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: 'clamp(1rem, 0.4vw + 0.9rem, 1.15rem)',
            lineHeight: 1.65,
            color: 'var(--fg-secondary)',
            margin: '1.75rem 0 0',
            maxWidth: '32rem',
          }}
        >
          Bring a book, a notebook, a stack of letters. Loom keeps them side by side and remembers
          the quiet phrase that returns across them.
        </p>

        {phase === 'pick' && (
          <PickPhase
            onPick={pickFolder}
            manualPath={manualPath}
            setManualPath={setManualPath}
            onManualSubmit={() => void saveAndIngest(manualPath.trim())}
            showManualPath={showManualPath}
            setShowManualPath={setShowManualPath}
            error={error}
          />
        )}

        {phase === 'scope' && (
          <ScopePhase
            folder={folder}
            onOpenModal={() => setScopeModalOpen(true)}
            onSkip={() => void skipScopeAndIngestAll()}
            scopeModalOpen={scopeModalOpen}
            onCloseModal={() => setScopeModalOpen(false)}
            onScopeSaved={() => {
              setScopeModalOpen(false);
              setPhase('done');
              setTimeout(() => router.push('/desk'), 600);
            }}
          />
        )}

        {phase === 'scanning' && <ScanningPhase folder={folder} />}

        {phase === 'done' && (
          <p
            style={{
              marginTop: '3rem',
              fontFamily: 'var(--display)',
              fontStyle: 'italic',
              fontSize: '1.25rem',
              color: 'var(--accent-text)',
            }}
          >
            All set — opening Desk…
          </p>
        )}

        {phase === 'error' && (
          <ErrorPhase message={error} onRetry={() => setPhase('pick')} />
        )}
      </section>
    </main>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="loom-smallcaps"
      style={{
        fontFamily: 'var(--serif)',
        fontSize: '0.84rem',
        color: 'var(--muted)',
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Cormorant-italic paper-bordered button, mirroring the mockup's
 * "Open the first book →" affordance. Primary action on first-run.
 */
function VellumButton({
  label,
  onClick,
  disabled,
  tone = 'primary',
}: {
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'ghost';
}) {
  const [hover, setHover] = useState(false);
  const baseStyle: CSSProperties =
    tone === 'primary'
      ? {
          padding: '0.75rem 1.5rem',
          fontFamily: 'var(--display)',
          fontStyle: 'italic',
          fontSize: '1rem',
          letterSpacing: '0.01em',
          color: 'var(--fg)',
          background: hover ? 'var(--accent-soft)' : 'transparent',
          border: '0.5px solid var(--fg)',
          borderRadius: 0,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          transition: 'background 160ms var(--ease, ease), color 160ms var(--ease, ease)',
        }
      : {
          padding: '0.4rem 0',
          marginLeft: '0.25rem',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: '0.9rem',
          color: hover ? 'var(--accent-text)' : 'var(--fg-secondary)',
          background: 'transparent',
          border: 'none',
          borderBottom: '1px solid',
          borderBottomColor: hover ? 'var(--accent)' : 'transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'color 160ms var(--ease, ease), border-bottom-color 160ms var(--ease, ease)',
        };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={baseStyle}
    >
      {label}
    </button>
  );
}

function PickPhase({
  onPick,
  manualPath,
  setManualPath,
  onManualSubmit,
  showManualPath,
  setShowManualPath,
  error,
}: {
  onPick: () => void;
  manualPath: string;
  setManualPath: (v: string) => void;
  onManualSubmit: () => void;
  showManualPath: boolean;
  setShowManualPath: (v: boolean) => void;
  error: string;
}) {
  return (
    <div style={{ marginTop: '3rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <VellumButton label={<>Open the first book&nbsp;&nbsp;→</>} onClick={onPick} />
        <button
          type="button"
          onClick={() => setShowManualPath(!showManualPath)}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: '0.875rem',
            color: 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          or paste a path
        </button>
      </div>

      {showManualPath && (
        <div
          style={{
            marginTop: '1.5rem',
            display: 'flex',
            gap: '0.75rem',
            maxWidth: '32rem',
          }}
        >
          <div style={{ flex: 1 }}>
            <TextInput
              size="md"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="/Users/you/Documents/Study"
            />
          </div>
          <VellumButton
            tone="ghost"
            label="use this path"
            onClick={onManualSubmit}
            disabled={!manualPath.trim()}
          />
        </div>
      )}

      <p
        style={{
          marginTop: '2.5rem',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: '0.8rem',
          color: 'var(--muted)',
          maxWidth: '32rem',
          lineHeight: 1.55,
        }}
      >
        Loom reads the files you already organized — PDFs, slides, notes. Nothing leaves this
        machine.
      </p>

      {error && (
        <p
          style={{
            marginTop: '1rem',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: '0.85rem',
            color: 'var(--tint-red)',
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function ScopePhase({
  folder,
  onOpenModal,
  onSkip,
  scopeModalOpen,
  onCloseModal,
  onScopeSaved,
}: {
  folder: string;
  onOpenModal: () => void;
  onSkip: () => void;
  scopeModalOpen: boolean;
  onCloseModal: () => void;
  onScopeSaved: () => void;
}) {
  return (
    <div style={{ marginTop: '2.75rem', maxWidth: '34rem' }}>
      <div
        style={{
          padding: '1.1rem 1.25rem',
          borderRadius: 'var(--r-2)',
          background: 'var(--mat-thin-bg)',
          border: '0.5px solid var(--mat-border)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--display)',
            fontStyle: 'italic',
            fontSize: '1.05rem',
            color: 'var(--fg)',
          }}
        >
          The room is set.
        </div>
        <div
          style={{
            marginTop: '0.35rem',
            fontFamily: 'var(--mono)',
            fontSize: '0.8rem',
            color: 'var(--fg-secondary)',
            wordBreak: 'break-all',
          }}
        >
          {folder}
        </div>
        <p
          style={{
            marginTop: '0.85rem',
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: '0.9rem',
            color: 'var(--fg-secondary)',
            lineHeight: 1.6,
          }}
        >
          Want Loom to read only certain shelves? Pick the subfolders you care about, or let it
          scan everything.
        </p>
      </div>

      <div
        style={{
          marginTop: '1.5rem',
          display: 'flex',
          gap: '1.5rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <VellumButton label={<>Choose shelves&nbsp;&nbsp;→</>} onClick={onOpenModal} />
        <VellumButton tone="ghost" label="scan everything" onClick={onSkip} />
      </div>

      <ScanScopePicker open={scopeModalOpen} onClose={onCloseModal} onSaved={onScopeSaved} />
    </div>
  );
}

function ScanningPhase({ folder }: { folder: string }) {
  return (
    <div
      style={{
        marginTop: '2.75rem',
        maxWidth: '34rem',
        padding: '1.1rem 1.25rem',
        borderRadius: 'var(--r-2)',
        background: 'var(--mat-thin-bg)',
        border: '0.5px solid var(--mat-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <WeftShuttle width={48} height={10} />
        <span
          style={{
            fontFamily: 'var(--display)',
            fontStyle: 'italic',
            fontSize: '1rem',
            color: 'var(--fg)',
          }}
        >
          Reading the shelves…
        </span>
      </div>
      <p
        style={{
          marginTop: '0.5rem',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: '0.85rem',
          color: 'var(--muted)',
          lineHeight: 1.55,
        }}
      >
        Loom is looking through {folder}, drawing names from syllabi and slide decks. This takes a
        minute the first time.
      </p>
    </div>
  );
}

function ErrorPhase({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      style={{
        marginTop: '2.75rem',
        maxWidth: '34rem',
        padding: '1.1rem 1.25rem',
        borderRadius: 'var(--r-2)',
        background: 'color-mix(in srgb, var(--tint-red) 10%, transparent)',
        border: '0.5px solid color-mix(in srgb, var(--tint-red) 35%, transparent)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--display)',
          fontStyle: 'italic',
          fontSize: '1.05rem',
          color: 'var(--fg)',
        }}
      >
        Something didn’t settle.
      </div>
      <p
        style={{
          marginTop: '0.35rem',
          fontFamily: 'var(--serif)',
          fontStyle: 'italic',
          fontSize: '0.9rem',
          color: 'var(--fg-secondary)',
          lineHeight: 1.55,
        }}
      >
        {message}
      </p>
      <div style={{ marginTop: '1rem' }}>
        <VellumButton tone="ghost" label="try again" onClick={onRetry} />
      </div>
    </div>
  );
}

