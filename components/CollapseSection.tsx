'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

// CollapseSection — Loom's reusable section-with-folding primitive.
//
// Visual recipe (matches the magazine + Vellum design language):
//   - Header: smallcaps eyebrow + serif title + accent count + chevron
//   - 0.5px hairline border-top, no inset card chrome (sections live
//     INSIDE a parent surface)
//   - Content: vertical-rhythm padding, smooth slide animation
//   - State persisted to localStorage by `id` so the user's last
//     fold state survives reload
//
// Scopes that should reuse this:
//   - Captures landing (Today / Yesterday / This Week / Older)
//   - Article reader (H2 sections)
//   - Sidebar (Workspaces / Folders / Tools when overgrown)
//   - Web Capture setup (Install / Test / Storage / Tips)

interface CollapseSectionProps {
  /// Stable identifier — used as the localStorage key for persisted
  /// fold state. If null, state is in-memory only.
  id?: string;
  /// Smallcaps lead-in. e.g., "TODAY", "WEB", "INTRODUCTION".
  eyebrow?: string;
  /// Section title — the human-readable name.
  title: ReactNode;
  /// Tail meta — appears between title and chevron, italic muted.
  /// Used for "spark info" beyond the count: "last 2h ago · 3 domains".
  meta?: ReactNode;
  /// Numeric count — rendered as oldstyle italic chip on the right.
  count?: number;
  /// Initial state when no localStorage record exists.
  defaultOpen?: boolean;
  /// Lock open — header still rendered but chevron hidden, click is
  /// no-op. For sections that must always be visible.
  forceOpen?: boolean;
  children: ReactNode;
}

export function CollapseSection({
  id,
  eyebrow,
  title,
  meta,
  count,
  defaultOpen = false,
  forceOpen = false,
  children,
}: CollapseSectionProps) {
  const storageKey = id ? `loom:collapse:${id}` : null;
  const [open, setOpen] = useState<boolean>(() => {
    if (forceOpen) return true;
    if (typeof window !== 'undefined' && storageKey) {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === '1') return true;
      if (raw === '0') return false;
    }
    return defaultOpen;
  });
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (forceOpen) return;
    if (typeof window === 'undefined' || !storageKey) return;
    window.localStorage.setItem(storageKey, open ? '1' : '0');
  }, [open, storageKey, forceOpen]);

  const effectiveOpen = forceOpen || open;

  return (
    <section className="loom-collapse">
      <header
        className={`loom-collapse-header${forceOpen ? ' locked' : ''}`}
        role={forceOpen ? undefined : 'button'}
        tabIndex={forceOpen ? -1 : 0}
        aria-expanded={effectiveOpen}
        onClick={forceOpen ? undefined : () => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (forceOpen) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <div className="lead">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <span className="title">{title}</span>
          {typeof count === 'number' && count > 0 && (
            <span className="count">{count}</span>
          )}
        </div>
        <div className="tail">
          {meta && <span className="meta">{meta}</span>}
          {!forceOpen && (
            <span className={`chevron${effectiveOpen ? ' open' : ''}`} aria-hidden>
              ›
            </span>
          )}
        </div>
      </header>
      <div
        className={`loom-collapse-body${effectiveOpen ? ' open' : ''}`}
        ref={contentRef}
        aria-hidden={!effectiveOpen}
      >
        <div className="loom-collapse-inner">{children}</div>
      </div>
      <style jsx>{`
        .loom-collapse {
          border-top: 0.5px solid color-mix(in srgb, var(--fg) 14%, transparent);
        }
        .loom-collapse:first-of-type {
          border-top: none;
        }
        .loom-collapse-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 1rem;
          padding: 0.95rem 0.2rem 0.85rem;
          cursor: pointer;
          user-select: none;
          transition: color 120ms ease;
        }
        .loom-collapse-header.locked {
          cursor: default;
        }
        .loom-collapse-header:hover .title {
          color: var(--accent);
        }
        .loom-collapse-header:focus-visible {
          outline: 1px solid var(--accent);
          outline-offset: 2px;
          border-radius: 2px;
        }
        .lead {
          display: flex;
          align-items: baseline;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .eyebrow {
          font-family: var(--serif);
          font-size: 0.7rem;
          font-weight: 500;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .title {
          font-family: var(--display);
          font-size: 1.05rem;
          font-weight: 500;
          color: var(--fg);
          line-height: 1.2;
          transition: color 120ms ease;
        }
        .count {
          font-family: var(--serif);
          font-style: italic;
          font-feature-settings: "onum" 1, "tnum" 1;
          font-size: 0.86rem;
          color: var(--muted);
        }
        .tail {
          display: flex;
          align-items: baseline;
          gap: 0.7rem;
          color: var(--muted);
          font-family: var(--serif);
          font-size: 0.78rem;
          font-feature-settings: "onum" 1, "pnum" 1;
        }
        .meta {
          font-style: italic;
        }
        .chevron {
          display: inline-block;
          font-size: 1.05rem;
          line-height: 1;
          color: var(--muted);
          transition: transform 180ms ease, color 120ms ease;
        }
        .chevron.open {
          transform: rotate(90deg);
          color: var(--accent);
        }
        .loom-collapse-body {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 240ms ease, opacity 220ms ease;
          opacity: 0;
        }
        .loom-collapse-body.open {
          grid-template-rows: 1fr;
          opacity: 1;
        }
        .loom-collapse-inner {
          overflow: hidden;
          min-height: 0;
        }
        .loom-collapse-body.open .loom-collapse-inner {
          padding-bottom: 1.1rem;
        }
      `}</style>
    </section>
  );
}
