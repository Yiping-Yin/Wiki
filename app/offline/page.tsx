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
        textAlign: 'center',
        maxWidth: 460,
        width: '100%',
        borderTop: '0.5px solid var(--mat-border)',
        borderBottom: '0.5px solid var(--mat-border)',
      }}>
        <h1 className="t-title2" style={{
          margin: 0, color: 'var(--fg)', padding: 0, border: 0,
        }}>You&rsquo;re offline</h1>
        <p className="t-footnote" style={{
          marginTop: 8, color: 'var(--fg-secondary)', lineHeight: 1.55,
        }}>
          This page hasn&rsquo;t been cached yet. Pages you&rsquo;ve visited before will keep working — try Today, Knowledge or your highlights.
        </p>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {/* eslint-disable @next/next/no-html-link-for-pages */}
          <a href="/" className="t-footnote" style={pillStyle}>Home</a>
          <a href="/today" className="t-footnote" style={pillStyle}>Today</a>
          <a href="/highlights" className="t-footnote" style={pillStyle}>Highlights</a>
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
