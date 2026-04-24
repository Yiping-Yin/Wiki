'use client';
/**
 * SelectionEditToolbar · GPT-style span-level edit verbs, bounded by protocol.
 *
 * Verbs: Tighten, Expand. Expand requires a getContext() for citation-backed
 * length growth; Tighten is context-free (shortening can't invent claims).
 *
 * Protocol discipline: every verb has a server-side contract (length bounds,
 * citation verbatim check). A validation failure returns `{ok:false}` and the
 * UI surfaces the reason instead of silently replacing the selection.
 *
 * Revert: after a successful replacement the toolbar morphs into a Revert
 * banner for REVERT_WINDOW_MS. Since AI replacements are React state updates,
 * the browser's native undo stack does not capture them. Revert restores the
 * pre-edit text and re-selects it so the user can try again.
 */

import { useEffect, useRef, useState } from 'react';
import {
  expandSelection,
  rewriteSelection,
  tightenSelection,
  type Citation as SelectionCitation,
} from '../lib/selection-edit-client';

export type SelectionEditVerb = 'tighten' | 'expand' | 'rewrite';

type Props = {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  verbs: SelectionEditVerb[];
  onReplace: (start: number, end: number, newText: string) => void;
  getContext?: () => string;
};

const MIN_SEL_CHARS = 4;

type Citation = { span: string; from: string };

type RevertState = {
  verb: SelectionEditVerb;
  start: number;
  origText: string;
  replacedLen: number;
  citations: Citation[];
};

