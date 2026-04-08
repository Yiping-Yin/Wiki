'use client';
/**
 * Selection-to-action floating menu.
 *
 * When the user selects ≥ 4 chars of text inside <main>, a small bubble appears
 * near the selection with three actions:
 *   ✨ Explain  — opens a modal that streams a Claude grounded response
 *   📝 Note     — appends the selection (as a Markdown blockquote) to the
 *                 current doc's note in localStorage
 *   📋 Copy
 */
import { useEffect, useRef, useState } from 'react';

type Pos = { x: number; y: number };

export function SelectionMenu() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [text, setText] = useState('');
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainResult, setExplainResult] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const lastSelection = useRef('');

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      // Only inside <main>
      const main = document.querySelector('main');
      if (!main || !main.contains(range.commonAncestorContainer)) {
        setPos(null);
        return;
      }
      const txt = sel.toString().trim();
      if (txt.length < 4) {
        setPos(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      lastSelection.current = txt;
      setText(txt);
      setPos({
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top + window.scrollY - 8,
      });
    };
    document.addEventListener('mouseup', handler);
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift' || e.shiftKey) handler();
    });
    return () => {
      document.removeEventListener('mouseup', handler);
    };
  }, []);

  const close = () => { setPos(null); window.getSelection()?.removeAllRanges(); };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    close();
  };

  const note = () => {
    const docId = inferDocId();
    if (!docId) {
      alert('Could not detect this page as a doc. Open a wiki / knowledge page first.');
      return;
    }
    const key = 'wiki:notes:' + docId;
    const existing = localStorage.getItem(key) ?? '';
    const block = (existing ? existing + '\n\n' : '') + '> ' + text.replace(/\n/g, '\n> ');
    localStorage.setItem(key, block);
    // also ensure it's in the index
    try {
      const idx = JSON.parse(localStorage.getItem('wiki:notes:index') ?? '[]');
      if (!idx.includes(docId)) localStorage.setItem('wiki:notes:index', JSON.stringify([...idx, docId]));
    } catch {}
    flash(`✓ Added to notes`);
    close();
  };

  const explain = async () => {
    setExplainOpen(true);
    setExplainLoading(true);
    setExplainError(null);
    setExplainResult(null);
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: `Explain in 3-5 sentences: """${text}"""` }),
      });
      const j = await r.json();
      if (!r.ok) setExplainError(j.error ?? 'failed');
      else setExplainResult(j.answer ?? '(empty)');
    } catch (e: any) {
      setExplainError(e.message);
    } finally {
      setExplainLoading(false);
    }
  };

  return (
    <>
      {pos && (
        <div
          style={{
            position: 'absolute', left: pos.x, top: pos.y,
            transform: 'translate(-50%, -100%)',
            background: 'rgba(28,28,30,0.92)', color: '#fff',
            borderRadius: 'var(--r-2)', padding: '5px 6px',
            display: 'flex', gap: 2, zIndex: 90,
            boxShadow: 'var(--shadow-3)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            border: '0.5px solid rgba(255,255,255,0.1)',
            animation: 'lpFade 0.15s var(--ease-spring)',
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button onClick={explain} style={btnStyle}>✨ Explain</button>
          <button onClick={note} style={btnStyle}>📝 Note</button>
          <button onClick={copy} style={btnStyle}>📋 Copy</button>
        </div>
      )}

      {explainOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setExplainOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 110,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            animation: 'lpFade 0.18s var(--ease)',
          }}
        >
          <div className="glass" style={{ width: 'min(660px, 92vw)', borderRadius: 'var(--r-3)', padding: '1.4rem 1.6rem', maxHeight: '70vh', overflowY: 'auto', boxShadow: 'var(--shadow-3)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700, marginBottom: 8 }}>
              ✨ Explain selection
            </div>
            <blockquote style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '0.9rem', color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              {text.length > 300 ? text.slice(0, 300) + '…' : text}
            </blockquote>
            {explainLoading && <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>asking Claude…</div>}
            {explainError && <div style={{ color: '#dc2626', fontSize: '0.9rem' }}>⚠ {explainError}</div>}
            {explainResult && <div style={{ fontSize: '0.95rem', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{explainResult}</div>}
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button onClick={() => setExplainOpen(false)} style={{ background: 'var(--code-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.35rem 0.9rem', cursor: 'pointer', color: 'var(--fg)', fontSize: '0.85rem' }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'transparent', color: '#fff', border: 0,
  padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
  fontSize: '0.78rem', fontWeight: 500,
};

function inferDocId(): string | null {
  const path = window.location.pathname;
  // /wiki/<slug>
  const wiki = path.match(/^\/wiki\/([^/]+)/);
  if (wiki) return 'wiki/' + wiki[1];
  // /knowledge/<cat>/<slug>
  const know = path.match(/^\/knowledge\/([^/]+)\/([^/]+)/);
  if (know) return 'know/' + know[1] + '__' + know[2];
  return null;
}

function flash(msg: string) {
  const div = document.createElement('div');
  div.textContent = msg;
  Object.assign(div.style, {
    position: 'fixed', bottom: '24px', left: '50%',
    transform: 'translateX(-50%)', zIndex: '120',
    background: 'rgba(15,17,21,0.95)', color: '#fff',
    padding: '0.5rem 1rem', borderRadius: '8px',
    fontSize: '0.85rem', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
  } as CSSStyleDeclaration);
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1800);
}
