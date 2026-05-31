'use client';

import type { CSSProperties } from 'react';
import {
  PERSONAL_PLATFORM_HISTORY,
  PERSONAL_PLATFORM_NARRATIVE_LAYERS,
  PERSONAL_PLATFORM_PRODUCT_THESIS,
  PERSONAL_PLATFORM_REFERENCE_INSTANCE,
  PERSONAL_PLATFORM_STACK,
} from '../../lib/new-loom/personal-platform';

/// Vellum About — distilled from the original 489-line dark marketing page.
/// Preserved the load-bearing content (four Commitments + LO/OM/LOOM brand
/// decomposition) and set it on paper. Removed the NavBar / Hero /
/// ParallaxImage / FadeIn chrome — too performative for a reading app.

const COMMITMENTS = [
  { title: 'Source is sacred.',        text: 'The document is the first foreground object. Loom never rewrites the page you are reading.' },
  { title: 'Panels are earned.',       text: 'A panel is a settled judgment, not a decorative card. It arrives when a thought returns three times.' },
  { title: 'Relations are earned.',    text: 'A weave is a judged relation, not a loose backlink list. A thread has to have held weight.' },
  { title: 'Work begins from change.', text: 'The surface shows what is unresolved, not generic activity. A day is not a to-do list.' },
];

const WHY_LOOM_EXISTS = [
  { title: 'Ordinary portfolios only show results.', text: 'They rarely show the sources, attempts, decisions, and revisions that made the work credible.' },
  { title: 'Ordinary notes only help the owner.', text: 'They are useful privately, but they usually do not become an inspectable identity layer for other people.' },
  { title: 'Ordinary chatbots do not know the person.', text: 'They answer from a prompt, not from the person\'s real archive, work, sources, and process.' },
  { title: 'Loom connects identity, proof, and conversation.', text: PERSONAL_PLATFORM_PRODUCT_THESIS },
];

const LOOM_LETTERS = [
  { letter: 'LO',   title: 'Human logic',       text: 'The person keeps judgment: framing the question, choosing the standard, deciding what matters, knowing when something is worth keeping.' },
  { letter: 'OM',   title: 'AI reach',          text: 'The machine widens the field: recall, adjacency, synthesis, pattern visibility at a scale one person cannot manually hold.' },
  { letter: 'LOOM', title: 'One structural word', text: 'At full scale the name stays extended, architectural, quiet. The point is not ornament; it is a stable structure that lets the work carry its own intelligence.' },
];

export default function AboutClient() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg)',
        display: 'flex',
        justifyContent: 'center',
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <article
        style={{
          width: '100%',
          maxWidth: '34rem',
          padding: 'clamp(5rem, 8vh, 8rem) 2rem clamp(3rem, 6vh, 5rem)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Wordmark */}
        <div style={wordmarkStyle}>L</div>
        <h1 style={titleStyle}>Loom</h1>
        <div style={versionStyle}>Vellum&nbsp;II&nbsp;·&nbsp;1.0.0&nbsp;·&nbsp;build&nbsp;42</div>

        <p style={leadParagraphStyle}>A general product for source-backed identity.</p>

        <Divider />

        {/* Opening narrative */}
        <p style={paragraphStyle}>
          Loom helps anyone turn sources, learning paths, projects, drafts, and
          AI conversations into a living knowledge identity. Yiping&apos;s Loom is
          the first reference instance, not the product boundary.
        </p>
        <p style={paragraphStyle}>
          The gap is simple: ordinary portfolios only show results, ordinary
          notes only help the owner, and ordinary chatbots do not know the
          person behind the prompt.
        </p>

        <Divider ornament="✦" />

        <section style={{ width: '100%', marginTop: '1rem' }}>
          <div className="loom-smallcaps" style={eyebrowStyle}>Why Loom exists</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            {WHY_LOOM_EXISTS.map((item) => (
              <div key={item.title} style={{ textAlign: 'left' }}>
                <div style={commitmentTitleStyle}>{item.title}</div>
                <div style={commitmentTextStyle}>{item.text}</div>
              </div>
            ))}
          </div>
        </section>

        <Divider ornament="✦" />

        {/* Commitments */}
        <section style={{ width: '100%', marginTop: '1rem' }}>
          <div className="loom-smallcaps" style={eyebrowStyle}>Four Commitments</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            {COMMITMENTS.map((c) => (
              <div key={c.title} style={{ textAlign: 'left' }}>
                <div style={commitmentTitleStyle}>{c.title}</div>
                <div style={commitmentTextStyle}>{c.text}</div>
              </div>
            ))}
          </div>
        </section>

        <Divider ornament="✦" />

        <section style={{ width: '100%', marginTop: '1rem' }}>
          <div className="loom-smallcaps" style={eyebrowStyle}>Narrative layers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            {PERSONAL_PLATFORM_NARRATIVE_LAYERS.map((item) => (
              <div key={item.title} style={{ textAlign: 'left' }}>
                <div style={commitmentTitleStyle}>{item.title}</div>
                <div style={commitmentTextStyle}>{item.text}</div>
              </div>
            ))}
          </div>
        </section>

        <p style={paragraphStyle}>
          <strong>{PERSONAL_PLATFORM_REFERENCE_INSTANCE.title}.</strong>{' '}
          {PERSONAL_PLATFORM_REFERENCE_INSTANCE.text}
        </p>

        <Divider ornament="✦" />

        <section style={{ width: '100%', marginTop: '1rem' }}>
          <div className="loom-smallcaps" style={eyebrowStyle}>Product story</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            {PERSONAL_PLATFORM_HISTORY.map((item) => (
              <div key={item.date} style={{ textAlign: 'left' }}>
                <div style={commitmentTitleStyle}>{item.date}</div>
                <div style={commitmentTextStyle}>{item.text}</div>
              </div>
            ))}
          </div>
        </section>

        <Divider ornament="✦" />

        <section style={{ width: '100%', marginTop: '1rem' }}>
          <div className="loom-smallcaps" style={eyebrowStyle}>Positioning stack</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1.5rem' }}>
            {PERSONAL_PLATFORM_STACK.map((item) => (
              <div key={item.title} style={{ textAlign: 'left' }}>
                <div style={commitmentTitleStyle}>{item.title}</div>
                <div style={commitmentTextStyle}>{item.text}</div>
              </div>
            ))}
          </div>
        </section>

        <Divider ornament="✦" />

        {/* LO · OM · LOOM brand decomposition */}
        <section style={{ width: '100%' }}>
          <div className="loom-smallcaps" style={eyebrowStyle}>The Name, Unwoven</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '1.5rem' }}>
            {LOOM_LETTERS.map((l) => (
              <div key={l.letter} style={{ display: 'grid', gridTemplateColumns: '4rem 1fr', gap: '1rem', textAlign: 'left', alignItems: 'baseline' }}>
                <div style={letterGlyphStyle}>{l.letter}</div>
                <div>
                  <div style={commitmentTitleStyle}>{l.title}</div>
                  <div style={commitmentTextStyle}>{l.text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Divider ornament="✦" />

        {/* Closing */}
        <p style={paragraphStyle}>Woven by one hand. With thanks to anyone who waited.</p>

        {/* Link row */}
        <nav
          style={{
            marginTop: '3rem',
            display: 'flex',
            gap: '2rem',
            fontFamily: 'var(--serif)',
            fontSize: '0.9rem',
          }}
        >
          <a href="https://loom.app/privacy" style={linkStyle}>Privacy</a>
          <a
            href="/help"
            style={linkStyle}
            onClick={(e) => {
              e.preventDefault();
              window.dispatchEvent(new CustomEvent('loom:open-shortcuts'));
            }}
          >
            Help
          </a>
          <a href="/colophon" style={linkStyle}>Colophon</a>
        </nav>

        <div
          style={{
            marginTop: 'clamp(3rem, 5vh, 4rem)',
            fontFamily: 'var(--serif)',
            fontSize: '0.75rem',
            color: 'var(--muted)',
            letterSpacing: '0.02em',
          }}
        >
          © 2026 · All threads respected
        </div>
      </article>
    </main>
  );
}

const wordmarkStyle: CSSProperties = {
  fontFamily: 'var(--display, var(--serif))',
  fontStyle: 'italic',
  fontSize: '64pt',
  lineHeight: 1,
  color: 'var(--accent-text, var(--fg))',
  marginBottom: '1.5rem',
  letterSpacing: '-0.01em',
};

const titleStyle: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: '1.6rem',
  fontWeight: 400,
  margin: 0,
  color: 'var(--fg)',
  letterSpacing: '-0.005em',
};

const versionStyle: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontStyle: 'italic',
  fontSize: '0.82rem',
  color: 'var(--muted)',
  marginTop: '0.35rem',
  letterSpacing: '0.01em',
};