export function SelectionEditToolbar({ targetRef, verbs, onReplace, getContext }: Props) {
  const [rect, setRect] = useState<{ top: number; right: number } | null>(null);
  const [busy, setBusy] = useState<SelectionEditVerb | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revert, setRevert] = useState<RevertState | null>(null);
  const [rewritePrompt, setRewritePrompt] = useState<string | null>(null);
  const [citationsOpen, setCitationsOpen] = useState(false);
  const capturedRange = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    const recalc = () => {
      const el = targetRef.current;
      if (!el) { setRect(null); return; }
      if (document.activeElement !== el) {
        if (!revert) setRect(null);
        return;
      }
      const { selectionStart, selectionEnd } = el;
      if (selectionStart == null || selectionEnd == null) { setRect(null); return; }
      if (selectionEnd - selectionStart < MIN_SEL_CHARS) {
        if (!revert) setRect(null);
        return;
      }
      // A new, meaningful selection supersedes any lingering revert banner
      // — the user has moved on and will expect the edit verbs back.
      if (revert) {
        setRevert(null);
        setCitationsOpen(false);
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top - 38, right: r.right });
      capturedRange.current = { start: selectionStart, end: selectionEnd };
      setError(null);
    };
    document.addEventListener('selectionchange', recalc);
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      document.removeEventListener('selectionchange', recalc);
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [targetRef, revert]);

  // Keep the toolbar anchored to the textarea while a revert banner is alive,
  // even if the selection collapsed after the replacement.
  useEffect(() => {
    if (!revert) return;
    const el = targetRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - 38, right: r.right });
  }, [revert, targetRef]);

  // Outside-click dismiss for the citation popover.
  useEffect(() => {
    if (!citationsOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-loom-selection-toolbar]')) return;
      setCitationsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [citationsOpen]);

  const runVerb = async (verb: SelectionEditVerb, instruction?: string) => {
    const el = targetRef.current;
    const range = capturedRange.current;
    if (!el || !range) return;
    const selText = el.value.slice(range.start, range.end);
    if (!selText.trim()) return;

    setBusy(verb);
    setError(null);
    try {
      const context =
        (verb === 'expand' || verb === 'rewrite') && getContext
          ? getContext()
          : undefined;

      let data: Awaited<ReturnType<typeof tightenSelection>>;
      if (verb === 'tighten') {
        data = await tightenSelection({ text: selText, context });
      } else if (verb === 'expand') {
        data = await expandSelection({ text: selText, context });
      } else {
        if (!instruction || !instruction.trim()) {
          setError('instruction required');
          return;
        }
        data = await rewriteSelection({
          text: selText,
          context,
          instruction: instruction.trim(),
        });
      }

      if (!data.ok) {
        setError(data.reason || 'edit refused');
        return;
      }
      onReplace(range.start, range.end, data.text);
      setRevert({
        verb,
        start: range.start,
        origText: selText,
        replacedLen: data.text.length,
        citations: (data.citations ?? []) as SelectionCitation[] as Citation[],
      });
      setCitationsOpen(false);
      setRewritePrompt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const doRevert = () => {
    if (!revert) return;
    const { start, origText, replacedLen } = revert;
    onReplace(start, start + replacedLen, origText);
    setRevert(null);
    setCitationsOpen(false);
    requestAnimationFrame(() => {
      const el = targetRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, start + origText.length);
    });
  };

  if (!rect && !revert) return null;
  if (!rect) return null;

  const verbLabel = (v: SelectionEditVerb) =>
    v === 'tighten' ? 'tightened' : v === 'expand' ? 'expanded' : 'rewritten';

  return (
    <div
      data-loom-selection-toolbar="true"
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        top: rect.top,
        left: rect.right,
        transform: 'translateX(-100%)',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        borderRadius: 'var(--r-2)',
        border: '0.5px solid var(--mat-border)',
        background: 'color-mix(in srgb, var(--bg) 94%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 2px 10px color-mix(in srgb, var(--fg) 8%, transparent)',
        zIndex: 50,
        fontFamily: 'var(--mono)',
        fontSize: '0.72rem',
      }}
    >
      {revert ? (
        <>
          <span style={{ color: 'var(--fg-secondary)', padding: '0 4px' }}>
            {verbLabel(revert.verb)}
          </span>
          <button
            type="button"
            onClick={doRevert}
            title="Restore the original text"
            style={{
              padding: '3px 7px',
              borderRadius: 'var(--r-1)',
              border: 0,
              background: 'transparent',
              color: 'var(--accent)',
              cursor: 'pointer',
              font: 'inherit',
              fontWeight: 600,
            }}
          >
            ↶ Revert
          </button>
          {revert.citations.length > 0 && (
            <button
              type="button"
              onClick={() => setCitationsOpen((v) => !v)}
              title={`${revert.citations.length} verbatim citation${revert.citations.length > 1 ? 's' : ''} traced back to context`}
              style={{
                padding: '3px 7px',
                borderRadius: 'var(--r-1)',
                border: 0,
                background: citationsOpen ? 'var(--mat-thin-bg)' : 'transparent',
                color: 'var(--fg-secondary)',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              ⓘ {revert.citations.length}
            </button>
          )}
          {citationsOpen && revert.citations.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 30,
                right: 0,
                width: 340,
                maxHeight: 260,
                overflowY: 'auto',
                padding: '8px 10px',
                borderRadius: 'var(--r-2)',
                border: '0.5px solid var(--mat-border)',
                background: 'color-mix(in srgb, var(--bg) 96%, transparent)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 4px 14px color-mix(in srgb, var(--fg) 10%, transparent)',
                fontFamily: 'var(--display)',
                fontSize: '0.72rem',
                lineHeight: 1.5,
                color: 'var(--fg)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontVariant: 'small-caps',
                  textTransform: 'lowercase',
                  fontSize: '0.72rem',
                  color: 'var(--muted)',
                  letterSpacing: '0.08em',
                  fontWeight: 500,
                }}
              >
                citations · verified verbatim
              </div>
              {revert.citations.map((c, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ color: 'var(--accent)' }}>
                    &ldquo;{c.span}&rdquo;
                  </div>
                  <div style={{ color: 'var(--fg-secondary)', fontStyle: 'italic', paddingLeft: 10, borderLeft: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                    ← {c.from}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {verbs.includes('tighten') && (
            <button
              type="button"
              onClick={() => void runVerb('tighten')}
              disabled={busy !== null}
              title="Shorten this selection. Claims preserved; 30–80% of original length."
              style={{
                padding: '3px 7px',
                borderRadius: 'var(--r-1)',
                border: 0,
                background: busy === 'tighten' ? 'var(--mat-thin-bg)' : 'transparent',
                color: 'var(--fg)',
                cursor: busy ? 'wait' : 'pointer',
                font: 'inherit',
              }}
            >
              {busy === 'tighten' ? '… tightening' : '✂ Tighten'}
            </button>
          )}
          {verbs.includes('expand') && (
            <button
              type="button"
              onClick={() => void runVerb('expand')}
              disabled={busy !== null}
              title="Lengthen this selection. AI must cite every new claim back to provided context; 130–200% of original length."
              style={{
                padding: '3px 7px',
                borderRadius: 'var(--r-1)',
                border: 0,
                background: busy === 'expand' ? 'var(--mat-thin-bg)' : 'transparent',
                color: 'var(--fg)',
                cursor: busy ? 'wait' : 'pointer',
                font: 'inherit',
              }}
            >
              {busy === 'expand' ? '… expanding' : '▤ Expand'}
            </button>
          )}
          {verbs.includes('rewrite') && (
            rewritePrompt === null ? (
              <button
                type="button"
                onClick={() => setRewritePrompt('')}
                disabled={busy !== null}
                title="Rewrite this selection per your instruction. Length 50–200%; new claims must be cited to context."
                style={{
                  padding: '3px 7px',
                  borderRadius: 'var(--r-1)',
                  border: 0,
                  background: 'transparent',
                  color: 'var(--fg)',
                  cursor: busy ? 'wait' : 'pointer',
                  font: 'inherit',
                }}
              >
                ✎ Rewrite
              </button>
            ) : (
              <>
                <input
                  type="text"
                  autoFocus
                  value={rewritePrompt}
                  onChange={(e) => setRewritePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void runVerb('rewrite', rewritePrompt);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setRewritePrompt(null);
                    }
                  }}
                  placeholder="How? (⏎ run · esc cancel)"
                  disabled={busy !== null}
                  style={{
                    padding: '3px 6px',
                    borderRadius: 'var(--r-1)',
                    border: '0.5px solid var(--mat-border)',
                    background: 'var(--mat-thin-bg)',
                    color: 'var(--fg)',
                    font: 'inherit',
                    minWidth: 180,
                  }}
                />
                <button
                  type="button"
                  onClick={() => void runVerb('rewrite', rewritePrompt)}
                  disabled={busy !== null || !rewritePrompt.trim()}
                  style={{
                    padding: '3px 7px',
                    borderRadius: 'var(--r-1)',
                    border: 0,
                    background: busy === 'rewrite' ? 'var(--mat-thin-bg)' : 'transparent',
                    color: 'var(--accent)',
                    cursor: busy ? 'wait' : 'pointer',
                    font: 'inherit',
                    fontWeight: 600,
                  }}
                >
                  {busy === 'rewrite' ? '…' : '↵'}
                </button>
              </>
            )
          )}
          {error && (
            <span style={{ color: 'var(--tint-red, #c94a4a)', fontSize: '0.66rem', paddingLeft: 4 }}>
              {error}
            </span>
          )}
        </>
      )}
    </div>
  );
}
