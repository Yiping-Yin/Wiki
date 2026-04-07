'use client';
import { useEffect, useState } from 'react';
import { useNote } from '../lib/use-notes';
import { NoteRenderer } from './NoteRenderer';

export function DocNotes({ id }: { id: string }) {
  const [value, setValue, loaded] = useNote(id);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    if (loaded && value) setOpen(true);
  }, [loaded, value]);

  return (
    <div style={{
      marginTop: '2rem', padding: '1rem 1.2rem',
      border: '1px solid var(--border)', borderRadius: 10,
      background: 'var(--code-bg)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
          📝 My notes
        </span>
        <span style={{ fontSize: '0.7rem', color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center' }}>
          {value && `${value.length} chars · saved`}
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
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={Math.max(4, Math.min(20, value.split('\n').length + 1))}
          placeholder="Markdown welcome. Use [[Doc title]] to link to other wiki/knowledge pages."
          style={{
            width: '100%', border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--bg)', color: 'var(--fg)', padding: '0.7rem 0.9rem',
            fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.55, resize: 'vertical',
            outline: 'none',
          }}
        />
      )}
      {open && mode === 'preview' && (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 6,
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
