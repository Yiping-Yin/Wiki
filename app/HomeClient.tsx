'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY } from '../lib/loom-panel-records';
import { loadPursuitRecords, PURSUIT_RECORDS_KEY } from '../lib/loom-pursuit-records';
import { loadWeaveRecords, WEAVE_RECORDS_KEY } from '../lib/loom-weave-records';
import {
  RECENT_RECORDS_KEY,
  loadLatestRecentRecord,
  type LoomRecentRecord,
} from '../lib/loom-recent-records';
import {
  PERSONAL_PLATFORM_HISTORY,
  PERSONAL_PLATFORM_MODEL,
  PERSONAL_PLATFORM_NARRATIVE_LAYERS,
  PERSONAL_PLATFORM_OUTPUTS,
  PERSONAL_PLATFORM_PROCESS,
  PERSONAL_PLATFORM_PRODUCT_THESIS,
  PERSONAL_PLATFORM_PROGRESS,
  PERSONAL_PLATFORM_REFERENCE_INSTANCE,
  PERSONAL_PLATFORM_SECTIONS,
  PERSONAL_PLATFORM_STACK,
} from '../lib/new-loom/personal-platform';

type LoomNavigateWindow = {
  webkit?: {
    messageHandlers?: {
      loomNavigate?: { postMessage: (msg: unknown) => void };
    };
  };
};

function callNativeBridge(action: string, payload?: Record<string, unknown>) {
  try {
    const handler = (window as unknown as LoomNavigateWindow).webkit?.messageHandlers
      ?.loomNavigate;
    if (handler?.postMessage) {
      handler.postMessage({ action, ...(payload ?? {}) });
      return true;
    }
  } catch (_) {}
  return false;
}

function countFromPayload(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const field of ['items', 'panels', 'pursuits', 'weaves']) {
      const v = o[field];
      if (Array.isArray(v)) return v.length;
    }
  }
  return 0;
}

