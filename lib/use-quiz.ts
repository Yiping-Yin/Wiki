'use client';
import { useEffect, useState, useCallback } from 'react';

const KEY = 'wiki:quiz:results:v1';
const MAX = 200;

export type QuizResult = {
  docId: string;
  score: number;
  total: number;
  attemptedAt: number;
};

function read(): QuizResult[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(rs: QuizResult[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(rs.slice(0, MAX)));
}

export function useQuizResults(): [QuizResult[], (r: Omit<QuizResult, 'attemptedAt'>) => void, () => void] {
  const [results, setResults] = useState<QuizResult[]>([]);
  useEffect(() => { setResults(read()); }, []);

  const record = useCallback((r: Omit<QuizResult, 'attemptedAt'>) => {
    const cur = read();
    // keep latest attempt per doc; replace if exists
    const filtered = cur.filter((x) => x.docId !== r.docId);
    const next = [{ ...r, attemptedAt: Date.now() }, ...filtered].slice(0, MAX);
    write(next);
    setResults(next);
  }, []);

  const clear = useCallback(() => { write([]); setResults([]); }, []);

  return [results, record, clear];
}

/** weakest = score / total < 0.67 */
export function isWeak(r: QuizResult): boolean {
  return r.total > 0 && r.score / r.total < 0.67;
}
