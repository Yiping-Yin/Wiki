'use client';
import { useEffect, useState, useCallback } from 'react';

const PREFIX = 'wiki:notes:';
const INDEX_KEY = 'wiki:notes:index';

function readIndex(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]'); } catch { return []; }
}
function writeIndex(ids: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(INDEX_KEY, JSON.stringify(Array.from(new Set(ids))));
}

export function useNote(id: string): [string, (v: string) => void, boolean] {
  const key = PREFIX + id;
  const [value, setValue] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setValue(localStorage.getItem(key) ?? '');
    setLoaded(true);
  }, [key]);

  const update = useCallback((v: string) => {
    setValue(v);
    if (v) {
      localStorage.setItem(key, v);
      const idx = readIndex();
      if (!idx.includes(id)) writeIndex([...idx, id]);
    } else {
      localStorage.removeItem(key);
      writeIndex(readIndex().filter((x) => x !== id));
    }
  }, [key, id]);

  return [value, update, loaded];
}

export function useNotedIds(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    setIds(readIndex());
    const onStorage = () => setIds(readIndex());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  return ids;
}
