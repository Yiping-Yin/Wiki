'use client';
/**
 * PDFNotes · used by wiki MDX pages to embed a PDF.
 *
 * §1, §17, §23 — the previous version had a "✏ Notes / Hide notes" toggle
 * with a sticky textarea pinned to the bottom of the PDF. That was a
 * deliberate "notes happen here" container — exactly the chrome the user
 * called out as too rigid.
 *
 * The new version is just the PDF, presented at full reading width with
 * stealth chrome that fades in only on hover. Notes happen via:
 *   1. Selecting text → SelectionWarp ✦ → ChatFocus (inline)
 *   2. ⌘/ → Review the current woven understanding
 *
 * No fixed "notes" surface anymore. Notes attach to where you were
 * thinking, not to where the box is.
 */
import { useState } from 'react';

export function PDFNotes({ src, title, height = 720 }: { src: string; title?: string; height?: number }) {
  const [hover, setHover] = useState(false);

  // Strip PDF.js chrome via the URL hash (§14)
  const cleanSrc = src.includes('#')
    ? src
    : `${src}#toolbar=0&navpanes=0&statusbar=0&view=FitH`;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        margin: '1.4rem 0',
        overflow: 'hidden',
        borderTop: '0.5px solid var(--mat-border)',
        borderBottom: '0.5px solid var(--mat-border)',
      }}
    >
      {/* Floating header — visible only on hover, doesn't take layout space */}
      {title && (
        <div style={{
          position: 'absolute',
          top: 8, left: 8, right: 8,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0.35rem 0.1rem',
          background: 'color-mix(in srgb, var(--bg) 92%, transparent)',
          backdropFilter: 'saturate(150%) blur(12px)',
          WebkitBackdropFilter: 'saturate(150%) blur(12px)',
          fontSize: '0.78rem',
          color: 'var(--fg)',
          opacity: hover ? 1 : 0,
          transform: hover ? 'translateY(0)' : 'translateY(-4px)',
          transition: 'opacity 0.2s var(--ease), transform 0.2s var(--ease)',
          pointerEvents: hover ? 'auto' : 'none',
          zIndex: 2,
          borderBottom: '0.5px solid var(--mat-border)',
        }}>
          <span style={{
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--fg)',
          }}>{title}</span>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            style={{
              color: 'var(--accent)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.74rem',
              flexShrink: 0,
            }}
          >Open</a>
        </div>
      )}

      <iframe
        src={cleanSrc}
        title={title ?? 'PDF'}
        style={{
          width: '100%',
          height,
          border: 0,
          display: 'block',
          background: 'var(--bg)',
        }}
      />
    </div>
  );
}
