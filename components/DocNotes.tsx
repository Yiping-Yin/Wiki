'use client';
import { useEffect, useState } from 'react';
import { useNote } from '../lib/use-notes';

export function DocNotes({ id }: { id: string }) {
  const [value, setValue, loaded] = useNote(id);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loaded && value) setOpen(true);
  }, [loaded, value]);

  useEffect(() => {
    if (!loaded) return;
    setSavedAt(value ? Date.now() : null);
  }, [value, loaded]);

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
        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
          {value ? `${value.length} chars · saved` : 'autosaves to this device'}
          {!open && (
            <button
              onClick={() => setOpen(true)}
              style={{ marginLeft: 8, background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 8px', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.7rem' }}
            >open</button>
          )}
        </span>
      </div>
      {open && (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={Math.max(4, Math.min(20, value.split('\n').length + 1))}
          placeholder="Write notes here. Markdown welcome. Saves automatically to localStorage."
          style={{
            width: '100%', border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--bg)', color: 'var(--fg)', padding: '0.7rem 0.9rem',
            fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.55, resize: 'vertical',
            outline: 'none',
          }}
        />
      )}
    </div>
  );
}
