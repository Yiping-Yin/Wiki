export const LOOM_CRYSTALLIZED_EVENT = 'loom:crystallized:panel';

export type CrystallizedDetail = {
  docId: string;
  href?: string;
  summary?: string;
};

export function dispatchCrystallized(detail: CrystallizedDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LOOM_CRYSTALLIZED_EVENT, { detail }));
}
