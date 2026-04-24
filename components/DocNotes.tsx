'use client';
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useNote } from '../lib/use-notes';
import { askAI } from '../lib/ai-bridge';
import { TextArea } from './TextInput';

function buildCompletionPrompt(context: string, doc?: { title?: string; body?: string }): string {
  const docCtx = doc?.body
    ? `\n\nThe user is taking notes on this document:\nTitle: ${doc.title ?? '(unknown)'}\n${doc.body.slice(0, 1500)}`
    : doc?.title
      ? `\n\nThe user is taking notes on "${doc.title}".`
      : '';
  return `You are an inline writing assistant inside a personal knowledge wiki.
The user is in the middle of writing a note. Suggest ONE short continuation
(at most 30 words, one sentence) that would naturally continue what they wrote.
Output ONLY the continuation text, no quotes, no preamble, no labels.
If no good continuation exists, output an empty string.${docCtx}

Note so far:
"""
${context.slice(-1500)}
"""

Continuation:`;
}

function sanitizeSuggestion(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^Continuation:\s*/i, '')
    .split('\n')[0]
    .slice(0, 200);
}

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
        const prompt = buildCompletionPrompt(value, docTitle ? { title: docTitle } : undefined);
        const raw = await askAI(prompt, { maxTokens: 128 });
        const suggestion = sanitizeSuggestion(raw);
        if (suggestion.length > 1) setSuggestion(suggestion);
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
      marginTop: '2rem', padding: '0.9rem 0 1rem',
      borderTop: '0.5px solid var(--mat-border)',
      borderBottom: '0.5px solid var(--mat-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="loom-smallcaps" style={{ fontSize: '0.84rem', fontFamily: 'var(--serif)', color: 'var(--muted)', fontWeight: 500 }}>
          My note
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
              style={{ background: 'transparent', border: 0, borderBottom: '0.5px solid var(--mat-border)', padding: '1px 0', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.7rem' }}
            >open</button>
          )}
        </span>
      </div>
      {open && mode === 'edit' && (
        <div style={{ position: 'relative' }}>
          <TextArea
            ref={taRef}
            size="md"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Doc note (markdown)"
            onKeyDown={(e) => {
              if (e.key === 'Tab' && suggestion) { e.preventDefault(); accept(); }
              else if (e.key === 'Escape' && suggestion) { e.preventDefault(); dismiss(); }
            }}
            rows={Math.max(4, Math.min(20, value.split('\n').length + 1))}
            placeholder="Markdown welcome. Use [[Doc title]] to link. Pause typing to get an AI suggestion."
          />
          {suggestion && (
            <div style={{
              marginTop: 6,
              padding: '0.45rem 0',
              background: 'transparent',
              borderTop: '0.5px solid var(--accent)',
              borderBottom: '0.5px solid var(--accent)',
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
                    background: 'transparent', color: 'var(--accent)',
                    border: 0, borderBottom: '0.5px solid var(--accent)',
                    padding: '2px 0', cursor: 'pointer',
                    fontSize: '0.66rem', fontWeight: 600,
                  }}
                >Tab</button>
                <button
                  onClick={dismiss}
                  style={{
                    background: 'transparent', border: 0,
                    borderBottom: '0.5px solid var(--mat-border)',
                    padding: '2px 0', cursor: 'pointer',
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
    background: 'transparent',
    color: active ? 'var(--fg)' : 'var(--muted)',
    border: 0,
    borderBottom: '0.5px solid ' + (active ? 'var(--accent)' : 'var(--mat-border)'),
    borderRadius: 0, padding: '1px 0', cursor: 'pointer', fontSize: '0.7rem',
  };
}
