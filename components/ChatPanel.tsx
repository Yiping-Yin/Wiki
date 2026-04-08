'use client';
/**
 * Prism-style chat panel — slides in from the right as a drawer.
 *
 * Features:
 *  - Streams responses from claude -p / codex exec via /api/chat (SSE)
 *  - Persistent message history per session in localStorage
 *  - Auto-includes current page metadata as <context>
 *  - Model picker (Claude / Codex)
 *  - ⌘L global shortcut to toggle
 *  - Apple-style glass drawer
 */
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

type Msg = { role: 'user' | 'assistant'; content: string };
type Model = 'claude' | 'codex';

const STORAGE_KEY = 'wiki:chat:v1';
const MODEL_KEY = 'wiki:chat:model';

export function ChatPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState<Model>('claude');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load persisted state
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
      const m = localStorage.getItem(MODEL_KEY);
      if (m === 'codex' || m === 'claude') setModel(m);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch {}
  }, [messages]);
  useEffect(() => {
    try { localStorage.setItem(MODEL_KEY, model); } catch {}
  }, [model]);

  // Auto-scroll on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  // ⌘L / Ctrl+L to toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus input on open
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const buildContext = (): string => {
    const ctx: string[] = [];
    ctx.push(`Current path: ${pathname}`);
    // Try to capture H1 of the visible page
    const h1 = document.querySelector('main h1')?.textContent?.trim();
    if (h1) ctx.push(`Current page title: ${h1}`);
    // Try to capture current selection if any
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 4 && sel.length < 2000) {
      ctx.push(`User has selected the following text on the page:\n"""${sel}"""`);
    }
    return ctx.join('\n');
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || streaming) return;

    const userMsg: Msg = { role: 'user', content: text };
    const next = [...messages, userMsg, { role: 'assistant' as const, content: '' }];
    setMessages(next);
    setDraft('');
    setStreaming(true);

    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          model,
          context: buildContext(),
        }),
        signal: abortRef.current.signal,
      });
      if (!res.body) throw new Error('no stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) {
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  role: 'assistant',
                  content: copy[copy.length - 1].content + parsed.delta,
                };
                return copy;
              });
            } else if (parsed.error) {
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  role: 'assistant',
                  content: (copy[copy.length - 1].content || '') + `\n⚠ ${parsed.error}`,
                };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: `⚠ ${e.message}` };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const clear = () => {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Toggle chat"
        title="Chat (⌘L)"
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 49,
          width: 56, height: 56, borderRadius: '50%',
          background: open ? 'var(--surface-2)' : 'var(--accent)',
          color: open ? 'var(--fg)' : '#fff',
          border: 'var(--hairline)', cursor: 'pointer',
          boxShadow: 'var(--shadow-3)',
          fontSize: '1.4rem',
          transition: 'transform 0.2s var(--ease-spring), background 0.2s var(--ease)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.08)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {open ? '×' : '✦'}
      </button>

      {/* Drawer */}
      <div
        className="glass"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(440px, 92vw)',
          zIndex: 48,
          display: 'flex', flexDirection: 'column',
          borderLeft: 'var(--hairline)',
          boxShadow: open ? 'var(--shadow-3)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s var(--ease)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '0.85rem 1.1rem',
          borderBottom: 'var(--hairline)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8,
        }}>
          <div style={{
            fontFamily: 'var(--display)', fontSize: '0.95rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ✦ Assistant
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as Model)}
              disabled={streaming}
              style={{
                background: 'var(--surface-2)',
                border: 'var(--hairline)',
                borderRadius: 'var(--r-1)',
                padding: '3px 8px',
                fontSize: '0.72rem',
                color: 'var(--fg)',
                fontFamily: 'inherit',
                cursor: streaming ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="claude">claude</option>
              <option value="codex">codex</option>
            </select>
            <button
              onClick={clear}
              disabled={streaming || messages.length === 0}
              title="Clear conversation"
              style={{
                background: 'transparent', border: 'var(--hairline)',
                borderRadius: 'var(--r-1)', padding: '3px 8px',
                cursor: 'pointer', color: 'var(--muted)',
                fontSize: '0.7rem',
                opacity: messages.length === 0 ? 0.4 : 1,
              }}
            >clear</button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} style={{
          flex: 1, overflowY: 'auto',
          padding: '1rem',
          display: 'flex', flexDirection: 'column', gap: '0.9rem',
        }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1.55 }}>
              <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 6 }}>Hi 👋</div>
              I&apos;m running locally via <code style={{ background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 3 }}>{model} -p</code>.
              Ask me anything about your wiki, the page you&apos;re reading, or any text you select.
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  'Summarize this page in 3 bullets',
                  'What does the selected text mean?',
                  'Help me write a note about this',
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => setDraft(s)}
                    style={{
                      background: 'var(--surface-2)',
                      border: 'var(--hairline)',
                      borderRadius: 'var(--r-1)',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      color: 'var(--fg)',
                      fontSize: '0.78rem',
                      textAlign: 'left',
                    }}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '88%',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--surface-2)',
              color: m.role === 'user' ? '#fff' : 'var(--fg)',
              padding: '0.6rem 0.85rem',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              fontSize: '0.86rem',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              border: m.role === 'assistant' ? 'var(--hairline)' : '0',
              boxShadow: 'var(--shadow-1)',
            }}>
              {m.content || (streaming && i === messages.length - 1 ? <Cursor /> : '')}
            </div>
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: '0.7rem 0.85rem', borderTop: 'var(--hairline)' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            border: 'var(--hairline)', borderRadius: 'var(--r-2)',
            padding: '0.5rem 0.6rem', background: 'var(--bg)',
          }}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={streaming ? 'streaming…' : 'Ask anything (⏎ to send · ⇧⏎ for newline)'}
              disabled={streaming}
              rows={1}
              style={{
                flex: 1, border: 0, background: 'transparent',
                color: 'var(--fg)', fontSize: '0.88rem',
                resize: 'none', outline: 'none',
                fontFamily: 'inherit', lineHeight: 1.5,
                maxHeight: 120,
              }}
            />
            <button
              onClick={streaming ? stop : send}
              disabled={!streaming && !draft.trim()}
              style={{
                background: streaming ? '#dc2626' : 'var(--accent)',
                color: '#fff', border: 0, borderRadius: 'var(--r-1)',
                padding: '6px 12px', cursor: 'pointer',
                fontSize: '0.78rem', fontWeight: 600,
                opacity: !streaming && !draft.trim() ? 0.4 : 1,
                whiteSpace: 'nowrap',
              }}
            >{streaming ? 'Stop' : '↑'}</button>
          </div>
          <div style={{ marginTop: 6, fontSize: '0.66rem', color: 'var(--muted)', textAlign: 'center' }}>
            ⌘L to toggle · context-aware · local CLI
          </div>
        </div>
      </div>
    </>
  );
}

function Cursor() {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 14,
      background: 'var(--muted)',
      animation: 'blink 1s infinite',
      verticalAlign: 'middle',
    }} />
  );
}
