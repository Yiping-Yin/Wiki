import Link from 'next/link';
import { neighbors } from '../lib/nav';

/**
 * Chapter-to-chapter navigation at the foot of a reading page.
 *
 * Book-margin styling, not a dashboard card row:
 *   - Thin `var(--border)` hair above (no box borders).
 *   - Italic serif small-caps "previous chapter" / "next chapter" eyebrow.
 *   - Chapter title in Cormorant display italic, no weight bump.
 *   - A leading "‹" / trailing "›" bronze glyph carries direction.
 *
 * Mirrors loom-reading.jsx's "quiet next" convention — at the end of
 * a chapter, the next is whispered, not sold.
 */
export function PrevNext({ slug }: { slug: string }) {
  const { prev, next } = neighbors(slug);
  return (
    <nav
      aria-label="Chapter navigation"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '2rem',
        marginTop: '3rem',
        paddingTop: '1.5rem',
        borderTop: '0.5px solid var(--border)',
      }}
    >
      {prev ? (
        <Link href={`/wiki/${prev.slug}`} style={sideStyle('left')} className="loom-prevnext-side">
          <div style={eyebrowStyle}>‹&nbsp;&nbsp;previous chapter</div>
          <div style={titleStyle}>{prev.title}</div>
        </Link>
      ) : (
        <div style={{ flex: 1 }} />
      )}
      {next ? (
        <Link
          href={`/wiki/${next.slug}`}
          style={sideStyle('right')}
          className="loom-prevnext-side"
        >
          <div style={{ ...eyebrowStyle, textAlign: 'right' }}>next chapter&nbsp;&nbsp;›</div>
          <div style={{ ...titleStyle, textAlign: 'right' }}>{next.title}</div>
        </Link>
      ) : (
        <div style={{ flex: 1 }} />
      )}
    </nav>
  );
}

const sideStyle = (_side: 'left' | 'right'): React.CSSProperties => ({
  flex: 1,
  display: 'block',
  textDecoration: 'none',
  color: 'inherit',
  padding: '0.25rem 0',
});

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  fontSize: '0.72rem',
  color: 'var(--accent-text)',
  fontVariant: 'small-caps',
  letterSpacing: '0.06em',
  textTransform: 'lowercase',
  marginBottom: '0.35rem',
};

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--display)',
  fontStyle: 'italic',
  fontSize: '1.1rem',
  lineHeight: 1.35,
  color: 'var(--fg)',
};
