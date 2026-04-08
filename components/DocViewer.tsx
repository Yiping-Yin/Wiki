'use client';
/**
 * Universal document viewer for knowledge docs.
 * Detects file type and renders the most useful representation:
 *   - .pdf       → embedded iframe (Apple-style frame)
 *   - .csv .tsv  → table preview (first 50 rows)
 *   - .json      → pretty syntax-highlighted tree
 *   - .ipynb     → notebook viewer (cells)
 *   - .md .txt   → plain text
 *   - .docx .pptx → "open original" link (binary)
 *
 * For text formats, the body is supplied by the page (already cleaned).
 */
import { useEffect, useMemo, useState } from 'react';

export function DocViewer({
  ext,
  sourceUrl,
  body,
  title,
}: {
  ext: string;
  sourceUrl: string;
  body: string;
  title: string;
}) {
  const e = ext.toLowerCase();

  if (e === '.pdf') return <PdfFrame src={sourceUrl} title={title} />;
  if (e === '.csv' || e === '.tsv') return <CsvTable url={sourceUrl} sep={e === '.tsv' ? '\t' : ','} />;
  if (e === '.json') return <JsonView url={sourceUrl} />;
  if (e === '.ipynb') return <NotebookView url={sourceUrl} />;
  if (e === '.md' || e === '.txt') return <TextView body={body} />;

  // Binary fallback: docx/pptx/xlsx etc.
  return (
    <div style={{
      margin: '1.2rem 0', padding: '2rem', textAlign: 'center',
      border: 'var(--hairline)', borderRadius: 'var(--r-3)',
      background: 'var(--surface-2)',
    }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📎</div>
      <div style={{ fontSize: '0.95rem', color: 'var(--fg)', fontWeight: 600 }}>{ext.slice(1).toUpperCase()} file</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4, marginBottom: 14 }}>
        Browser can&apos;t preview this type. Open in the native app.
      </div>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        style={{
          display: 'inline-block',
          background: 'var(--accent)', color: '#fff',
          padding: '0.55rem 1.2rem', borderRadius: 'var(--r-1)',
          textDecoration: 'none', fontSize: '0.85rem', fontWeight: 600,
        }}
      >Open original →</a>
    </div>
  );
}

function PdfFrame({ src, title }: { src: string; title: string }) {
  return (
    <div style={{
      margin: '1.2rem 0',
      border: 'var(--hairline)',
      borderRadius: 'var(--r-3)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-2)',
      background: 'var(--bg)',
    }}>
      <iframe
        src={src + '#toolbar=1'}
        title={title}
        style={{ width: '100%', height: '85vh', border: 0, display: 'block' }}
      />
    </div>
  );
}

function TextView({ body }: { body: string }) {
  if (!body || body.length < 5) {
    return <div style={{ color: 'var(--muted)', fontSize: '0.85rem', padding: '1rem 0' }}>(empty)</div>;
  }
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 200);
  return (
    <div style={{ marginTop: '1rem' }}>
      {paragraphs.map((p, i) => (
        <p key={i} style={{ fontSize: '0.95rem', lineHeight: 1.65 }}>{p}</p>
      ))}
    </div>
  );
}

