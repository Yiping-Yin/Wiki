'use client';
/**
 * CapturePrompt · "What does this mean?"
 *
 * When the user presses ⌘⇧A on selected text, this overlay appears
 * asking them to articulate their understanding in one sentence. The
 * act of writing IS the learning — a silent bookmark is not.
 *
 * Flow:
 *   1. ⌘⇧A with text selected → loom:capture-prompt event fires
 *   2. This component shows a floating prompt near the bottom of screen
 *   3. User types their understanding (or presses Esc to dismiss)
 *   4. ⌘↩ or button saves as a Note with quote + user's content
 *
 * The prompt is intentionally minimal: one textarea, no buttons except
 * save. The friction of writing one sentence is the point — it forces
 * the brain to process the passage.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { contextFromPathname } from '../lib/doc-context';
import { appendNote } from '../lib/note/store';

export function CapturePrompt() {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState('');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectionY, setSelectionY] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Listen for capture-prompt events from SelectionWarp
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent).detail?.quote;
      if (!q) return;
      setQuote(q);
      setDraft('');
      // Get selection position to render near it
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setSelectionY(rect.bottom);
      } else {
        setSelectionY(null);
      }
      setOpen(true);
      // Focus after render
      requestAnimationFrame(() => textareaRef.current?.focus());
    };
    window.addEventListener('loom:capture-prompt', handler);
    return () => window.removeEventListener('loom:capture-prompt', handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuote('');
    setDraft('');
    window.getSelection()?.removeAllRanges();
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    const ctx = contextFromPathname(window.location.pathname);
    if (ctx.isFree || !ctx.docId) { close(); return; }

    setSaving(true);
    try {
      await appendNote({
        docId: ctx.docId,
        docHref: ctx.href,
        docTitle: ctx.sourceTitle,
        content: draft.trim(),
        summary: draft.trim().slice(0, 100),
        anchor: {
          target: ctx.docId,
          quote,
        },
      });
      window.dispatchEvent(new CustomEvent('loom:trace:changed'));
      window.dispatchEvent(new CustomEvent('wiki:highlights:changed'));
      close();
    } catch {
      // Silent fail — the note store handles errors
    } finally {
      setSaving(false);
    }
  }, [draft, quote, saving, close]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }, [save, close]);

  if (!open) return null;

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 950,
        display: 'flex',
        // Position near the selection if possible, otherwise bottom
        alignItems: selectionY && selectionY < (typeof window !== 'undefined' ? window.innerHeight * 0.6 : 400)
          ? 'flex-start' : 'flex-end',
        justifyContent: 'center',
        paddingTop: selectionY && selectionY < (typeof window !== 'undefined' ? window.innerHeight * 0.6 : 400)
          ? Math.min(selectionY + 8, (typeof window !== 'undefined' ? window.innerHeight : 800) - 250) : 0,
        paddingBottom: selectionY && selectionY < (typeof window !== 'undefined' ? window.innerHeight * 0.6 : 400)
          ? 0 : 40,
        paddingLeft: 20,
        paddingRight: 20,
        background: 'color-mix(in srgb, var(--bg) 40%, transparent)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        animation: 'loom-overlay-fade-in 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--mat-border)',
          borderRadius: 14,
          padding: '14px 16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
          animation: 'loom-overlay-fade-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* Quote preview */}
        <div
          style={{
            fontSize: '0.78rem',
            color: 'var(--muted)',
            fontStyle: 'italic',
            lineHeight: 1.45,
            marginBottom: 10,
            paddingLeft: 10,
            borderLeft: '2px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            maxHeight: 60,
            overflow: 'hidden',
          }}
        >
          &ldquo;{quote.length > 120 ? quote.slice(0, 120) + '…' : quote}&rdquo;
        </div>

        {/* Prompt */}
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="What does this mean? (your words)"
          style={{
            width: '100%',
            minHeight: 56,
            maxHeight: 120,
            padding: '8px 10px',
            fontFamily: 'var(--display)',
            fontSize: '0.88rem',
            lineHeight: 1.5,
            color: 'var(--fg)',
            background: 'var(--bg)',
            border: '0.5px solid var(--mat-border)',
            borderRadius: 6,
            outline: 'none',
            resize: 'none',
          }}
        />

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
            fontSize: '0.66rem',
            color: 'var(--muted)',
            fontFamily: 'var(--mono)',
          }}
        >
          <span>⌘↩ save · Esc cancel</span>
          <span style={{ flex: 1 }} />
          {draft.trim() && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              style={{
                padding: '4px 12px',
                fontSize: '0.72rem',
                fontWeight: 600,
                color: 'var(--bg)',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
