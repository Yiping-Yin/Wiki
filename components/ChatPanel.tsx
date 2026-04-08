'use client';
/**
 * Prism-style chat panel — slides in from the right as a drawer.
 *
 * Features:
 *  - Streams responses from claude -p / codex exec via /api/chat (SSE)
 *  - Markdown rendering for assistant messages (code, lists, math)
 *  - Per-message hover actions: copy / save to current doc's notes
 *  - Persistent message history per session in localStorage
 *  - Auto-includes current page metadata as <context>
 *  - Model picker (Claude / Codex)
 *  - ⌘L global shortcut to toggle
 *  - Apple-style glass drawer
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { NoteRenderer } from './NoteRenderer';

type IndexDoc = { id: string; title: string; href: string; category: string };
let _idxCache: IndexDoc[] | null = null;
async function loadIndexDocs(): Promise<IndexDoc[]> {
  if (_idxCache) return _idxCache;
  try {
    const r = await fetch('/search-index.json');
    if (!r.ok) return [];
    const payload = await r.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const out: IndexDoc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      out.push({ id: String(docIds[internal] ?? internal), title: fields.title, href: fields.href, category: fields.category ?? '' });
    }
    _idxCache = out;
    return out;
  } catch { return []; }
}

const SLASH_COMMANDS: { name: string; description: string }[] = [
  { name: '/help',      description: 'List available commands' },
  { name: '/clear',     description: 'Clear the conversation' },
  { name: '/page',      description: 'Inject the current page content as context' },
  { name: '/summarize', description: 'Summarize the current page' },
  { name: '/quiz',      description: 'Quiz me on the current page' },
  { name: '/find',      description: '/find <query> · search the wiki and post results' },
  { name: '/explain',   description: 'Explain my current selection' },
];

type Msg = { role: 'user' | 'assistant'; content: string };
type Model = 'claude' | 'codex';
type Mention = { id: string; title: string; href: string };
type Thread = { id: string; title: string; messages: Msg[]; updatedAt: number };

const THREADS_KEY = 'wiki:chat:threads:v1';
const ACTIVE_THREAD_KEY = 'wiki:chat:active';

function newThreadId(): string { return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function autoTitle(messages: Msg[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New chat';
  return first.content.slice(0, 40).replace(/\s+/g, ' ').trim() || 'New chat';
}
function loadThreads(): Thread[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveThreads(ts: Thread[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(THREADS_KEY, JSON.stringify(ts.slice(0, 50)));
}

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

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Load persisted state — migrate single-thread → threads if needed
  useEffect(() => {
    try {
      const m = localStorage.getItem(MODEL_KEY);
      if (m === 'codex' || m === 'claude') setModel(m);

      let ts = loadThreads();
      if (ts.length === 0) {
        const legacy = localStorage.getItem(STORAGE_KEY);
        if (legacy) {
          try {
            const msgs = JSON.parse(legacy) as Msg[];
            if (Array.isArray(msgs) && msgs.length > 0) {
              ts = [{ id: newThreadId(), title: autoTitle(msgs), messages: msgs, updatedAt: Date.now() }];
              saveThreads(ts);
            }
          } catch {}
        }
      }
      if (ts.length === 0) {
        ts = [{ id: newThreadId(), title: 'New chat', messages: [], updatedAt: Date.now() }];
        saveThreads(ts);
      }
      setThreads(ts);
      const savedActive = localStorage.getItem(ACTIVE_THREAD_KEY);
      const found = savedActive ? ts.find((t) => t.id === savedActive) : null;
      const active = found ?? ts[0];
      setActiveThreadId(active.id);
      setMessages(active.messages);
    } catch {}
  }, []);

  // Persist messages back to active thread on change
  useEffect(() => {
    if (!activeThreadId) return;
    setThreads((prev) => {
      const next = prev.map((t) =>
        t.id === activeThreadId
          ? { ...t, messages: messages.slice(-100), updatedAt: Date.now(), title: t.title === 'New chat' && messages.length > 0 ? autoTitle(messages) : t.title }
          : t,
      );
      saveThreads(next);
      return next;
    });
  }, [messages, activeThreadId]);

  useEffect(() => {
    try { localStorage.setItem(MODEL_KEY, model); } catch {}
  }, [model]);
  useEffect(() => {
    if (activeThreadId) localStorage.setItem(ACTIVE_THREAD_KEY, activeThreadId);
  }, [activeThreadId]);

  const newThread = () => {
    const t: Thread = { id: newThreadId(), title: 'New chat', messages: [], updatedAt: Date.now() };
    setThreads((prev) => {
      const next = [t, ...prev];
      saveThreads(next);
      return next;
    });
    setActiveThreadId(t.id);
    setMessages([]);
    setMentions([]);
    setStickyContext('');
    setShowHistory(false);
  };

  const switchThread = (id: string) => {
    const t = threads.find((x) => x.id === id);
    if (!t) return;
    setActiveThreadId(id);
    setMessages(t.messages);
    setMentions([]);
    setStickyContext('');
    setShowHistory(false);
  };

  const deleteThread = (id: string) => {
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveThreads(next);
      if (next.length === 0) {
        const t: Thread = { id: newThreadId(), title: 'New chat', messages: [], updatedAt: Date.now() };
        saveThreads([t]);
        setActiveThreadId(t.id);
        setMessages([]);
        return [t];
      }
      if (id === activeThreadId) {
        setActiveThreadId(next[0].id);
        setMessages(next[0].messages);
      }
      return next;
    });
  };

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
    const h1 = document.querySelector('main h1')?.textContent?.trim();
    if (h1) ctx.push(`Current page title: ${h1}`);
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 4 && sel.length < 2000) {
      ctx.push(`User has selected the following text on the page:\n"""${sel}"""`);
    }
    return ctx.join('\n');
  };

  // Slash command handler — runs locally before sending to /api/chat
  const handleSlashCommand = async (raw: string): Promise<boolean> => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('/')) return false;
    const [cmd, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(' ').trim();

    const pushMsg = (m: Msg) => setMessages((prev) => [...prev, m]);

    switch (cmd) {
      case '/help': {
        pushMsg({ role: 'user', content: trimmed });
        pushMsg({
          role: 'assistant',
          content: '**Slash commands:**\n\n' + SLASH_COMMANDS.map((c) => `- \`${c.name}\` — ${c.description}`).join('\n') + '\n\nYou can also use **`@title`** to mention any wiki document.',
        });
        return true;
      }
      case '/clear': {
        clear();
        return true;
      }
      case '/page': {
        const h1 = document.querySelector('main h1')?.textContent?.trim() ?? '(no page)';
        const text = Array.from(document.querySelectorAll('main p, main li, main h2, main h3'))
          .map((el) => el.textContent?.trim() ?? '').filter(Boolean).join('\n').slice(0, 4000);
        pushMsg({ role: 'user', content: trimmed });
        pushMsg({
          role: 'assistant',
          content: `📄 **${h1}** has been added to the conversation context. Ask away.`,
        });
        // Inject as a fake context message that will be passed next turn
        setStickyContext(`Page being discussed:\n# ${h1}\n${text}`);
        return true;
      }
      case '/summarize': {
        setDraft('');
        await actualSend(`Summarize the current page concisely in 5 bullets and one key formula if applicable.`);
        return true;
      }
      case '/quiz': {
        setDraft('');
        await actualSend(`Quiz me with 3 multiple-choice questions about the current page (one easy, one medium, one hard). Show choices A-D, mark the correct answer, and explain.`);
        return true;
      }
      case '/explain': {
        const sel = window.getSelection()?.toString().trim();
        if (!sel) {
          pushMsg({ role: 'user', content: trimmed });
          pushMsg({ role: 'assistant', content: '⚠ Nothing is selected. Highlight some text on the page first, then run `/explain`.' });
          return true;
        }
        setDraft('');
        await actualSend(`Explain in 3-5 sentences what this selection means: """${sel}"""`);
        return true;
      }
      case '/find': {
        if (!arg) {
          pushMsg({ role: 'user', content: trimmed });
          pushMsg({ role: 'assistant', content: 'Usage: `/find <query>`' });
          return true;
        }
        pushMsg({ role: 'user', content: trimmed });
        try {
          const docs = await loadIndexDocs();
          const matches = docs
            .filter((d) => d.title.toLowerCase().includes(arg.toLowerCase()) || d.category.toLowerCase().includes(arg.toLowerCase()))
            .slice(0, 12);
          if (matches.length === 0) {
            pushMsg({ role: 'assistant', content: `No matches for **${arg}**.` });
          } else {
            const list = matches.map((m) => `- [${m.title}](${m.href}) · *${m.category}*`).join('\n');
            pushMsg({ role: 'assistant', content: `Found **${matches.length}** matches for **${arg}**:\n\n${list}` });
          }
        } catch (e: any) {
          pushMsg({ role: 'assistant', content: `⚠ ${e.message}` });
        }
        return true;
      }
      default: {
        pushMsg({ role: 'user', content: trimmed });
        pushMsg({ role: 'assistant', content: `Unknown command **${cmd}**. Try \`/help\`.` });
        return true;
      }
    }
  };

  const [stickyContext, setStickyContext] = useState<string>('');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [allDocs, setAllDocs] = useState<IndexDoc[]>([]);

  useEffect(() => { loadIndexDocs().then(setAllDocs); }, []);

  // Fetch each mention's body and combine into a context block
  const buildMentionContext = async (): Promise<string> => {
    if (mentions.length === 0) return '';
    const blocks = await Promise.all(
      mentions.map(async (m) => {
        try {
          const r = await fetch(`/api/doc-body?id=${encodeURIComponent(m.id)}`);
          if (!r.ok) return null;
          const j = await r.json();
          return `## @${j.title}\n${(j.body ?? '').slice(0, 4000)}`;
        } catch { return null; }
      }),
    );
    return blocks.filter(Boolean).join('\n\n---\n\n');
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft('');
    if (text.startsWith('/')) {
      await handleSlashCommand(text);
      return;
    }
    await actualSend(text);
  };

  const actualSend = async (text: string) => {
    const userMsg: Msg = { role: 'user', content: text };
    const next = [...messages, userMsg, { role: 'assistant' as const, content: '' }];
    setMessages(next);
    setStreaming(true);

    const mentionCtx = await buildMentionContext();
    const ctx = [buildContext(), stickyContext, mentionCtx ? `Mentioned documents:\n${mentionCtx}` : ''].filter(Boolean).join('\n\n');

    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          model,
          context: ctx,
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
  };

  // Keep latest actualSend reachable from a stable listener without re-binding
  const sendRef = useRef(actualSend);
  useEffect(() => { sendRef.current = actualSend; }, [actualSend]);

  // Listen for global toggle events from FloatingDock / LiquidBar
  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    const onLiquidSend = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (typeof text === 'string' && text.trim()) {
        setOpen(true);
        // small delay so the drawer mounts before we send
        setTimeout(() => sendRef.current(text), 80);
      }
    };
    window.addEventListener('wiki:chat:toggle', onToggle);
    window.addEventListener('wiki:liquid:send', onLiquidSend as EventListener);
    return () => {
      window.removeEventListener('wiki:chat:toggle', onToggle);
      window.removeEventListener('wiki:liquid:send', onLiquidSend as EventListener);
    };
  }, []);

  return (
    <>
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
        {/* Header — title row */}
        <div style={{
          padding: '0.75rem 1.1rem 0.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 8, position: 'relative',
        }}>
          <div style={{
            fontFamily: 'var(--display)', fontSize: '0.95rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
            flex: 1, minWidth: 0,
          }}>
            <span style={{ color: 'var(--accent)' }}>✦</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {threads.find((t) => t.id === activeThreadId)?.title ?? 'Assistant'}
            </span>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close chat"
            style={{
              background: 'transparent', border: 0,
              cursor: 'pointer', color: 'var(--muted)',
              fontSize: '1.1rem', padding: '2px 6px', lineHeight: 1,
            }}
          >×</button>
        </div>
        {/* Header — actions row */}
        <div style={{
          padding: '0 1.1rem 0.7rem',
          borderBottom: 'var(--hairline)',
          display: 'flex', alignItems: 'center', gap: 6,
          position: 'relative',
        }}>
          <button
            onClick={newThread}
            title="New chat"
            style={{
              background: 'var(--accent)',
              border: 0, color: '#fff',
              borderRadius: 'var(--r-1)', padding: '4px 10px',
              cursor: 'pointer',
              fontSize: '0.72rem', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >+ New</button>
          <button
            onClick={() => setShowHistory((s) => !s)}
            title="Thread history"
            style={{
              background: showHistory ? 'var(--accent-soft)' : 'var(--surface-2)',
              border: 'var(--hairline)',
              borderRadius: 'var(--r-1)', padding: '4px 10px',
              cursor: 'pointer', color: showHistory ? 'var(--accent)' : 'var(--muted)',
              fontSize: '0.72rem', fontWeight: 500,
            }}
          >🕓 {threads.length}</button>
          <div style={{ flex: 1 }} />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as Model)}
            disabled={streaming}
            style={{
              background: 'var(--surface-2)',
              border: 'var(--hairline)',
              borderRadius: 'var(--r-1)',
              padding: '4px 8px',
              fontSize: '0.72rem',
              color: 'var(--fg)',
              fontFamily: 'inherit',
              cursor: streaming ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="claude">claude</option>
            <option value="codex">codex</option>
          </select>

          {/* History popover */}
          {showHistory && (
            <div className="glass" style={{
              position: 'absolute', top: '100%', right: 12, marginTop: 6,
              width: 320, maxHeight: '60vh', overflowY: 'auto',
              borderRadius: 'var(--r-2)', boxShadow: 'var(--shadow-3)',
              zIndex: 60,
            }}>
              <div style={{ padding: '8px 12px', fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, borderBottom: 'var(--hairline)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{threads.length} thread{threads.length === 1 ? '' : 's'}</span>
                <button onClick={newThread} style={{ background: 'transparent', border: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}>+ New</button>
              </div>
              {threads.sort((a, b) => b.updatedAt - a.updatedAt).map((t) => {
                const isActive = t.id === activeThreadId;
                return (
                  <div
                    key={t.id}
                    onClick={() => switchThread(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 12px', cursor: 'pointer',
                      background: isActive ? 'var(--accent-soft)' : 'transparent',
                      borderLeft: '3px solid ' + (isActive ? 'var(--accent)' : 'transparent'),
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.82rem', fontWeight: isActive ? 600 : 500,
                        color: isActive ? 'var(--accent)' : 'var(--fg)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{t.title}</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 1 }}>
                        {t.messages.length} msg · {timeAgoShort(t.updatedAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteThread(t.id); }}
                      style={{
                        background: 'transparent', border: 0, color: 'var(--muted)',
                        cursor: 'pointer', fontSize: '0.85rem', padding: '0 4px',
                      }}
                      title="Delete"
                    >×</button>
                  </div>
                );
              })}
            </div>
          )}
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
            <MessageBubble
              key={i}
              message={m}
              isStreamingLast={streaming && i === messages.length - 1}
              currentPath={pathname}
            />
          ))}
        </div>

        {/* Input */}
        <div style={{ padding: '0.7rem 0.85rem', borderTop: 'var(--hairline)', position: 'relative' }}>
          {/* Sticky context indicator */}
          {stickyContext && (
            <div style={{
              marginBottom: 6, padding: '4px 10px',
              background: 'var(--accent-soft)', color: 'var(--accent)',
              borderRadius: 'var(--r-1)', fontSize: '0.7rem',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>📎 Page context attached</span>
              <button onClick={() => setStickyContext('')} style={{ background: 'transparent', border: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: '0.7rem' }}>×</button>
            </div>
          )}
          {/* Mention chips */}
          {mentions.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {mentions.map((m) => (
                <span key={m.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  borderRadius: 999, padding: '2px 8px 2px 10px',
                  fontSize: '0.7rem', fontWeight: 500,
                }}>
                  @{m.title.length > 24 ? m.title.slice(0, 22) + '…' : m.title}
                  <button
                    onClick={() => setMentions((ms) => ms.filter((x) => x.id !== m.id))}
                    style={{ background: 'transparent', border: 0, color: 'var(--accent)', cursor: 'pointer', padding: '0 0 0 2px', fontSize: '0.85rem', lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>
          )}
          <SlashMenu draft={draft} onPick={(cmd) => { setDraft(cmd + ' '); inputRef.current?.focus(); }} />
          <MentionMenu
            draft={draft}
            allDocs={allDocs}
            onPick={(d) => {
              if (!mentions.find((m) => m.id === d.id)) {
                setMentions((ms) => [...ms, d]);
              }
              // Strip the @query from draft
              setDraft((cur) => cur.replace(/@[^\s@]*$/, '').trimStart());
              inputRef.current?.focus();
            }}
          />
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

function inferDocId(path: string): string | null {
  const wiki = path.match(/^\/wiki\/([^/]+)/);
  if (wiki) return 'wiki/' + wiki[1];
  const know = path.match(/^\/knowledge\/([^/]+)\/([^/]+)/);
  if (know) return 'know/' + know[1] + '__' + know[2];
  const upload = path.match(/^\/uploads\/([^/]+)/);
  if (upload) return 'upload/' + decodeURIComponent(upload[1]);
  return null;
}

function flash(msg: string) {
  const div = document.createElement('div');
  div.textContent = msg;
  Object.assign(div.style, {
    position: 'fixed', bottom: '24px', left: '50%',
    transform: 'translateX(-50%)', zIndex: '120',
    background: 'rgba(28,28,30,0.95)', color: '#fff',
    padding: '0.5rem 1rem', borderRadius: '8px',
    fontSize: '0.85rem', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    backdropFilter: 'blur(20px)',
  } as CSSStyleDeclaration);
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 1800);
}

function timeAgoShort(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function MentionMenu({
  draft, allDocs, onPick,
}: {
  draft: string; allDocs: IndexDoc[]; onPick: (d: IndexDoc) => void;
}) {
  // Match @query at the end of draft (no space after @)
  const m = draft.match(/@([^\s@]*)$/);
  if (!m) return null;
  const q = m[1].toLowerCase();
  const matches = allDocs
    .filter((d) => d.title.toLowerCase().includes(q) || d.category.toLowerCase().includes(q))
    .slice(0, 8);
  if (matches.length === 0) return null;

  return (
    <div className="glass" style={{
      position: 'absolute', left: '0.85rem', right: '0.85rem', bottom: '100%',
      marginBottom: 8, borderRadius: 'var(--r-2)', overflow: 'hidden',
      boxShadow: 'var(--shadow-2)', maxHeight: 280, overflowY: 'auto',
    }}>
      <div style={{ padding: '6px 12px', fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, borderBottom: 'var(--hairline)' }}>
        Mention a document
      </div>
      {matches.map((d) => (
        <button
          key={d.id}
          onMouseDown={(e) => { e.preventDefault(); onPick(d); }}
          style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            width: '100%', padding: '7px 12px',
            background: 'transparent', border: 0, cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.title}
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.category}
          </span>
        </button>
      ))}
    </div>
  );
}

function SlashMenu({ draft, onPick }: { draft: string; onPick: (cmd: string) => void }) {
  if (!draft.startsWith('/') || draft.includes(' ')) return null;
  const q = draft.slice(1).toLowerCase();
  const matches = SLASH_COMMANDS.filter((c) => c.name.slice(1).toLowerCase().startsWith(q));
  if (matches.length === 0) return null;
  return (
    <div className="glass" style={{
      position: 'absolute', left: '0.85rem', right: '0.85rem', bottom: '100%',
      marginBottom: 8, borderRadius: 'var(--r-2)', overflow: 'hidden',
      boxShadow: 'var(--shadow-2)', maxHeight: 240, overflowY: 'auto',
    }}>
      <div style={{ padding: '6px 12px', fontSize: '0.65rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, borderBottom: 'var(--hairline)' }}>
        Commands
      </div>
      {matches.map((c) => (
        <button
          key={c.name}
          onClick={() => onPick(c.name)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '8px 12px',
            background: 'transparent', border: 0, cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 600 }}>{c.name}</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{c.description}</span>
        </button>
      ))}
    </div>
  );
}

function MessageBubble({
  message, isStreamingLast, currentPath,
}: {
  message: Msg; isStreamingLast: boolean; currentPath: string;
}) {
  const [hovered, setHovered] = useState(false);
  const isUser = message.role === 'user';

  const copy = async () => {
    await navigator.clipboard.writeText(message.content);
    flash('✓ Copied');
  };

  const saveToNotes = () => {
    const docId = inferDocId(currentPath);
    if (!docId) {
      flash('⚠ Open a doc first');
      return;
    }
    const key = 'wiki:notes:' + docId;
    const existing = localStorage.getItem(key) ?? '';
    const block = (existing ? existing + '\n\n' : '') + '> ' + message.content.replace(/\n/g, '\n> ');
    localStorage.setItem(key, block);
    try {
      const idx = JSON.parse(localStorage.getItem('wiki:notes:index') ?? '[]');
      if (!idx.includes(docId)) localStorage.setItem('wiki:notes:index', JSON.stringify([...idx, docId]));
    } catch {}
    flash('✓ Saved to notes');
  };

  const insertAtCursor = () => {
    // Try to insert into the most-recently focused textarea/input
    const ta = document.activeElement as HTMLElement | null;
    if (ta && (ta.tagName === 'TEXTAREA' || (ta.tagName === 'INPUT' && (ta as HTMLInputElement).type === 'text'))) {
      const el = ta as HTMLTextAreaElement;
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const next = el.value.slice(0, start) + message.content + el.value.slice(end);
      // React-controlled inputs need a synthetic event
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        ?? Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(el, next);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.selectionStart = el.selectionEnd = start + message.content.length;
      } else {
        el.value = next;
      }
      flash('✓ Inserted');
      return;
    }
    // No focused field — broadcast for any listeners
    window.dispatchEvent(new CustomEvent('wiki:insert-text', { detail: { text: message.content } }));
    flash('⚠ Click into a text field first');
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '92%',
        position: 'relative',
      }}
    >
      <div style={{
        background: isUser ? 'var(--accent)' : 'var(--surface-2)',
        color: isUser ? '#fff' : 'var(--fg)',
        padding: '0.6rem 0.85rem',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        fontSize: '0.87rem',
        lineHeight: 1.55,
        border: !isUser ? 'var(--hairline)' : '0',
        boxShadow: 'var(--shadow-1)',
        wordBreak: 'break-word',
      }}>
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        ) : message.content ? (
          <div className="chat-msg">
            <NoteRenderer source={message.content} />
          </div>
        ) : isStreamingLast ? (
          <Cursor />
        ) : null}
      </div>

      {/* Hover actions for assistant messages */}
      {!isUser && message.content && (
        <div style={{
          display: 'flex', gap: 4, marginTop: 4,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s var(--ease)',
          paddingLeft: 4,
        }}>
          <button onClick={copy} style={msgActionStyle} title="Copy">📋</button>
          <button onClick={insertAtCursor} style={msgActionStyle} title="Insert at cursor in focused field">⤵</button>
          <button onClick={saveToNotes} style={msgActionStyle} title="Append to current doc's notes">📝</button>
        </div>
      )}
    </div>
  );
}

const msgActionStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: 'var(--hairline)',
  borderRadius: 'var(--r-1)',
  padding: '2px 8px',
  cursor: 'pointer',
  fontSize: '0.78rem',
  color: 'var(--muted)',
};
