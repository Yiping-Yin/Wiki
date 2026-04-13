import Link from 'next/link';
import { neighbors } from '../lib/nav';

export function PrevNext({ slug }: { slug: string }) {
  const { prev, next } = neighbors(slug);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '3rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
      {prev ? (
        <Link href={`/wiki/${prev.slug}`} style={{ flex: 1, padding: '0.8rem 1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Previous</div>
          <div style={{ fontWeight: 600 }}>{prev.title}</div>
        </Link>
      ) : <div style={{ flex: 1 }} />}
      {next ? (
        <Link href={`/wiki/${next.slug}`} style={{ flex: 1, padding: '0.8rem 1rem', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'right' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>Next</div>
          <div style={{ fontWeight: 600 }}>{next.title}</div>
        </Link>
      ) : <div style={{ flex: 1 }} />}
    </div>
  );
}
