import Link from 'next/link';
import { QuietScene } from '../../components/QuietScene';
import { PageFrame } from '../../components/PageFrame';
import { WorkEyebrow, WorkSurface } from '../../components/WorkSurface';
import { getWikiHomeSections } from '../../lib/wiki-home';

export const metadata = { title: 'LLM Wiki · Loom' };

export default async function LLMWikiPage() {
  const sections = await getWikiHomeSections();
  const totalDocs = sections.reduce((sum, section) => sum + section.count, 0);

  return (
    <main style={{ minHeight: '100vh' }}>
      <QuietScene tone="atlas">
        <PageFrame
          breadcrumb={
            <>
              <Link href="/desk" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                Desk
              </Link>
              <span aria-hidden>›</span>
              <span>LLM Wiki</span>
            </>
          }
          eyebrow="Reference"
          title="LLM Wiki"
          description={
            <>
              <span>{sections.length} sections · {totalDocs} entries</span>
              <br />
              Built-in curriculum grouped by topic. These pages are read-only reference beside your own sources.
            </>
          }
        >
          <div style={{ display: 'grid', gap: 'var(--space-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {sections.map((section) => (
              <WorkSurface key={section.label} tone="quiet" density="regular">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                    <WorkEyebrow subtle>{section.label}</WorkEyebrow>
                    <div style={{ color: 'var(--fg-secondary)', fontSize: '0.84rem' }}>
                      {section.count} entries
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {section.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        style={{
                          textDecoration: 'none',
                          color: 'var(--fg)',
                          fontFamily: 'var(--display)',
                          fontSize: '1.02rem',
                          lineHeight: 1.15,
                        }}
                      >
                        {item.title}
                      </Link>
                    ))}
                  </div>
                </div>
              </WorkSurface>
            ))}
          </div>
        </PageFrame>
      </QuietScene>
    </main>
  );
}
