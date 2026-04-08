'use client';
import { useState, useEffect } from 'react';
import { useQuizResults } from '../lib/use-quiz';

type Question = { q: string; choices: string[]; correct: number; explain: string };
type Quiz = { questions: Question[]; cached?: boolean; error?: string };

export function DocQuiz({ id }: { id: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [, recordQuizResult] = useQuizResults();
  const [recorded, setRecorded] = useState(false);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? 'failed');
      else setQuiz(j);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  if (!quiz && !loading && !error) {
    return (
      <div style={{
        margin: '1.2rem 0', padding: '0.8rem 1rem',
        border: '1px dashed var(--border)', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--code-bg)',
      }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          🧠 Test your understanding with 3 AI-generated questions
        </span>
        <button
          onClick={generate}
          style={{
            background: 'var(--accent)', color: '#fff', border: 0,
            borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.82rem',
          }}
        >Quiz me</button>
      </div>
    );
  }

  if (loading) return <div style={{ margin: '1.2rem 0', padding: '1rem', border: '1px solid var(--border)', borderRadius: 8, fontSize: '0.85rem', color: 'var(--muted)' }}>🧠 Generating questions…</div>;
  if (error) return <div style={{ margin: '1.2rem 0', padding: '0.8rem 1rem', border: '1px solid #d97706', borderRadius: 8, background: 'rgba(217,119,6,0.08)', fontSize: '0.85rem' }}>⚠ {error}</div>;
  if (!quiz) return null;

  const score = Object.entries(answers).filter(([i, c]) => quiz.questions[+i]?.correct === c && revealed[+i]).length;
  const allAnswered = quiz.questions.every((_, i) => answers[i] !== undefined);
  const allRevealed = quiz.questions.every((_, i) => revealed[i]);

  if (allRevealed && !recorded) {
    setRecorded(true);
    recordQuizResult({ docId: id, score, total: quiz.questions.length });
  }

  return (
    <div style={{
      margin: '1.2rem 0', padding: '1rem 1.2rem',
      border: '1px solid var(--border)', borderRadius: 10,
      background: 'linear-gradient(135deg, rgba(34,197,94,0.05), rgba(20,184,166,0.05))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
          🧠 Quiz {quiz.cached && <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· cached</span>}
        </span>
        {Object.keys(revealed).length === quiz.questions.length && (
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: score === quiz.questions.length ? '#16a34a' : 'var(--accent)' }}>
            Score {score} / {quiz.questions.length}
          </span>
        )}
      </div>

      {quiz.questions.map((q, i) => {
        const userAns = answers[i];
        const isRevealed = revealed[i];
        return (
          <div key={i} style={{ marginBottom: '1.2rem', paddingBottom: '1rem', borderBottom: i === quiz.questions.length - 1 ? 'none' : '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: 6 }}>
              {i + 1}. {q.q}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {q.choices.map((c, j) => {
                const selected = userAns === j;
                const correct = isRevealed && j === q.correct;
                const wrong = isRevealed && selected && j !== q.correct;
                return (
                  <button
                    key={j}
                    onClick={() => !isRevealed && setAnswers((a) => ({ ...a, [i]: j }))}
                    disabled={isRevealed}
                    style={{
                      textAlign: 'left', padding: '0.5rem 0.8rem', borderRadius: 6,
                      border: '1px solid ' + (correct ? '#16a34a' : wrong ? '#dc2626' : selected ? 'var(--accent)' : 'var(--border)'),
                      background: correct ? 'rgba(34,197,94,0.12)' : wrong ? 'rgba(220,38,38,0.12)' : selected ? 'rgba(37,99,235,0.08)' : 'var(--bg)',
                      color: 'var(--fg)', cursor: isRevealed ? 'default' : 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    <span style={{ fontWeight: 600, marginRight: 6 }}>{String.fromCharCode(65 + j)}.</span>
                    {c}
                    {correct && <span style={{ marginLeft: 8, color: '#16a34a' }}>✓</span>}
                    {wrong && <span style={{ marginLeft: 8, color: '#dc2626' }}>✗</span>}
                  </button>
                );
              })}
            </div>
            {!isRevealed && userAns !== undefined && (
              <button
                onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                style={{ marginTop: 8, background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 10px', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--muted)' }}
              >Reveal</button>
            )}
            {isRevealed && q.explain && (
              <div style={{ marginTop: 8, padding: '0.5rem 0.8rem', background: 'var(--code-bg)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                💡 {q.explain}
              </div>
            )}
          </div>
        );
      })}

      {allAnswered && Object.keys(revealed).length < quiz.questions.length && (
        <button
          onClick={() => setRevealed(Object.fromEntries(quiz.questions.map((_, i) => [i, true])))}
          style={{ background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.82rem' }}
        >Reveal all</button>
      )}
    </div>
  );
}
