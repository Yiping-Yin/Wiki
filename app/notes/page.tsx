'use client';
/**
 * /notes — legacy transition page.
 *
 * "Notes" used to mean freeform local text. In Loom's current model the
 * real note is an anchored note (thought-anchor): a piece of understanding
 * attached to a source passage. Keep the route for backward compatibility,
 * but remove it from primary navigation and explain the updated model.
 */
import Link from 'next/link';

export default function NotesPage() {
  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 18,
            height: 1,
            background: 'var(--accent)',
            opacity: 0.55,
          }}
        />
        <span
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            fontWeight: 700,
          }}
        >
          Legacy Notes
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
      </div>

      <h1 style={{ marginBottom: '0.8rem' }}>Notes are now anchored notes</h1>
      <p>
        In Loom, a note is no longer a free-floating text blob. The real note is
        an <strong>anchored note</strong>: one piece of understanding attached to
        one source passage.
      </p>
      <p>
        <strong>Highlights</strong> tell you what you marked.
        <br />
        <strong>Anchored notes</strong> tell you what you understood.
      </p>
      <p>
        Open any studied document to see its <strong>◆ anchored notes</strong> in
        the margin and the <strong>thought map</strong> on the right. Open{' '}
        <Link href="/highlights">Highlights</Link> to review raw source marks, or{' '}
        <Link href="/kesi">Kesi</Link> to review finished panels.
      </p>
    </div>
  );
}
