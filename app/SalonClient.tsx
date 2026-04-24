'use client';

import Link from 'next/link';

/**
 * SalonClient — a gated social chapter surface.
 *
 * No real salon/session object exists yet, so the route must stay honest:
 * the product language can reserve the chapter, but the UI should not
 * fabricate readers, comments, or consensus that do not exist.
 */
export default function SalonClient() {
  return (
    <main className="loom-salon">
      <div className="loom-example-eyebrow">Salon · no circle is open yet</div>

      <header className="loom-salon-header">
        <div className="loom-salon-eyebrow">Reading together</div>
        <h1 className="loom-salon-title">Salon.</h1>
      </header>

      <div className="loom-empty-state" role="note">
        <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
        <p className="loom-empty-state-copy">
          A salon opens when several readers are actually holding one book together.
          Shared reading sessions are not mirrored into this chapter yet, so Loom keeps the room empty instead of inventing one.
        </p>
        <Link href="/coworks" className="loom-empty-state-action">
          Open Coworks →
        </Link>
      </div>
    </main>
  );
}
