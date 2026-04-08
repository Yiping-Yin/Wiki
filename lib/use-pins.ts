'use client';
import { useEffect, useState, useCallback } from 'react';

const KEY = 'wiki:pins:v1';

export type PinnedDoc = { id: string; title: string; href: string; pinnedAt: number };

function read(): PinnedDoc[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(p: PinnedDoc[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(p));
  // notify same-tab listeners
  window.dispatchEvent(new CustomEvent('wiki:pins:changed'));
}

export function usePins(): {
  pins: PinnedDoc[];
  isPinned: (id: string) => boolean;
  toggle: (entry: Omit<PinnedDoc, 'pinnedAt'>) => void;
  unpin: (id: string) => void;
} {
  const [pins, setPins] = useState<PinnedDoc[]>([]);

  useEffect(() => {
    setPins(read());
    const onChange = () => setPins(read());
    window.addEventListener('wiki:pins:changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('wiki:pins:changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const isPinned = useCallback((id: string) => pins.some((p) => p.id === id), [pins]);

  const toggle = useCallback((entry: Omit<PinnedDoc, 'pinnedAt'>) => {
    const cur = read();
    const exists = cur.some((p) => p.id === entry.id);
    const next = exists
      ? cur.filter((p) => p.id !== entry.id)
      : [{ ...entry, pinnedAt: Date.now() }, ...cur].slice(0, 50);
    write(next);
    setPins(next);
  }, []);

  const unpin = useCallback((id: string) => {
    const next = read().filter((p) => p.id !== id);
    write(next);
    setPins(next);
  }, []);

  return { pins, isPinned, toggle, unpin };
}
