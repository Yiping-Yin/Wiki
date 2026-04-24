import Link from 'next/link';
import { QuietScene } from '../components/QuietScene';
import { PageFrame } from '../components/PageFrame';
import { WorkAction, WorkEyebrow, WorkSurface, WorkTextAction } from '../components/WorkSurface';

export function AtlasHubClient({
  sourceCollections,
  sourceDocs,
  wikiSections,
  wikiDocs,
}: {
  sourceCollections: number;
  sourceDocs: number;
  wikiSections: number;
  wikiDocs: number;
}) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <QuietScene tone="atlas">
        <PageFrame
          eyebrow="Atlas"
          title="Sources and LLM Wiki"
          description={
            <>
              Atlas is now the doorway. Your own materials live under <strong>Sources</strong>;
              bundled course notes live under <strong>LLM Wiki</strong>.
            </>
          }
        >
          <div
            style={{
              display: 'grid',
              gap: 'var(--space-5)',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            }}
          >
            <WorkSurface tone="primary" density="roomy">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <WorkEyebrow>Sources</WorkEyebrow>
                  <div
                    style={{
                      fontFamily: 'var(--display)',
                      fontSize: '1.75rem',
                      fontStyle: 'italic',
                      lineHeight: 1.02,
                      color: 'var(--fg)',
                    }}
                  >
                    Your materials, grouped.
                  </div>
                  <div style={{ color: 'var(--fg-secondary)', lineHeight: 1.55 }}>
                    {sourceCollections} collections and {sourceDocs} docs across your chosen source folder.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <WorkAction label="Open sources" href="/sources" tone="primary" />
                  <WorkTextAction label="Shelf view" href="/atlas/shelf" emphasis />
                </div>
              </div>
            </WorkSurface>

            <WorkSurface tone="quiet" density="roomy">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <WorkEyebrow>LLM Wiki</WorkEyebrow>
                  <div
                    style={{
                      fontFamily: 'var(--display)',
                      fontSize: '1.75rem',
                      fontStyle: 'italic',
                      lineHeight: 1.02,
                      color: 'var(--fg)',
                    }}
                  >
                    Bundled course notes.
                  </div>
                  <div style={{ color: 'var(--fg-secondary)', lineHeight: 1.55 }}>
                    {wikiSections} sections and {wikiDocs} entries, grouped by topic rather than by your file system.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <WorkAction label="Open LLM Wiki" href="/llm-wiki" tone="secondary" />
                  <WorkTextAction label="Start at LLM101n" href="/wiki/llm101n" emphasis />
                </div>
              </div>
            </WorkSurface>
          </div>

          <div
            className="t-caption2"
            style={{ color: 'var(--muted)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}
          >
            <span>Compatibility routes stay live.</span>
            <span aria-hidden>·</span>
            <Link href="/knowledge" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              /knowledge
            </Link>
            <span>now resolves to Sources.</span>
            <span aria-hidden>·</span>
            <Link href="/wiki/llm101n" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              /wiki/*
            </Link>
            <span>continues to open docs directly.</span>
          </div>
        </PageFrame>
      </QuietScene>
    </main>
  );
}
