'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useNote } from '../lib/use-notes';
import { readAiCliPreference } from '../lib/ai-cli';

// Lazy-load NoteRenderer (pulls marked + KaTeX, ~100KB) — only when preview opens.
const NoteRenderer = dynamic(() => import('./NoteRenderer').then((m) => m.NoteRenderer), { ssr: false });

export function DocNotes({ id, docTitle }: { id: string; docTitle?: string }) {
  const [value, setValue, loaded] = useNote(id);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [suggestion, setSuggestion] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const debounce = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (loaded && value) setOpen(true);
  }, [loaded, value]);

  // Debounced AI completion (matches NoteEditor in /notes)
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (abortRef.current) abortRef.current.abort();
    setSuggestion('');
    if (!open || mode !== 'edit') return;
    if (!value || value.length < 12) return;
    const lastChar = value[value.length - 1];
    if (lastChar !== ' ' && lastChar !== '\n' && lastChar !== '.' && lastChar !== ',') return;

    debounce.current = window.setTimeout(async () => {
      setSuggesting(true);
      abortRef.current = new AbortController();
      try {
        const r = await fetch('/api/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            context: value,
            doc: docTitle ? { title: docTitle } : undefined,
            cli: readAiCliPreference(),
          }),
          signal: abortRef.current.signal,
        });
        if (!r.ok) return;
        const j = await r.json();
        const s = (j.suggestion ?? '').trim();
        if (s.length > 1) setSuggestion(s);
      } catch {} finally { setSuggesting(false); }
    }, 1500);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value, open, mode, docTitle]);

  const accept = () => {
    if (!suggestion) return;
    const sep = value.endsWith(' ') || value.endsWith('\n') ? '' : ' ';
    setValue(value + sep + suggestion);
    setSuggestion('');
    setTimeout(() => taRef.current?.focus(), 30);
  };
  const dismiss = () => setSuggestion('');

  return (
    <div style={{
      marginTop: '2rem', padding: '1rem 1.2rem',
      border: 'var(--hairline)', borderRadius: 'var(--r-2)',
      background: 'var(--surface-2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
          📝 My notes
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {open && value && (
            <>
              <button
                onClick={() => setMode('edit')}
                style={tabBtn(mode === 'edit')}
              >edit</button>
              <button
                onClick={() => setMode('preview')}
                style={tabBtn(mode === 'preview')}
              >preview</button>
            </>
          )}
          {!open && (
            <button
              onClick={() => setOpen(true)}
              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 8px', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.7rem' }}
            >open</button>
          )}
        </span>
      </div>
      {open && mode === 'edit' && (
        <div style={{ position: 'relative' }}>
          <textarea
            ref={taRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && suggestion) { e.preventDefault(); accept(); }
              else if (e.key === 'Escape' && suggestion) { e.preventDefault(); dismiss(); }
            }}
            rows={Math.max(4, Math.min(20, value.split('\n').length + 1))}
            placeholder="Markdown welcome. Use [[Doc title]] to link. Pause typing to get an AI suggestion."
            style={{
              width: '100%', border: 'var(--hairline)', borderRadius: 'var(--r-1)',
              background: 'var(--bg)', color: 'var(--fg)', padding: '0.7rem 0.9rem',
              fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.55, resize: 'vertical',
              outline: 'none',
            }}
          />
          {suggestion && (
            <div style={{
              marginTop: 6,
              padding: '0.5rem 0.75rem',
              background: 'var(--bg-translucent)',
              backdropFilter: 'saturate(180%) blur(20px)',
              WebkitBackdropFilter: 'saturate(180%) blur(20px)',
              border: '0.5px solid var(--accent)',
              borderRadius: 'var(--r-1)',
              boxShadow: 'var(--shadow-1)',
              display: 'flex', alignItems: 'flex-start', gap: 8,
              fontSize: '0.78rem', lineHeight: 1.5,
              animation: 'lpFade 0.18s var(--ease)',
            }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>✦</span>
              <div style={{ flex: 1, minWidth: 0, color: 'var(--fg)' }}>
                {suggestion}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button
                  onClick={accept}
                  style={{
                    background: 'var(--accent)', color: '#fff',
                    border: 0, borderRadius: 'var(--r-1)',
                    padding: '2px 8px', cursor: 'pointer',
                    fontSize: '0.66rem', fontWeight: 600,
                  }}
                >Tab</button>
                <button
                  onClick={dismiss}
                  style={{
                    background: 'transparent', border: 'var(--hairline)',
                    borderRadius: 'var(--r-1)',
                    padding: '2px 8px', cursor: 'pointer',
                    fontSize: '0.66rem', color: 'var(--muted)',
                  }}
                >Esc</button>
              </div>
            </div>
          )}
        </div>
      )}
      {open && mode === 'preview' && (
        <div style={{
          border: 'var(--hairline)', borderRadius: 'var(--r-1)',
          background: 'var(--bg)', padding: '0.7rem 0.9rem',
          minHeight: 80,
        }}>
          {value
            ? <NoteRenderer source={value} />
            : <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>nothing to preview</span>}
        </div>
      )}
    </div>
  );
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--muted)',
    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
    borderRadius: 4, padding: '1px 8px', cursor: 'pointer', fontSize: '0.7rem',
  };
}
