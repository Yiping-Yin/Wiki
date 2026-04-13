'use client';
/**
 * ReviewMode · §37/§38 + Capture pivot 2026-04-11
 *
 * ⌘/ toggles the right-side ReviewThoughtMap between its default
 * narrow navigation state and a wide writable state. No canvas, no
 * ReviewSheet — the map itself is the thinking surface.
 *
 * While wide is active, `body.loom-study-mode` stays on so existing
 * AnchorDot dim/hide behavior keeps working; the narrow state is the
 * default non-study reading state.
 *
 * History: this previously mounted <CanvasLayer> (Stage 0 thinking
 * canvas, 2D draggable cards). That was judged wrong after user
 * burden feedback and external research; see memory/project_canvas_pivot.md.
 * Before canvas it mounted <ReviewSheet>. The map is now the final
 * surface.
 *
 * Esc or ⌘/ again exits wide mode.
 */
import { useEffect, useState } from 'react';
import { ReviewThoughtMap } from './ReviewThoughtMap';
import { REVIEW_RESUME_KEY, type ReviewResumePayload } from '../lib/review-resume';

const STUDY_CLASS = 'loom-study-mode';

export function ReviewMode() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        !!target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.isContentEditable);

      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setActive((a) => !a);
        return;
      }

      if (e.key === 'Escape' && active) {
        // Escape inside an editable field is a local action (dismiss the
        // textarea / close the expanded card). Let the field's own
        // onKeyDown handle it — don't also collapse the whole wide mode
        // out from under the user.
        if (inEditable) return;
        e.preventDefault();
        setActive(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  useEffect(() => {
    const onSet = (e: Event) => {
      const next = (e as CustomEvent).detail?.active;
      if (typeof next === 'boolean') setActive(next);
    };
    window.addEventListener('loom:review:set-active', onSet);
    return () => window.removeEventListener('loom:review:set-active', onSet);
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(REVIEW_RESUME_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw) as ReviewResumePayload;
      if (!payload?.href || payload.href !== window.location.pathname) return;
      sessionStorage.removeItem(REVIEW_RESUME_KEY);
      setActive(true);
      requestAnimationFrame(() => {
        if (payload.anchorId) {
          window.dispatchEvent(
            new CustomEvent('loom:review:focus-thought', {
              detail: { anchorId: payload.anchorId },
            }),
          );
        }
      });
    } catch {}
  }, []);

  // Toggle body class
  useEffect(() => {
    if (active) document.body.classList.add(STUDY_CLASS);
    else document.body.classList.remove(STUDY_CLASS);
    return () => { document.body.classList.remove(STUDY_CLASS); };
  }, [active]);

  // Dispatch a custom event so AnchorDots know to show all cards
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('loom:study-mode', { detail: { active } }));
  }, [active]);

  return <ReviewThoughtMap active={active} />;
}

export { ReviewMode as CoworkSplit };
