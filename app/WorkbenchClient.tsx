'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * WorkbenchClient — a minimal, paper-feeling writing surface.
 *
 * - Full-screen paper; center column is the ruled "page"
 * - contenteditable div with faint ruled lines (30px grid)
 * - Top-right meta chip: word count in oldstyle numerals
 * - localStorage key `loom.workbench.current`, debounced ~400ms
 * - ⌘/ dispatches a `loom:workbench:review` event carrying the text,
 *   so a future tick can hand the draft to the Review vellum to
 *   summarize. For now this is just the hook — the vellum wiring lives
 *   elsewhere.
 *
 * Design notes:
 * - Text renders in EB Garamond 17.5 / 30, the same line-height as the
 *   ruling, so every line sits on a rule like real paper. We avoid
 *   inventing a new contenteditable parser — the browser handles plain
 *   text perfectly for a draft surface.
 * - Placeholder uses the `:empty` pseudo approach in globals.css so we
 *   don't have to micromanage an empty-string React state to keep the
 *   placeholder visible.
 * - Save is debounced to avoid a localStorage write on every keystroke;
 *   400ms matches the feel of Apple's autosave cadence in Pages.
 */
const STORAGE_KEY = 'loom.workbench.current';
const SAVE_DEBOUNCE_MS = 400;

export default function WorkbenchClient() {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState<string>('');
  const [restored, setRestored] = useState(false);

  // Restore draft on mount. Done in an effect because localStorage is not
  // accessible during SSR / static export.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && editorRef.current) {
        editorRef.current.textContent = saved;
        setText(saved);
      }
    } catch {
      // localStorage can throw under Safari Private Mode. A draft surface
      // without persistence is still better than a crash.
    }
    setRestored(true);
  }, []);

  // Debounced localStorage save. The ref pattern avoids re-creating the
  // timer on every keystroke-driven text update.
  const saveTimer = useRef<number | null>(null);
  const scheduleSave = useCallback((next: string) => {
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Same Safari Private Mode consideration as above.
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current != null) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, []);

  const onInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    // `innerText` preserves newlines across browsers better than
    // `textContent` for contenteditable with soft line breaks, which is
    // what we want for a word count and persisted draft.
    const next = el.innerText ?? '';
    setText(next);
    scheduleSave(next);
  }, [scheduleSave]);

  // ⌘/ → open Review vellum with the current text. The vellum itself is
  // document-bound elsewhere in the codebase; we emit the event and let
  // whichever listener is attached handle it. Falls back to a no-op when
  // nothing is listening, which is fine — this page is useful standalone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && e.key === '/') {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent('loom:workbench:review', {
            detail: { text },
          }),
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [text]);

  // Word count — naive split on whitespace, ignoring empty tokens. Good
  // enough for a draft surface; Pages uses the same heuristic.
  const wordCount = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }, [text]);

  return (
    <div className="loom-workbench">
      {/* Meta chip — fixed top-right. Shows word count in oldstyle numerals
          so it sits quietly in the serif typography without looking like a
          dashboard stat. */}
      <div className="loom-workbench-meta" aria-live="polite">
        <span className="loom-workbench-meta-number">{wordCount}</span>{' '}
        {wordCount === 1 ? 'word' : 'words'}
      </div>

      <section className="loom-workbench-page">
        <div
          ref={editorRef}
          className="loom-workbench-editor"
          contentEditable={restored}
          suppressContentEditableWarning
          role="textbox"
          aria-label="Workbench draft"
          aria-multiline="true"
          spellCheck
          data-placeholder="Begin writing. The loom is listening."
          onInput={onInput}
        />
      </section>
    </div>
  );
}
