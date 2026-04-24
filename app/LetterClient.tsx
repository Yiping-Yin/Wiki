'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY, type LoomPanelRecord } from '../lib/loom-panel-records';

type StoredPanel = Pick<LoomPanelRecord, 'id' | 'title' | 'body' | 'at'>;

type LetterPanel = {
  id: string;
  title: string;
  excerpt: string;
};

function firstExcerpt(body: string | undefined): string {
  const text = (body ?? '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find(Boolean) ?? '';
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

async function loadLetterPanel(): Promise<LetterPanel | null> {
  const entry = (await loadPanelRecords())
    .filter((item): item is StoredPanel => (
      typeof item.id === 'string'
      && typeof item.title === 'string'
      && item.title.length > 0
    ))
    .sort((a, b) => (typeof b.at === 'number' ? b.at : 0) - (typeof a.at === 'number' ? a.at : 0))[0];
  if (!entry || typeof entry.id !== 'string' || typeof entry.title !== 'string') return null;
  return {
    id: entry.id,
    title: entry.title,
    excerpt: firstExcerpt(entry.body),
  };
}

export default function LetterClient() {
  const [panel, setPanel] = useState<LetterPanel | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await loadLetterPanel();
      if (!cancelled) setPanel(next);
    };
    void refresh();
    const dispose = subscribeLoomMirror(PANEL_RECORDS_KEY, 'loom-panels-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  if (!panel) {
    return (
      <main className="loom-letter">
        <div className="loom-example-eyebrow">Letter · waiting for a held panel</div>
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            Letter opens when one held panel is ready to be offered to someone else.
            Nothing is being sent yet.
          </p>
          <Link href="/patterns" className="loom-empty-state-action">
            Open Patterns →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="loom-letter">
      <div className="loom-example-eyebrow">Letter · latest held panel preview</div>

      <div className="loom-letter-envelope" aria-label="held panel preview">
        <div className="loom-letter-envelope-flap" aria-hidden="true" />
        <div className="loom-letter-seal" aria-hidden="true">
          L
        </div>
        <div className="loom-letter-address">
          <div className="loom-letter-address-eyebrow">preview</div>
          <div className="loom-letter-address-to">no recipient stored yet</div>
          <div className="loom-letter-address-hair" aria-hidden="true" />
          <div className="loom-letter-address-meta">
            Loom does not yet store recipients or delivery drafts.
          </div>
        </div>
      </div>

      <article className="loom-letter-body">
        <div className="loom-letter-date">latest held panel</div>
        <div className="loom-letter-hair" aria-hidden="true" />

        <div className="loom-letter-greeting">Preview only</div>

        <p className="loom-letter-prose">
          The only real thing here today is the latest held panel below. Letter will stay gated until
          recipient, note, and delivery objects exist.
        </p>

        <p className="loom-letter-prose">
          <span className="loom-letter-highlight">{panel.title}</span>
        </p>

        <p className="loom-letter-prose">
          {panel.excerpt || 'This held panel has not been written into prose yet.'}
        </p>

        <div className="loom-letter-signature">— chapter reserved</div>
      </article>

      <div className="loom-letter-footer">
        <span>latest held panel · {panel.title}</span>
        <span>open panel &nbsp;·&nbsp; <Link href={`/panel/${encodeURIComponent(panel.id)}`}>view</Link></span>
        <span>recipient and note still gated</span>
      </div>
    </main>
  );
}
