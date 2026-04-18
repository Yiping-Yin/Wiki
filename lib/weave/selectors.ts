'use client';

import type { Weave } from './types';

export function weavePersistedEqual(a: Weave | null | undefined, b: Weave | null | undefined): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}
