'use client';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();
  // Using a button, not <a>. WebKit's `:visited` link color is special-cased
  // for history-privacy and overrides our inline/stylesheet color even with
  // `!important`. A button sidesteps that entirely and renders bronze.
  return (
    <div className="article-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>404</h1>
      <p style={{ color: 'var(--text-secondary, #666)' }}>Page not found</p>
      <button
        type="button"
        onClick={() => router.push('/')}
        style={{
          marginTop: '1rem',
          background: 'transparent',
          border: 0,
          padding: '0 0 2px 0',
          color: 'var(--accent)',
          font: 'inherit',
          cursor: 'pointer',
          borderBottom: '1px solid transparent',
          transition: 'border-bottom-color 160ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = 'var(--accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'transparent'; }}
      >
        Back to home
      </button>
    </div>
  );
}