function formatActivity(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatNativeActivitySummary({
  panelCount,
  pursuitCount,
  weaveCount,
}: {
  panelCount: number;
  pursuitCount: number;
  weaveCount: number;
}) {
  return [
    `Draft: ${formatActivity(panelCount, 'item', 'items')}`,
    `Process: ${formatActivity(pursuitCount, 'path', 'paths')}`,
    `Sources: ${formatActivity(weaveCount, 'link', 'links')}`,
  ].join(', ');
}

export function HomeClient() {
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<LoomRecentRecord | null>(null);
  const [panelCount, setPanelCount] = useState(0);
  const [pursuitCount, setPursuitCount] = useState(0);
  const [weaveCount, setWeaveCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const [nextRecent, nextPanelCount, nextPursuitCount, nextWeaveCount] = await Promise.all([
        loadLatestRecentRecord(),
        loadPanelRecords().then(countFromPayload),
        loadPursuitRecords().then(countFromPayload),
        loadWeaveRecords().then(countFromPayload),
      ]);
      if (cancelled) return;
      setRecent(nextRecent);
      setPanelCount(nextPanelCount);
      setPursuitCount(nextPursuitCount);
      setWeaveCount(nextWeaveCount);
      setReady(true);
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const dispose = subscribeLoomMirror(RECENT_RECORDS_KEY, 'loom-recents-updated', () => {
      void loadLatestRecentRecord().then((next) => {
        if (!cancelled) setRecent(next);
      });
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshPanels = async () => {
      const next = countFromPayload(await loadPanelRecords());
      if (!cancelled) setPanelCount(next);
    };
    const refreshPursuits = async () => {
      const next = countFromPayload(await loadPursuitRecords());
      if (!cancelled) setPursuitCount(next);
    };
    const refreshWeaves = async () => {
      const next = countFromPayload(await loadWeaveRecords());
      if (!cancelled) setWeaveCount(next);
    };
    const disposePanels = subscribeLoomMirror(PANEL_RECORDS_KEY, 'loom-panels-updated', () => {
      void refreshPanels();
    });
    const disposePursuits = subscribeLoomMirror(PURSUIT_RECORDS_KEY, 'loom-pursuits-updated', () => {
      void refreshPursuits();
    });
    const disposeWeaves = subscribeLoomMirror(WEAVE_RECORDS_KEY, 'loom-weaves-updated', () => {
      void refreshWeaves();
    });
    return () => {
      cancelled = true;
      disposePanels();
      disposePursuits();
      disposeWeaves();
    };
  }, []);

  const handleOpenSources = () => {
    const href = '/knowledge';
    if (callNativeBridge('navigate', { href })) return;
    window.location.href = href;
  };

  const handleOpenRecent = () => {
    if (!recent) return;
    if (callNativeBridge('navigate', { href: recent.href })) return;
    window.location.href = recent.href;
  };

  return (
    <main className="new-loom-shell" aria-labelledby="new-loom-title" style={shellStyle}>
      <section className="new-loom-shell__hero" style={heroStyle}>
        <p style={eyebrowStyle}>New Loom</p>
        <h1 id="new-loom-title" style={titleStyle}>
          Loom is a personal knowledge identity platform.
        </h1>
        <p className="new-loom-shell__summary" style={summaryStyle}>
          {PERSONAL_PLATFORM_PRODUCT_THESIS}
        </p>
        <div style={actionRowStyle}>
          <HomeAction onClick={handleOpenSources} label="Open Sources" />
          {recent ? <HomeAction onClick={handleOpenRecent} label={`Return to ${recent.title}`} /> : null}
        </div>
      </section>

      <section aria-labelledby="loom-model-title" style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <p style={eyebrowStyle}>Model</p>
          <h2 id="loom-model-title" style={sectionTitleStyle}>
            Overview, path, evidence, process, output.
          </h2>
        </div>
        <ol style={modelGridStyle}>
          {PERSONAL_PLATFORM_MODEL.map((label, index) => (
            <li key={label} style={modelItemStyle}>
              <span style={modelNumberStyle}>{String(index + 1).padStart(2, '0')}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="loom-primitives-title" style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <p style={eyebrowStyle}>Primitives</p>
          <h2 id="loom-primitives-title" style={sectionTitleStyle}>
            Sources and Draft stay canonical.
          </h2>
        </div>
        <div style={twoColumnStyle}>
          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Sources</h3>
            <p style={moduleTextStyle}>
              Sources collect official material, local notes, project traces, and AI
              conversations while preserving provenance.
            </p>
          </article>
          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Draft</h3>
            <p style={moduleTextStyle}>
              Draft turns those sources into working output: writing, continuation,
              editing, source grounding, and Board context.
            </p>
          </article>
        </div>
      </section>

      <section aria-labelledby="loom-shelves-title" style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <p style={eyebrowStyle}>Reference shelves</p>
          <h2 id="loom-shelves-title" style={sectionTitleStyle}>
            Yiping's current shelves are the first real instance.
          </h2>
        </div>
        <div style={shelfGridStyle}>
          {PERSONAL_PLATFORM_SECTIONS.map((section) => (
            <article key={section.id} className="new-loom-shell__shelf" style={shelfCardStyle}>
              <a href={section.href} style={shelfLinkStyle}>
                {section.label}
              </a>
              <p style={moduleTextStyle}>{section.summary}</p>
              <dl style={shelfMetaStyle}>
                <div>
                  <dt style={metaLabelStyle}>Status</dt>
                  <dd style={metaValueStyle}>{section.status}</dd>
                </div>
                <div>
                  <dt style={metaLabelStyle}>Next</dt>
                  <dd style={metaValueStyle}>{section.nextAction}</dd>
                </div>
              </dl>
              <div style={shelfColumnsStyle}>
                <ShelfList title="Path" items={section.pathSteps} />
                <ShelfList
                  title="Sources"
                  items={section.sourceGroups.flatMap((group) => [
                    group.title,
                    ...group.items,
                  ])}
                />
                <ShelfList title="Process" items={section.processItems} />
                <ShelfList
                  title="Outputs"
                  items={section.outputs.map((output) => output.title)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="loom-modules-title" style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <p style={eyebrowStyle}>Maturity</p>
          <h2 id="loom-modules-title" style={sectionTitleStyle}>
            The product story now names the platform beyond one user's archive.
          </h2>
        </div>
        <div style={moduleGridStyle}>
          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Narrative layers</h3>
            <ul style={stackListStyle}>
              {PERSONAL_PLATFORM_NARRATIVE_LAYERS.map((item) => (
                <li key={item.title} style={stackItemStyle}>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>{PERSONAL_PLATFORM_REFERENCE_INSTANCE.title}</h3>
            <p style={moduleTextStyle}>{PERSONAL_PLATFORM_REFERENCE_INSTANCE.text}</p>
          </article>

          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Positioning stack</h3>
            <ul style={stackListStyle}>
              {PERSONAL_PLATFORM_STACK.map((item) => (
                <li key={item.title} style={stackItemStyle}>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Progress</h3>
            <ul style={stackListStyle}>
              {PERSONAL_PLATFORM_PROGRESS.map((item) => (
                <li key={item.title} style={stackItemStyle}>
                  <strong>{item.title}</strong>
                  <span>{item.status}: {item.text}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Story</h3>
            <ol style={stackListStyle}>
              {PERSONAL_PLATFORM_HISTORY.map((item) => (
                <li key={item.date} style={stackItemStyle}>
                  <strong>{item.date}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ol>
          </article>

          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Process</h3>
            <ul style={stackListStyle}>
              {PERSONAL_PLATFORM_PROCESS.map((item) => (
                <li key={item.title} style={stackItemStyle}>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Outputs</h3>
            <ul style={stackListStyle}>
              {PERSONAL_PLATFORM_OUTPUTS.map((item) => (
                <li key={item.title} style={stackItemStyle}>
                  <strong>{item.title}</strong>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="new-loom-shell__module" style={moduleStyle}>
            <h3 style={moduleTitleStyle}>Native activity</h3>
            <p style={moduleTextStyle}>
              {ready
                ? formatNativeActivitySummary({ panelCount, pursuitCount, weaveCount })
                : 'Recent Loom activity appears here once your workspace is ready.'}
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

function ShelfList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 style={minorTitleStyle}>{title}</h3>
      <ul style={compactListStyle}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function HomeAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={actionStyle}>
      {label}
    </button>
  );
}

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'var(--bg)',
  color: 'var(--fg)',
  padding: 'clamp(3rem, 7vw, 6rem) clamp(1.25rem, 4vw, 4rem)',
};

const heroStyle: CSSProperties = {
  maxWidth: '76rem',
  margin: '0 auto',
  paddingBottom: 'clamp(2.5rem, 5vw, 4.5rem)',
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: 'var(--muted)',
  fontFamily: 'var(--sans)',
  fontSize: '0.78rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const titleStyle: CSSProperties = {
  maxWidth: '12ch',
  margin: '0.75rem 0 0',
  fontFamily: 'var(--display)',
  fontSize: 'clamp(3rem, 9vw, 7rem)',
  lineHeight: 0.94,
  letterSpacing: 0,
  color: 'var(--fg)',
};

const summaryStyle: CSSProperties = {
  maxWidth: '68ch',
  margin: '1.5rem 0 0',
  fontFamily: 'var(--serif)',
  fontSize: 'clamp(1.05rem, 1.5vw, 1.35rem)',
  lineHeight: 1.6,
  color: 'var(--fg-secondary)',
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.75rem',
  marginTop: '2rem',
};

const actionStyle: CSSProperties = {
  border: '1px solid var(--mat-border, rgba(26, 23, 18, 0.16))',
  borderRadius: 8,
  background: 'var(--paper, rgba(255,255,255,0.72))',
  color: 'var(--fg)',
  cursor: 'pointer',
  fontFamily: 'var(--sans)',
  fontSize: '0.92rem',
  fontWeight: 650,
  lineHeight: 1.2,
  padding: '0.72rem 0.9rem',
};

const sectionStyle: CSSProperties = {
  maxWidth: '76rem',
  margin: '0 auto',
  padding: 'clamp(2.2rem, 4vw, 3.5rem) 0',
  borderTop: '1px solid var(--mat-border, rgba(26, 23, 18, 0.12))',
};

const sectionHeaderStyle: CSSProperties = {
  display: 'grid',
  gap: '0.7rem',
  marginBottom: '1.25rem',
};

const sectionTitleStyle: CSSProperties = {
  maxWidth: '26ch',
  margin: 0,
  fontFamily: 'var(--display)',
  fontSize: 'clamp(1.8rem, 4vw, 3rem)',
  lineHeight: 1.04,
  letterSpacing: 0,
};

const modelGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: '0.75rem',
  padding: 0,
  margin: 0,
  listStyle: 'none',
};

const modelItemStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem',
  minHeight: '6rem',
  padding: '1rem',
  border: '1px solid var(--mat-border, rgba(26, 23, 18, 0.12))',
  borderRadius: 8,
  background: 'var(--paper, rgba(255,255,255,0.58))',
};

const modelNumberStyle: CSSProperties = {
  color: 'var(--muted)',
  fontFamily: 'var(--sans)',
  fontSize: '0.76rem',
  fontWeight: 700,
};

const twoColumnStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
  gap: '1rem',
};

const shelfGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
  gap: '1rem',
};

const shelfCardStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
  alignContent: 'start',
  border: '1px solid var(--mat-border, rgba(26, 23, 18, 0.12))',
  borderRadius: 8,
  padding: '1.1rem',
  background: 'var(--paper, rgba(255,255,255,0.58))',
};

const shelfLinkStyle: CSSProperties = {
  color: 'var(--fg)',
  fontFamily: 'var(--display)',
  fontSize: '1.6rem',
  lineHeight: 1,
  textDecoration: 'none',
};

const shelfMetaStyle: CSSProperties = {
  display: 'grid',
  gap: '0.75rem',
  margin: 0,
};

const metaLabelStyle: CSSProperties = {
  color: 'var(--muted)',
  fontFamily: 'var(--sans)',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const metaValueStyle: CSSProperties = {
  margin: '0.25rem 0 0',
  color: 'var(--fg-secondary)',
  fontFamily: 'var(--serif)',
  fontSize: '0.94rem',
  lineHeight: 1.45,
};

const shelfColumnsStyle: CSSProperties = {
  display: 'grid',
  gap: '0.85rem',
};

const moduleGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
  gap: '1rem',
};

const moduleStyle: CSSProperties = {
  display: 'grid',
  gap: '0.8rem',
  alignContent: 'start',
  minHeight: '10rem',
  border: '1px solid var(--mat-border, rgba(26, 23, 18, 0.12))',
  borderRadius: 8,
  padding: '1.1rem',
  background: 'var(--paper, rgba(255,255,255,0.58))',
};

const moduleTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--display)',
  fontSize: '1.35rem',
  lineHeight: 1.15,
};

const minorTitleStyle: CSSProperties = {
  margin: '0 0 0.35rem',
  color: 'var(--fg)',
  fontFamily: 'var(--sans)',
  fontSize: '0.82rem',
  fontWeight: 700,
};

const moduleTextStyle: CSSProperties = {
  margin: 0,
  color: 'var(--fg-secondary)',
  fontFamily: 'var(--serif)',
  fontSize: '0.96rem',
  lineHeight: 1.55,
};

const stackListStyle: CSSProperties = {
  display: 'grid',
  gap: '0.85rem',
  padding: 0,
  margin: 0,
  listStyle: 'none',
};

const stackItemStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  color: 'var(--fg-secondary)',
  fontFamily: 'var(--serif)',
  fontSize: '0.94rem',
  lineHeight: 1.45,
};

const compactListStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  padding: 0,
  margin: 0,
  listStyle: 'none',
  color: 'var(--fg-secondary)',
  fontFamily: 'var(--serif)',
  fontSize: '0.9rem',
  lineHeight: 1.4,
};
