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
        <h1 style={{
          margin: 0, color: 'var(--fg)', padding: 0, border: 0,
          fontFamily: 'var(--serif)', fontStyle: 'italic', fontWeight: 500,
          fontSize: 'var(--t-title2)', letterSpacing: '-0.01em',
        }}>This source isn&rsquo;t cached yet</h1>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* eslint-disable @next/next/no-html-link-for-pages */}
          <a href="/" className="t-footnote" style={pillStyle}>Continue weaving</a>
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