function CsvTable({ url, sep }: { url: string; sep: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url).then((r) => r.text()).then((text) => {
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const parsed = lines.slice(0, 51).map((l) => parseLine(l, sep));
      setRows(parsed);
    }).catch((e) => setError(e.message));
  }, [url, sep]);

  if (error) return <div style={{ color: '#dc2626' }}>⚠ {error}</div>;
  if (!rows) return <div style={{ padding: '1rem', color: 'var(--muted)' }}>Loading CSV…</div>;

  const [header, ...data] = rows;
  return (
    <div style={{
      margin: '1.2rem 0', border: 'var(--hairline)', borderRadius: 'var(--r-2)',
      overflow: 'hidden', boxShadow: 'var(--shadow-1)',
    }}>
      <div style={{ padding: '0.5rem 0.9rem', background: 'var(--surface-2)', fontSize: '0.74rem', color: 'var(--muted)', fontWeight: 600, borderBottom: 'var(--hairline)' }}>
        📊 Showing first {data.length} rows · {header.length} columns
      </div>
      <div style={{ overflowX: 'auto', maxHeight: '60vh' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              {header.map((h, i) => (
                <th key={i} style={{
                  padding: '0.5rem 0.8rem', textAlign: 'left',
                  background: 'var(--bg)', borderBottom: 'var(--hairline)',
                  fontWeight: 600, position: 'sticky', top: 0,
                  whiteSpace: 'nowrap',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: '0.5px solid var(--border)' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '0.4rem 0.8rem', whiteSpace: 'nowrap',
                    color: 'var(--fg)',
                    fontFamily: isNumeric(cell) ? 'var(--mono)' : 'inherit',
                    textAlign: isNumeric(cell) ? 'right' : 'left',
                  }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JsonView({ url }: { url: string }) {
  const [text, setText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url).then((r) => r.text()).then((t) => {
      try {
        setText(JSON.stringify(JSON.parse(t), null, 2));
      } catch {
        setText(t);
      }
    }).catch((e) => setError(e.message));
  }, [url]);

  if (error) return <div style={{ color: '#dc2626' }}>⚠ {error}</div>;
  return (
    <pre style={{
      margin: '1.2rem 0', padding: '1.1rem 1.3rem',
      background: 'var(--code-bg)', border: 'var(--hairline)',
      borderRadius: 'var(--r-2)', overflow: 'auto', maxHeight: '70vh',
      fontSize: '0.82rem', fontFamily: 'var(--mono)', lineHeight: 1.55,
    }}>{text || 'Loading…'}</pre>
  );
}

function NotebookView({ url }: { url: string }) {
  const [cells, setCells] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url).then((r) => r.text()).then((t) => {
      try {
        const nb = JSON.parse(t);
        setCells(nb.cells ?? []);
      } catch (e: any) {
        setError(e.message);
      }
    }).catch((e) => setError(e.message));
  }, [url]);

  if (error) return <div style={{ color: '#dc2626' }}>⚠ {error}</div>;
  if (!cells) return <div style={{ padding: '1rem', color: 'var(--muted)' }}>Loading notebook…</div>;

  return (
    <div style={{ margin: '1.2rem 0', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
      {cells.map((cell, i) => {
        const src = Array.isArray(cell.source) ? cell.source.join('') : cell.source ?? '';
        if (cell.cell_type === 'markdown') {
          return (
            <div key={i} style={{ padding: '0.7rem 1rem', borderLeft: '3px solid var(--accent)', background: 'var(--accent-soft)', borderRadius: '0 var(--r-1) var(--r-1) 0', fontSize: '0.92rem' }}>
              {src}
            </div>
          );
        }
        if (cell.cell_type === 'code') {
          return (
            <div key={i}>
              <pre style={{ margin: 0, padding: '0.9rem 1.1rem', background: 'var(--code-bg)', border: 'var(--hairline)', borderRadius: 'var(--r-1)', fontSize: '0.82rem', fontFamily: 'var(--mono)', overflow: 'auto' }}>
                <code>{src}</code>
              </pre>
              {cell.outputs && cell.outputs.length > 0 && (
                <div style={{ marginTop: 4, padding: '0.6rem 1rem', background: 'rgba(0,113,227,0.05)', borderRadius: 'var(--r-1)', fontSize: '0.78rem', fontFamily: 'var(--mono)', color: 'var(--muted)', maxHeight: 200, overflow: 'auto' }}>
                  {cell.outputs.map((out: any, j: number) => {
                    const outText = out.text ?? out.data?.['text/plain'] ?? '';
                    return <div key={j}>{Array.isArray(outText) ? outText.join('') : outText}</div>;
                  })}
                </div>
              )}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function parseLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function isNumeric(s: string) {
  return /^-?\d+(\.\d+)?$/.test(s.trim());
}
