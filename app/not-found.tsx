import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="article-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>404</h1>
      <p style={{ color: 'var(--text-secondary, #666)' }}>Page not found</p>
      <Link href="/" style={{ marginTop: '1rem', color: 'var(--accent, #0071e3)' }}>Back to home</Link>
    </div>
  );
}
