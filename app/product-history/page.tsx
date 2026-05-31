import { PageFrame } from '../../components/PageFrame';
import {
  PERSONAL_PLATFORM_HISTORY,
  PERSONAL_PLATFORM_NARRATIVE_LAYERS,
  PERSONAL_PLATFORM_PITCH_COPY,
  PERSONAL_PLATFORM_PRODUCT_THESIS,
  PERSONAL_PLATFORM_REFERENCE_INSTANCE,
  PERSONAL_PLATFORM_STACK,
} from '../../lib/new-loom/personal-platform';

export const metadata = { title: 'Product History · Loom' };

const sectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
} as const;

const eyebrowStyle = {
  color: 'var(--accent)',
  fontFamily: 'var(--serif)',
  fontSize: '0.82rem',
  fontWeight: 500,
  margin: 0,
} as const;

const sectionTitleStyle = {
  color: 'var(--fg)',
  fontFamily: 'var(--display)',
  fontSize: 'var(--fs-h2)',
  fontStyle: 'italic',
  fontWeight: 400,
  lineHeight: 1.15,
  margin: 0,
} as const;

const bodyStyle = {
  color: 'var(--fg-secondary)',
  fontSize: 'var(--fs-body-lg)',
  lineHeight: 'var(--lh-relaxed)',
  margin: 0,
  maxWidth: 720,
} as const;

const listStyle = {
  display: 'grid',
  gap: 'var(--space-4)',
  listStyle: 'none',
  margin: 0,
  padding: 0,
} as const;

const itemStyle = {
  borderBottom: '0.5px solid color-mix(in srgb, var(--mat-border) 70%, transparent)',
  display: 'grid',
  gap: 'var(--space-1)',
  paddingBottom: 'var(--space-4)',
} as const;

const itemTitleStyle = {
  color: 'var(--fg)',
  fontFamily: 'var(--display)',
  fontSize: 'var(--fs-h3)',
  fontStyle: 'italic',
  fontWeight: 400,
  lineHeight: 1.2,
} as const;

const itemTextStyle = {
  color: 'var(--fg-secondary)',
  fontSize: 'var(--fs-body)',
  lineHeight: 'var(--lh-body)',
  margin: 0,
} as const;

const FIRST_REFERENCE_INSTANCE_LINE = PERSONAL_PLATFORM_REFERENCE_INSTANCE.title.replace(
  'Yiping is',
  "Yiping's Loom is",
);

export default function ProductHistoryPage() {
  return (
    <article className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: 'var(--space-9)' }}>
      <PageFrame
        eyebrow="Product history"
        title="Why Loom is called Loom."
        description={PERSONAL_PLATFORM_PRODUCT_THESIS}
      >
        <section style={sectionStyle}>
          <p style={bodyStyle}>
            Loom is named for the act of weaving many strands into one inspectable
            fabric. Sources are the warp: stable, vertical evidence that keeps
            the work under tension. Notes, drafts, AI conversations, and projects
            are the weft: the crosswise passes that turn source material into
            identity, judgment, and output.
          </p>
          <p style={bodyStyle}>
            {PERSONAL_PLATFORM_REFERENCE_INSTANCE.text}{' '}
            <strong>{FIRST_REFERENCE_INSTANCE_LINE}</strong>,
            but the product is the repeatable structure behind it.
          </p>
          <p style={bodyStyle}>
            The approved layers are Portfolio with proof, Source to identity, and
            AI persona.
          </p>
        </section>

        <section style={sectionStyle} aria-labelledby="product-timeline-title">
          <p className="loom-smallcaps" style={eyebrowStyle}>Timeline</p>
          <h2 id="product-timeline-title" style={sectionTitleStyle}>Product timeline</h2>
          <ol style={listStyle}>
            {PERSONAL_PLATFORM_HISTORY.map((item) => (
              <li key={item.date} style={itemStyle}>
                <time style={itemTitleStyle}>{item.date}</time>
                <p style={itemTextStyle}>{item.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section style={sectionStyle} aria-labelledby="three-layer-narrative-title">
          <p className="loom-smallcaps" style={eyebrowStyle}>Narrative</p>
          <h2 id="three-layer-narrative-title" style={sectionTitleStyle}>Three-layer narrative</h2>
          <ul style={listStyle}>
            {PERSONAL_PLATFORM_NARRATIVE_LAYERS.map((item) => (
              <li key={item.title} style={itemStyle}>
                <strong style={itemTitleStyle}>{item.title}</strong>
                <p style={itemTextStyle}>{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section style={sectionStyle} aria-labelledby="positioning-stack-title">
          <p className="loom-smallcaps" style={eyebrowStyle}>Stack</p>
          <h2 id="positioning-stack-title" style={sectionTitleStyle}>Positioning stack</h2>
          <ul style={listStyle}>
            {PERSONAL_PLATFORM_STACK.map((item) => (
              <li key={item.title} style={itemStyle}>
                <strong style={itemTitleStyle}>{item.title}</strong>
                <p style={itemTextStyle}>{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section style={sectionStyle} aria-labelledby="pitch-copy-title">
          <p className="loom-smallcaps" style={eyebrowStyle}>Pitch</p>
          <h2 id="pitch-copy-title" style={sectionTitleStyle}>Reusable pitch copy</h2>
          <dl style={listStyle}>
            {Object.entries(PERSONAL_PLATFORM_PITCH_COPY).map(([label, text]) => (
              <div key={label} style={itemStyle}>
                <dt style={itemTitleStyle}>{label}</dt>
                <dd style={{ ...itemTextStyle, margin: 0 }}>{text}</dd>
              </div>
            ))}
          </dl>
        </section>
      </PageFrame>
    </article>
  );
}
