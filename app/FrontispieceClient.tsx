'use client';

/**
 * FrontispieceClient — Loom's title page (front matter).
 *
 * The ceremonial opening of the bound volume. Paper bg, centered layout,
 * Cormorant italic title, ornament, edition info, opening tagline.
 *
 * Structure:
 *
 *   (breathing room — the eye rests)
 *
 *   L                              (huge italic bronze wordmark)
 *
 *   Loom                           (Cormorant italic 48pt)
 *   Vellum II                      (Cormorant italic 22pt muted)
 *
 *   ── ✦ ──                         (ornament)
 *
 *   A room for slow reading.       (serif italic tagline)
 *
 *   First published MMXXVI
 *   © 2026 · all threads respected
 *
 * This is chrome/identity, so art fonts are allowed (the usual prefer-New
 * York rule applies to user content, not to the frontispiece).
 */
export default function FrontispieceClient() {
  return (
    <main className="loom-frontispiece">
      {/* Huge italic L wordmark — the book's monogram. */}
      <div className="loom-frontispiece-L" aria-hidden="true">
        L
      </div>

      {/* Title — Loom */}
      <h1 className="loom-frontispiece-title">Loom</h1>

      {/* Edition — Vellum II */}
      <div className="loom-frontispiece-subtitle">Vellum II</div>

      {/* Ornament break — ── ✦ ── */}
      <Ornament />

      {/* Tagline — the book's opening sentence. */}
      <p className="loom-frontispiece-tagline">A room for slow reading.</p>

      {/* Imprint — pushed to the bottom by margin-top: auto. */}
      <div className="loom-frontispiece-imprint">
        First published MMXXVI
        <br />
        © 2026 · all threads respected
      </div>
    </main>
  );
}

/** Breath-mark ornament with a centered diamond glyph: ── ✦ ── */
function Ornament() {
  return (
    <div
      className="loom-frontispiece-ornament"
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: '2.5rem',
          height: 0,
          borderTop: '0.5px solid var(--accent)',
          opacity: 0.7,
        }}
      />
      <span style={{ fontSize: '0.85rem', letterSpacing: 0 }}>✦</span>
      <span
        style={{
          display: 'inline-block',
          width: '2.5rem',
          height: 0,
          borderTop: '0.5px solid var(--accent)',
          opacity: 0.7,
        }}
      />
    </div>
  );
}