// Vellum chrome rule: serif small-caps over sans uppercase + tracking.
// Pair with className="loom-smallcaps" on the element for the
// font-variant rule that belongs outside inline style.
const eyebrowStyle: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: '0.82rem',
  color: 'var(--muted)',
  fontWeight: 500,
  marginTop: '1rem',
};

const leadParagraphStyle: CSSProperties = {
  fontFamily: 'var(--display, var(--serif))',
  fontStyle: 'italic',
  fontSize: '1.25rem',
  lineHeight: 1.45,
  color: 'var(--fg)',
  margin: '2rem 0 0',
  maxWidth: '28rem',
  textWrap: 'balance',
};

const paragraphStyle: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: '1rem',
  lineHeight: 1.65,
  color: 'var(--fg)',
  margin: '2rem 0 0',
  maxWidth: '28rem',
  textWrap: 'balance',
};

const commitmentTitleStyle: CSSProperties = {
  fontFamily: 'var(--display, var(--serif))',
  fontStyle: 'italic',
  fontSize: '1.125rem',
  color: 'var(--fg)',
  lineHeight: 1.25,
  marginBottom: '0.3rem',
};

const commitmentTextStyle: CSSProperties = {
  fontFamily: 'var(--serif)',
  fontSize: '0.92rem',
  lineHeight: 1.55,
  color: 'var(--fg-secondary, var(--fg))',
};

const letterGlyphStyle: CSSProperties = {
  fontFamily: 'var(--display, var(--serif))',
  fontStyle: 'italic',
  fontSize: '1.75rem',
  lineHeight: 1,
  color: 'var(--accent-text, var(--accent))',
  letterSpacing: '0.02em',
  textAlign: 'right',
  paddingTop: '0.15rem',
};

const linkStyle: CSSProperties = {
  color: 'var(--accent-text, var(--fg))',
  textDecoration: 'none',
  borderBottom: '0.5px solid color-mix(in srgb, var(--accent-text, var(--fg)) 40%, transparent)',
  paddingBottom: '1px',
};

function Divider({ ornament = '·' }: { ornament?: string }) {
  return (
    <div
      aria-hidden
      style={{
        marginTop: '2.25rem',
        fontFamily: 'var(--display, var(--serif))',
        fontStyle: ornament === '✦' ? 'normal' : 'normal',
        fontSize: ornament === '✦' ? '0.9rem' : '0.9rem',
        color: 'var(--accent)',
        letterSpacing: '0.6em',
      }}
    >
      {`── ${ornament} ──`}
    </div>
  );
}
