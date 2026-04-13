'use client';
/**
 * CrystallizeListener · when AI Examiner passes a doc, marks it as
 * crystallized. Stores crystallized docIds in localStorage.
 *
 * Crystallized = verified knowledge. Passive Fading skips these notes.
 * The ReviewThoughtMap shows a ◈ indicator on crystallized docs.
 */
import { useEffect } from 'react';

const LS_KEY = 'loom:crystallized';

export function getCrystallizedDocs(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function isDocCrystallized(docId: string): boolean {
  return getCrystallizedDocs().has(docId);
}

export function CrystallizeListener() {
  useEffect(() => {
    const handler = (e: Event) => {
      const docId = (e as CustomEvent).detail?.docId;
      if (!docId) return;
      try {
        const set = getCrystallizedDocs();
        set.add(docId);
        localStorage.setItem(LS_KEY, JSON.stringify([...set]));
        // Notify UI
        window.dispatchEvent(new CustomEvent('loom:trace:changed'));
      } catch {}
    };
    window.addEventListener('loom:crystallize', handler);
    return () => window.removeEventListener('loom:crystallize', handler);
  }, []);

  return null;
}
