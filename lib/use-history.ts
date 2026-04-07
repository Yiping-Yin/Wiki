'use client';
import { useEffect, useState, useCallback } from 'react';

const KEY = 'wiki:history:v1';
const MAX = 100;

export type HistoryEntry = { id: string; title: string; href: string; viewedAt: number };

function read(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch { return []; }
}

function write(entries: HistoryEntry[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
}

export function useHistory(): [HistoryEntry[], (e: Omit<HistoryEntry, 'viewedAt'>) => void, () => void] {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => { setEntries(read()); }, []);

  const track = useCallback((e: Omit<HistoryEntry, 'viewedAt'>) => {
    const cur = read();
    const filtered = cur.filter((x) => x.id !== e.id);
    const next = [{ ...e, viewedAt: Date.now() }, ...filtered].slice(0, MAX);
    write(next);
    setEntries(next);
  }, []);

  const clear = useCallback(() => { write([]); setEntries([]); }, []);

  return [entries, track, clear];
}
