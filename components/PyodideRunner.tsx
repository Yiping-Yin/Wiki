'use client';
import { useRef, useState } from 'react';
import { WeftShuttle } from './DocViewer';

declare global { interface Window { loadPyodide?: any; _pyodide?: any } }

export function PyodideRunner({ code: initial }: { code: string }) {
  const [code, setCode] = useState(initial);
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true); setOut('');
    try {
      if (!window._pyodide) {
        if (!window.loadPyodide) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js';
            s.onload = () => res(); s.onerror = () => rej(new Error('failed to load pyodide'));
            document.head.appendChild(s);
          });
        }
        window._pyodide = await window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/' });
      }
      const py = window._pyodide;
      let buf = '';
      py.setStdout({ batched: (s: string) => (buf += s + '\n') });
      py.setStderr({ batched: (s: string) => (buf += s + '\n') });
      try { await py.runPythonAsync(code); }
      catch (e: any) { buf += String(e); }
      setOut(buf || '(no output)');
    } catch (e: any) {
      setOut('Error: ' + e.message);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, margin: '1.2rem 0', overflow: 'hidden' }}>
      <div style={{ background: 'var(--code-bg)', padding: '0.4rem 0.8rem', fontSize: '0.78rem', color: 'var(--muted)', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          Python (Pyodide, in-browser)
          {busy && <WeftShuttle width={48} height={12} />}
        </span>
        <button onClick={run} disabled={busy}
          style={{ background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 4, padding: '2px 10px', cursor: busy ? 'default' : 'pointer', fontSize: '0.75rem', opacity: busy ? 0.72 : 1 }}>
          ▶ Run
        </button>
      </div>
      <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={Math.min(14, code.split('\n').length + 1)}
        style={{ width: '100%', border: 0, padding: '0.7rem', fontFamily: 'var(--mono)', fontSize: '0.82rem', background: 'var(--code-bg)', color: 'var(--fg)', outline: 'none', resize: 'vertical' }} />
      {out && <pre style={{ margin: 0, padding: '0.7rem', background: 'var(--bg)', borderTop: '1px solid var(--border)', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{out}</pre>}
    </div>
  );
}
