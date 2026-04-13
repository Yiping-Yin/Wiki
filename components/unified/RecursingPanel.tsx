'use client';
/**
 * RecursingPanel · Phase 6 (Recursing) component.
 *
 * Implements fractal recursion: takes a past reconstruction and treats it
 * as a NEW source to learn from. This is the closing step of Loom's
 * learning loop — "your own reconstruction of concept A becomes the
 * material you'll reconstruct concept Ω from later".
 *
 * Behavior:
 *   - List all past reconstructions (Notes with blockId='loom-rehearsal-root')
 *   - Click one → it becomes the "focused reconstruction"
 *   - Focus reveals the reconstruction's full content
 *   - A "→ Use as new source" action promotes the reconstruction's note id
 *     to a docId-like thing (note:<id>) that other panels can anchor to
 *
 * This is the MVP. The full fractal loop (new captures anchored to the
 * reconstruction → new rehearsal on it → another reconstruction at higher
 * level) requires a small extension of the Note anchor model that's
 * already in place (anchor.target can be a NoteId).
 *
 * Status: UI-only. The "Use as new source" button writes nothing — it
 * emits an event the dev route can listen to for switching context.
 */
import { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Note } from '../../lib/note/types';

const MarkdownNote = dynamic(
  () => import('../NoteRenderer').then((m) => m.NoteRenderer),
  { ssr: false },
);

type Props = {
  /** All notes in the Personal Layer — filtered internally for reconstructions. */
  allNotes: Note[];
  /** Callback when user promotes a reconstruction to "new source". */
  onPromote?: (note: Note) => void;
};

export function RecursingPanel({ allNotes, onPromote }: Props) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // A "reconstruction" is a Note whose anchor.blockId is 'loom-rehearsal-root'
  // (written by RehearsalPanel via store.appendRehearsal).
  const reconstructions = useMemo(() => {
    return allNotes
      .filter((n) => n.anchor.blockId === 'loom-rehearsal-root')
      .sort((a, b) => b.at - a.at);
  }, [allNotes]);

  const focal = useMemo(() => {
    if (!focusedId) return reconstructions[0] ?? null;
    return reconstructions.find((n) => n.id === focusedId) ?? reconstructions[0] ?? null;
  }, [focusedId, reconstructions]);

  const promote = useCallback(() => {
    if (!focal || !onPromote) return;
    onPromote(focal);
  }, [focal, onPromote]);

  if (reconstructions.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
          fontStyle: 'italic',
          padding: 40,
          fontSize: '0.85rem',
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        <div style={{ maxWidth: 320 }}>
          No past reconstructions yet.
          <br />
          Do a rehearsal in <strong>Producing (⌘4)</strong> first, then come
          back here to promote it as a new source.
        </div>
      </div>
    );
  }

  return (
    <div
      className="loom-unified-recursing"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        padding: 12,
        gap: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          fontSize: '0.7rem',
          color: 'var(--muted)',
          fontFamily: 'var(--mono)',
        }}
      >
        {reconstructions.length} reconstruction{reconstructions.length === 1 ? '' : 's'} in your Personal Layer
      </div>

      {/* List of reconstructions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxHeight: '40%',
          overflow: 'auto',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 8,
          padding: 8,
        }}
      >
        {reconstructions.map((n) => {
          const isFocal = focal?.id === n.id;
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setFocusedId(n.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                borderRadius: 6,
                border: '0.5px solid ' + (isFocal ? 'var(--accent)' : 'var(--mat-border)'),
                background: isFocal
                  ? 'color-mix(in srgb, var(--accent) 8%, var(--bg))'
                  : 'var(--bg)',
                color: isFocal ? 'var(--fg)' : 'var(--fg-secondary)',
                cursor: 'pointer',
                fontSize: '0.76rem',
                lineHeight: 1.45,
                fontFamily: 'var(--display)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 2,
                }}
              >
                <span
                  style={{
                    fontSize: '0.6rem',
                    color: 'var(--muted)',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  {new Date(n.at).toLocaleDateString()}
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    color: 'var(--muted)',
                    opacity: 0.8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {n.anchor.target ?? 'untargeted'}
                </span>
              </div>
              <div
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}
              >
                {n.summary ?? n.content.slice(0, 120)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Focal reconstruction preview */}
      {focal && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <strong style={{ fontSize: '0.72rem', color: 'var(--accent)' }}>
              Focused reconstruction
            </strong>
            <span
              style={{
                fontSize: '0.64rem',
                color: 'var(--muted)',
                fontFamily: 'var(--mono)',
              }}
            >
              {new Date(focal.at).toLocaleString()}
            </span>
            <span aria-hidden style={{ flex: 1 }} />
            {onPromote && (
              <button
                type="button"
                onClick={promote}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  background: 'var(--accent)',
                  color: 'var(--bg)',
                  border: 0,
                  borderRadius: 5,
                  cursor: 'pointer',
                }}
                title="Use this reconstruction as a new source for further learning"
              >
                → Use as new source
              </button>
            )}
          </div>

          <div
            className="note-rendered"
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '12px 14px',
              fontSize: '0.84rem',
              lineHeight: 1.6,
              background: 'color-mix(in srgb, var(--accent) 3%, var(--bg))',
              border: '0.5px dashed var(--mat-border)',
              borderRadius: 8,
              userSelect: 'text',
            }}
          >
            <MarkdownNote source={focal.content} />
          </div>
        </div>
      )}
    </div>
  );
}
