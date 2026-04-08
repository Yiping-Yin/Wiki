'use client';
import { useEffect, useState } from 'react';

const KEY = 'wiki:chat:model'; // shared with ChatPanel
const EVENT = 'wiki:cli-model:changed';

export type CliKind = 'claude' | 'codex';

export function getCliModel(): CliKind {
  if (typeof window === 'undefined') return 'claude';
  const v = localStorage.getItem(KEY);
  return v === 'codex' ? 'codex' : 'claude';
}

export function setCliModel(v: CliKind) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, v);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useCliModel(): [CliKind, (v: CliKind) => void] {
  const [m, setM] = useState<CliKind>('claude');
  useEffect(() => {
    setM(getCliModel());
    const onChange = () => setM(getCliModel());
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return [m, (v) => { setCliModel(v); setM(v); }];
}
