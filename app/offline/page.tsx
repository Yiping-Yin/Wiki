export const metadata = { title: 'Offline · Loom' };

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '70vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
    }}>
      <div className="material-thick" style={{
        padding: '2rem 2.4rem',
        borderRadius: 'var(--r-3)',
        textAlign: 'center',
        maxWidth: 460,
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
  padding: '7px 14px', borderRadius: 999,
  background: 'var(--accent)', color: '#fff',
  textDecoration: 'none', fontWeight: 600,
  boxShadow: 'var(--shadow-1)',
};
