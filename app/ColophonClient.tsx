'use client';

import Ornament from '../components/Ornament';

/**
 * ColophonClient — Loom's back matter.
 *
 * Structure (single vertical column, centered on paper):
 *
 *   COLOPHON
 *
 *   Loom
 *   Vellum II
 *
 *   <prose about the type>
 *   <prose about the palette>
 *
 *   Woven by one hand.
 *   With thanks to anyone who waited.
 *
 *   ── · ──
 *
 *   © 2026 · All threads respected
 *
 * Typography:
 *   - Eyebrow "COLOPHON" — small-caps, muted
 *   - Title "Loom" — 64pt italic Cormorant Garamond, ink
 *   - Subtitle "Vellum II" — 24pt italic serif, muted
 *   - Body — 0.95rem EB Garamond, lh 1.7
 *   - Ornament breaks between blocks
 *   - Footer — muted italic, tiny
 *
 * This surface is chrome / identity, so art fonts are allowed (the usual
 * "prefer --serif (New York)" rule applies to user content, not the
 * colophon).
 */
export default function ColophonClient() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(4rem, 8vh, 7rem) clamp(1.5rem, 5vw, 4rem)',
        fontFamily: 'var(--serif)',
      }}
    >
      <article
        style={{
          width: '100%',
          maxWidth: '34rem',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.75rem',
        }}
      >
        {/* Eyebrow — serif small-caps per Vellum chrome rule */}
        <div
          className="loom-smallcaps"
          style={{
            fontFamily: 'var(--serif)',
            fontSize: '0.88rem',
            fontWeight: 500,
            color: 'var(--muted)',
          }}
        >
          Colophon
        </div>

        {/* Title — Loom */}
        <h1
          style={{
            fontFamily: 'Cormorant Garamond, var(--display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: '64px',
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            color: 'var(--fg)',
            margin: 0,
          }}
        >
          Loom
        </h1>

        {/* Subtitle — Vellum II */}
        <div
          style={{
            fontFamily: 'Cormorant Garamond, var(--display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: '24px',
            lineHeight: 1.2,
            color: 'var(--muted)',
            marginTop: '-0.5rem',
          }}
        >
          Vellum II
        </div>

        <Ornament />

        {/* Type paragraph */}
        <p style={bodyStyle}>
          Set in Cormorant Garamond (chrome) and EB Garamond (body), with New
          York as the silent companion for ordinary reading. CJK falls through
          to Songti SC.
        </p>

        {/* Palette paragraph */}
        <p style={bodyStyle}>
          Palette begins in warm paper <Swatch value="#F4F0E4" label="#F4F0E4" />{' '}
          and ends in the ink of a good pencil. Bronze thread is the AI’s
          voice. Rose, sage, indigo, umber, plum, ochre are the categories —
          all earth.
        </p>

        <Ornament />

        {/* Hand paragraph */}
        <p style={bodyStyle}>
          Woven by one hand.
          <br />
          With thanks to anyone who waited.
        </p>

        <Ornament />

        {/* Footer */}
        <div
          style={{
            fontFamily: 'Cormorant Garamond, var(--display)',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: '0.82rem',
            color: 'var(--muted)',
            marginTop: '0.5rem',
          }}
        >
          © 2026 · All threads respected
        </div>
      </article>
    </main>
  );
}

// ── components ────────────────────────────────────────────────────────────

const bodyStyle: React.CSSProperties = {
  fontFamily: "'EB Garamond', var(--serif)",
  fontSize: '0.95rem',
  lineHeight: 1.7,
  color: 'var(--fg)',
  margin: 0,
  maxWidth: '30rem',
  textWrap: 'pretty' as unknown as undefined,
};

/** Tiny inline color chip used inline in the palette sentence. */
function Swatch({ value, label }: { value: string; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '0.35em',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: '0.72em',
          height: '0.72em',
          background: value,
          border: '0.5px solid var(--border, rgba(26,23,18,0.08))',
          borderRadius: 2,
          verticalAlign: 'baseline',
          transform: 'translateY(0.05em)',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--mono)',
          fontSize: '0.82em',
          color: 'var(--muted)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {label}
      </span>
    </span>
  );
}
