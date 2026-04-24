'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY, type LoomPanelRecord } from '../lib/loom-panel-records';

// M16 — Branching. Argument-as-a-tree client.
//
// When no panels exist, renders the honest empty state. When panels
// exist, picks the most recent one (or `?focus=<panelId>` if provided)
// as the thesis and renders its thoughts as support branches on the
// left. If the panel has three or more thoughts, the last one is
// demoted to a counter on the right — a best-effort placeholder until
// thoughts carry a `kind` tag. SVG paths trace each branch to the
// trunk.
//
// Data source: native mode fetches `loom://native/panels.json`
// directly from SwiftData. Browser preview falls back to the shared
// mirror helper. Updates propagate via `loom-panels-updated`.

type StoredPanel = LoomPanelRecord;

type BranchPanel = {
  id: string;
  title: string;
  sub: string;
  color: string;
  at: number;
  thoughts: string[];
};

type PaletteKey = 'thread' | 'rose' | 'sage' | 'indigo' | 'umber' | 'plum' | 'ochre';

const PALETTE: Record<PaletteKey, string> = {
  thread: '#9E7C3E',
  rose:   '#8F4646',
  sage:   '#5C6E4E',
  indigo: '#3A477A',
  umber:  '#5C3F2A',
  plum:   '#5E3D5C',
  ochre:  '#A8783E',
};

function isPaletteKey(value: unknown): value is PaletteKey {
  return typeof value === 'string' && value in PALETTE;
}

function resolvePanelColor(raw: unknown): string {
  if (isPaletteKey(raw)) return PALETTE[raw];
  if (typeof raw === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(raw)) return raw;
  return PALETTE.thread;
}

function coercePanels(raw: unknown): BranchPanel[] {
  if (!Array.isArray(raw)) return [];
  const out: BranchPanel[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as StoredPanel;
    const title = typeof entry.title === 'string' ? entry.title : null;
    if (!title) continue;
    const id = typeof entry.id === 'string' ? entry.id : `b-${out.length}`;
    const sub =
      (typeof entry.sub === 'string' && entry.sub)
      || (typeof entry.subtitle === 'string' && entry.subtitle)
      || '';
    const thoughts = Array.isArray(entry.thoughts)
      ? entry.thoughts.filter((t): t is string => typeof t === 'string' && t.length > 0)
      : [];
    out.push({
      id,
      title,
      sub,
      color: resolvePanelColor(entry.color),
      at: typeof entry.at === 'number' ? entry.at : 0,
      thoughts,
    });
  }
  return out;
}

async function loadPanels(): Promise<BranchPanel[]> {
  return coercePanels(await loadPanelRecords());
}

export function BranchingClient() {
  const [panels, setPanels] = useState<BranchPanel[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const next = await loadPanels();
      if (!cancelled) setPanels(next);
    };
    void refresh();
    const search = new URLSearchParams(window.location.search);
    setFocusId(search.get('focus'));
    const dispose = subscribeLoomMirror(PANEL_RECORDS_KEY, 'loom-panels-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  const thesis = useMemo<BranchPanel | null>(() => {
    if (panels.length === 0) return null;
    if (focusId) {
      const match = panels.find((p) => p.id === focusId);
      if (match) return match;
    }
    // Most recent by `at`; stable fallback to first.
    return [...panels].sort((a, b) => b.at - a.at)[0] ?? panels[0];
  }, [panels, focusId]);

  if (!thesis) {
    return (
      <div className="loom-branching">
        <header className="loom-branching-header">
          <div className="loom-branching-eyebrow">Branching · argument map</div>
          <div className="loom-branching-thesis">Branching.</div>
        </header>

        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            A branching diagram draws itself around a thesis with its
            supports and counters. Crystallize a pattern first; branching
            will take shape around it.
          </p>
          <Link href="/patterns" className="loom-empty-state-action">
            Patterns →
          </Link>
        </div>
      </div>
    );
  }

  // Split thoughts: if we have >=3 thoughts, the last one becomes a
  // provisional counter. This is best-effort; once thoughts carry a
  // `kind` tag the split will happen on that instead.
  const thoughts = thesis.thoughts;
  const hasCounter = thoughts.length >= 3;
  const supports = hasCounter ? thoughts.slice(0, -1) : thoughts;
  const counters = hasCounter ? [thoughts[thoughts.length - 1]] : [];

  return (
    <div className="loom-branching">
      <header className="loom-branching-header">
        <div className="loom-branching-eyebrow">Branching · a tree</div>
        <div
          className="loom-branching-thesis"
          style={{ borderColor: thesis.color } as React.CSSProperties}
        >
          {thesis.title}
        </div>
        <p
          className="loom-branching-source"
          style={{
            fontFamily: 'var(--serif)',
            fontStyle: 'italic',
            fontSize: '0.88rem',
            color: 'var(--muted)',
            marginTop: '0.75rem',
          }}
        >
          {thesis.sub || 'Claim standing here'}
        </p>
      </header>

      <div className="loom-branching-tree">
        {/* SVG branches — one quadratic curve per thought, from the
            trunk top center out to the first row of nodes. Kept under
            the columns via z-index from globals.css. */}
        <svg
          className="loom-branching-svg"
          viewBox="0 0 1000 600"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {supports.map((_, i) => {
            const y = 60 + i * 80;
            return (
              <path
                key={`s-${i}`}
                d={`M 500 0 Q 400 ${y * 0.5} 260 ${y}`}
                fill="none"
                stroke="#5C6E4E"
                strokeOpacity={0.35}
                strokeWidth={0.75}
              />
            );
          })}
          {counters.map((_, i) => {
            const y = 60 + i * 80;
            return (
              <path
                key={`c-${i}`}
                d={`M 500 0 Q 600 ${y * 0.5} 740 ${y}`}
                fill="none"
                stroke="#8F4646"
                strokeOpacity={0.35}
                strokeWidth={0.75}
                strokeDasharray="3 4"
              />
            );
          })}
        </svg>

        <div className="loom-branching-columns">
          <div className="loom-branching-column supports">
            <h2>Supports</h2>
            {supports.length === 0 ? (
              <div className="loom-branch-node" style={{ opacity: 0.6 }}>
                No supports yet. Anchor a thought to begin a branch.
              </div>
            ) : (
              supports.map((text, i) => (
                <div className="loom-branch-group" key={`sup-${i}`}>
                  <div className="loom-branch-node">
                    {text}
                    <div className="loom-branch-node-source">{thesis.sub}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="loom-branching-column counters">
            <h2>Counters</h2>
            {counters.length === 0 ? (
              <div className="loom-branch-node" style={{ opacity: 0.5 }}>
                No counters yet.
              </div>
            ) : (
              counters.map((text, i) => (
                <div className="loom-branch-group" key={`ctr-${i}`}>
                  <div className="loom-branch-node">
                    {text}
                    <div className="loom-branch-node-source">provisional</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="loom-branching-footer">
        <span>
          <kbd>⌘B</kbd> add branch
        </span>
        <span>
          <kbd>⌘⇧↑</kbd> promote
        </span>
        <span>
          <kbd>⎋</kbd> prune
        </span>
      </div>
    </div>
  );
}
