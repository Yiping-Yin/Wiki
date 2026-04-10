'use client';
/**
 * ReviewMode · §37/§38 · centered Live Note review
 *
 * Triggered by ⌘/. The source recedes; a centered glass Live Note becomes
 * the primary object of attention; a companion thought map sits to its
 * right, the way Source sits beside the main stage during reading.
 *
 * Esc or ⌘/ again exits study mode.
 */
import { useEffect, useState } from 'react';
import { ReviewSheet } from './ReviewSheet';
import { ReviewThoughtMap } from './ReviewThoughtMap';

const STUDY_CLASS = 'loom-study-mode';

export function ReviewMode() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setActive((a) => !a);
      } else if (e.key === 'Escape' && active) {
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

  return (
    <>
      <ReviewSheet active={active} />
      <ReviewThoughtMap active={active} />
    </>
  );
}

export { ReviewMode as CoworkSplit };
