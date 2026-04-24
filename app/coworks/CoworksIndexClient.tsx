'use client';

/**
 * CoworksIndexClient — rooms open for thinking together.
 *
 * Vellum surface. A cowork is a rehearsal room: a question being worked
 * on, with materials attached. The Salon is one such room. This listing
 * is meant to read as a page in a book, not a dashboard of cards.
 */

import type { CoworkSummary } from '../../lib/cowork-types';

type CoworkRow = CoworkSummary & {
  categoryLabel: string;
  scratchPreview?: string;
  reflectionPreview?: string;
};

function statusOf(c: CoworkRow): 'active' | 'held' | 'closed' {
  if (c.hasReflection) return 'closed';
  const day = 86_400_000;
  const age = Date.now() - c.updatedAt;
  if (age < day) return 'active';
  return 'held';
}

function statusLabel(status: 'active' | 'held' | 'closed'): string {
  if (status === 'active') return 'active';
  if (status === 'held') return 'held';
  return 'closed';
}

export function CoworksIndexClient({ coworks }: { coworks: CoworkRow[] }) {
  const count = coworks.length;

  const narrative =
    count === 0
      ? 'No rooms are open yet. Open a source and start one when a question wants company.'
      : count === 1
        ? 'One room is open. It holds a question being worked on.'
        : `${spellOrNumber(count)} rooms are open. Each holds a question being worked on together.`;

  return (
    <main className="loom-coworks">
      <div className="loom-coworks-eyebrow">ROOMS OPEN · {count}</div>
      <h1 className="loom-coworks-title">Coworks.</h1>
      <p className="loom-coworks-intro">{narrative}</p>

      {count > 0 && (
        <ul className="loom-coworks-list">
          {coworks.map((c) => {
            const status = statusOf(c);
            const people = Math.max(1, Math.min(c.materialCount, 9));
            return (
              <li key={c.id}>
                <a
                  className="loom-coworks-row"
                  href={`/knowledge/${c.categorySlug}/cowork/${c.id}`}
                >
                  <div className="loom-coworks-row-title">{c.title}</div>
                  <div className="loom-coworks-row-meta">
                    {people} {people === 1 ? 'voice' : 'voices'} · {c.categoryLabel} · {statusLabel(status)}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <div className="loom-coworks-actions">
        <LiteraryAction label="Open Sources →" href="/sources" />
        <LiteraryAction label="Join a Salon →" href="/salon" />
      </div>
    </main>
  );
}

function spellOrNumber(n: number): string {
  const words = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
  return words[n] ?? String(n);
}

function LiteraryAction({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid transparent',
        padding: '0 0 2px 0',
        margin: 0,
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: '1rem',
        lineHeight: 1.4,
        color: 'var(--fg-secondary)',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'color 160ms ease, border-bottom-color 160ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = 'var(--accent-text)';
        e.currentTarget.style.borderBottomColor = 'var(--accent)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = 'var(--fg-secondary)';
        e.currentTarget.style.borderBottomColor = 'transparent';
      }}
    >
      {label}
    </a>
  );
}
