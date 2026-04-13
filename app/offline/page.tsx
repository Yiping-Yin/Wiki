export const metadata = { title: 'Offline · Loom' };

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '70vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
    }}>
      <div style={{
        padding: '1.2rem 0',
        maxWidth: 520,
        width: '100%',
        borderTop: '0.5px solid var(--mat-border)',
        borderBottom: '0.5px solid var(--mat-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.65 }} />
          <span
            className="t-caption2"
            style={{
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 700,
            }}
          >
            Keep weaving offline
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
        </div>
        <h1 className="t-title2" style={{
          margin: 0, color: 'var(--fg)', padding: 0, border: 0,
        }}>This source isn&rsquo;t cached yet</h1>
        <p className="t-footnote" style={{
          marginTop: 8, color: 'var(--fg-secondary)', lineHeight: 1.55,
        }}>
          Pages you&rsquo;ve already opened can keep carrying the weave. Try the surfaces that still hold your current context.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* eslint-disable @next/next/no-html-link-for-pages */}
          <a href="/" className="t-footnote" style={pillStyle}>Continue weaving</a>
          <a href="/today" className="t-footnote" style={pillStyle}>Keep moving</a>
          <a href="/kesi" className="t-footnote" style={pillStyle}>Open Kesi</a>
          <a href="/highlights" className="t-footnote" style={pillStyle}>Return to source</a>
          {/* Plain anchors are intentional — this page must work without the JS router. */}
        </div>
      </div>
    </div>
  );
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '4px 0', borderRadius: 999,
  background: 'transparent', color: 'var(--accent)',
  textDecoration: 'none', fontWeight: 600,
  borderBottom: '0.5px solid var(--accent)',
};
