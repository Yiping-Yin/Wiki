'use client';
import { useState } from 'react';

export function RAGChat() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    if (!q.trim()) return;
    const u = q; setQ(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text: u }]);
    try {
      const res = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: u }) });
      const data = await res.json();
      setMsgs((m) => [...m, { role: 'assistant', text: data.answer ?? data.error ?? '(no response)' }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: 'assistant', text: 'Error: ' + e.message }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-label="Ask the wiki"
        style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 50, width: 52, height: 52, borderRadius: '50%', background: 'var(--accent)', color: '#fff', border: 0, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.25)', fontSize: '1.4rem' }}>
        {open ? '×' : '💬'}
      </button>
      {open && (
        <div style={{ position: 'fixed', bottom: 84, right: 20, zIndex: 50, width: 'min(380px, calc(100vw - 40px))', height: 480, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
          <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.9rem' }}>
            💬 Ask the wiki
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 6 }}>(needs ANTHROPIC_API_KEY)</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {msgs.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>Try: &ldquo;Explain attention in one paragraph&rdquo; or &ldquo;Why is BPE byte-level?&rdquo;</div>}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: m.role === 'user' ? 'var(--accent)' : 'var(--code-bg)', color: m.role === 'user' ? '#fff' : 'var(--fg)', padding: '0.5rem 0.75rem', borderRadius: 10, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                {m.text}
              </div>
            ))}
            {busy && <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>thinking…</div>}
          </div>
          <div style={{ padding: '0.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.4rem' }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask()}
              placeholder="Ask anything…"
              style={{ flex: 1, padding: '0.4rem 0.6rem', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.85rem' }} />
            <button onClick={ask} disabled={busy} style={{ background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 6, padding: '0 0.8rem', cursor: 'pointer', fontSize: '0.85rem' }}>Send</button>
          </div>
        </div>
      )}
    </>
  );
}
