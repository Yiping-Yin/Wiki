'use client';

import { useEffect, useMemo, useState } from 'react';
import { openShuttle } from '../lib/shuttle';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import { loadPanelRecords, PANEL_RECORDS_KEY } from '../lib/loom-panel-records';
import { loadPursuitRecords, PURSUIT_RECORDS_KEY } from '../lib/loom-pursuit-records';
import { loadWeaveRecords, WEAVE_RECORDS_KEY } from '../lib/loom-weave-records';
import {
  RECENT_RECORDS_KEY,
  loadLatestRecentRecord,
  type LoomRecentRecord,
} from '../lib/loom-recent-records';

/**
 * Home, rewritten from tile-workbench into a literary narration.
 *
 * One paragraph + three quiet actions, set on paper. The paragraph
 * reaches for the last document the reader set down and says, in a
 * human voice, where they paused.
 *
 * Real data wiring is deliberately thin: native mode uses direct
 * `loom://native/...` projections for recents / pursuits / panels /
 * weaves and falls back to quiet empties in browser preview.
 */

/**
 * Minimal shape of the active-pursuit projection used by the narration.
 * Mirrors the fields Swift exposes from the native pursuits projection:
 * `question` is the only load-bearing field for the question clause,
 * `at` drives recency sort, and `season` gates the active filter.
 */
type ActivePursuit = {
  question: string;
  at?: number;
  season: string;
};

/**
 * Pick the most-recently-touched active pursuit for the "question of ___"
 * clause in the narration. Filters to `season === 'active'` (the only
 * season that represents a question currently in attention), then sorts
 * by `at` desc. Returns null when the store is empty, malformed, or
 * contains no active pursuits — the caller falls back to the neutral
 * "what you were making of it" phrasing, which is correct behavior when
 * the reader hasn't held any question yet.
 */
function coerceLatestActivePursuit(raw: unknown): ActivePursuit | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const active: ActivePursuit[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    if (typeof o.question !== 'string' || typeof o.season !== 'string') continue;
    if (o.season !== 'active') continue;
    const at = typeof o.at === 'number' ? o.at : undefined;
    active.push({ question: o.question, at, season: o.season });
  }
  if (active.length === 0) return null;
  active.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return active[0] ?? null;
}

async function loadLatestActivePursuit(): Promise<ActivePursuit | null> {
  return coerceLatestActivePursuit(await loadPursuitRecords());
}

/**
 * Trim a pursuit question down to its first clause — the part that reads
 * naturally when spliced into "on the question of ___". A pursuit's
 * `question` field is authored as a full sentence (e.g. "What does it
 * mean to teach someone to stand?"), which would read awkwardly after
 * "on the question of". We:
 *   1. Drop trailing punctuation (?, !, ., …, Chinese fullwidth variants).
 *   2. Lowercase the first letter so it glides off the narration.
 *   3. Truncate at the first comma / em-dash / semicolon — the natural
 *      clause break in English prose. Keeps the narration to one
 *      breath-length even if the question is long.
 */
function firstClauseOfQuestion(question: string): string {
  let q = question.trim();
  if (q.length === 0) return q;
  // Strip trailing terminal punctuation (repeat to eat e.g. "?!").
  while (/[?!.。？！…\s]$/.test(q)) q = q.slice(0, -1);
  if (q.length === 0) return q;
  // First clause only — prefer the earliest English clause break.
  const breakMatch = q.match(/[,—;:]|\s-\s/);
  if (breakMatch?.index !== undefined) {
    q = q.slice(0, breakMatch.index).trim();
  }
  // Lowercase first letter so it reads as inline prose.
  return q.charAt(0).toLocaleLowerCase() + q.slice(1);
}

/**
 * Read the number of items stored at `key`. Returns 0 on unreadable /
 * malformed storage (and on SSR). An empty list is a valid zero.
 *
 * Tolerant of multiple shapes the Swift mirror has used: either a bare
 * JSON array, or an object with an `items`/`panels`/`pursuits`/`weaves`
 * array field. If we can't identify an array, we fall back to 0 rather
 * than pretending to know.
 */
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

function greeting(hour: number): string | null {
  if (hour < 10) return 'Morning.';
  if (hour < 18) return null;
  if (hour < 22) return 'Evening.';
  return 'Late.';
}

/**
 * Render a human duration since `at`. Matches the reference copy —
 * "Two hours since you last set it down." — rather than "2h ago".
 */
function durationSince(at: number | string | undefined): string {
  if (at === undefined) return 'Six minutes since the last weft.';
  const t = typeof at === 'number' ? at : Date.parse(String(at));
  if (!Number.isFinite(t)) return 'Six minutes since the last weft.';
  const ms = Date.now() - t;
  if (ms < 60_000) return 'A moment since you last set it down.';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) {
    return `${spellNumber(minutes)} ${minutes === 1 ? 'minute' : 'minutes'} since you last set it down.`;
  }
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) {
    return `${spellNumber(hours)} ${hours === 1 ? 'hour' : 'hours'} since you last set it down.`;
  }
  const days = Math.round(ms / 86_400_000);
  return `${spellNumber(days)} ${days === 1 ? 'day' : 'days'} since you last set it down.`;
}

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

function spellNumber(n: number): string {
  const words = [
    'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  ];
  return words[n] ?? String(n);
}

/**
 * Lowercase sibling of `spellNumber`, for inline prose rather than
 * sentence-initial position. Spells 0..10 as words, returns the numeric
 * form for 11+. Used by the quiet activity narration beneath the main
 * greeting — e.g. "three panels held. one pursuit. 12 weaves drawn."
 */
function spellOrNumber(n: number): string {
  const words = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
    'eight', 'nine', 'ten',
  ];
  if (n < 0) return String(n);
  return words[n] ?? String(n);
}

/**
 * Emphasize a fragment of the narration in the display face (non-italic)
 * so document titles read like titles and not like prose.
 */
function Title({ children }: { children: React.ReactNode }) {
  return (
    <em style={{ fontStyle: 'italic', fontWeight: 500 }}>{children}</em>
  );
}

export function HomeClient() {
  // Hydration-safe: compute everything on the client after mount.
  const [ready, setReady] = useState(false);
  const [recent, setRecent] = useState<LoomRecentRecord | null>(null);
  const [hour, setHour] = useState<number>(12);
  const [panelCount, setPanelCount] = useState(0);
  const [pursuitCount, setPursuitCount] = useState(0);
  const [weaveCount, setWeaveCount] = useState(0);
  const [activePursuit, setActivePursuit] = useState<ActivePursuit | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const [
        nextRecent,
        nextPanelCount,
        nextPursuitCount,
        nextWeaveCount,
        nextActivePursuit,
      ] = await Promise.all([
        loadLatestRecentRecord(),
        loadPanelRecords().then(countFromPayload),
        loadPursuitRecords().then(countFromPayload),
        loadWeaveRecords().then(countFromPayload),
        loadLatestActivePursuit(),
      ]);
      if (cancelled) return;
      setRecent(nextRecent);
      setPanelCount(nextPanelCount);
      setPursuitCount(nextPursuitCount);
      setWeaveCount(nextWeaveCount);
      setActivePursuit(nextActivePursuit);
      setReady(true);
    };
    setHour(new Date().getHours());
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Swift dispatches `loom-recents-updated` after mirroring native recents
  // into the webview's native bag. Re-read so the narration and "Return to
  // the passage" action reflect the new most-recent record without a reload.
  useEffect(() => {
    let cancelled = false;
    const handler = async () => {
      const next = await loadLatestRecentRecord();
      if (!cancelled) setRecent(next);
    };
    const dispose = subscribeLoomMirror(RECENT_RECORDS_KEY, 'loom-recents-updated', () => {
      void handler();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  // Same pattern for the three activity counters. Swift's SwiftData
  // projections dispatch the corresponding `loom-*-updated` CustomEvent;
  // each refresh re-reads the direct native endpoint in the macOS shell.
  useEffect(() => {
    let cancelled = false;
    const refreshPanels = async () => {
      const next = countFromPayload(await loadPanelRecords());
      if (!cancelled) setPanelCount(next);
    };
    // Pursuit records drive two independent narration pieces: the raw
    // count in the quiet stats line, and the "on the question of ___"
    // clause in the main paragraph. Keep both in the same refresh
    // path so the shape and the prose never disagree.
    const refreshPursuits = async () => {
      const [nextCount, nextActive] = await Promise.all([
        loadPursuitRecords().then(countFromPayload),
        loadLatestActivePursuit(),
      ]);
      if (cancelled) return;
      setPursuitCount(nextCount);
      setActivePursuit(nextActive);
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

  const open = greeting(hour);

  const body = useMemo(() => {
    if (!recent) {
      return (
        <>
          {open ? <span>{open} </span> : null}
          <span>Open your first book.</span>
        </>
      );
    }

    // Wire the "on the question of ___" clause to the user's latest
    // active pursuit. Full sentence questions (e.g. "What does it mean
    // to teach someone to stand?") are clipped to their first clause so
    // they read as inline prose, not as a quoted interrogative.
    //
    // Fallback — no active pursuits held — keeps the neutral phrasing
    // the surface shipped with. This is intentionally honest: if the
    // user hasn't held any question yet, the narration shouldn't invent
    // one (per "learn, don't organize" — fabricating interiority is a
    // veto). "what you were making of it" reads equally well after both
    // a real book title and a placeholder.
    const question = activePursuit
      ? firstClauseOfQuestion(activePursuit.question)
      : 'what you were making of it';
    return (
      <>
        {open ? <span>{open} </span> : null}
        <span>You stopped mid-thought in </span>
        <Title>{recent.title}</Title>
        <span>, on the question of {question}.</span>
      </>
    );
  }, [open, recent, activePursuit]);

  const subtitle = useMemo(() => {
    if (!recent) return null;
    return durationSince(recent.at);
  }, [recent]);

  const handleReturn = (href: string) => {
    if (callNativeBridge('navigate', { href })) return;
    window.location.href = href;
  };

  const handleOpenSource = () => {
    openShuttle();
  };

  const handleSetDown = () => {
    // Prefer native Evening window; fall back to Shuttle if no bridge.
    if (!callNativeBridge('openEvening')) {
      openShuttle();
    }
  };

  return (
    <main
      style={{
        background: 'var(--bg)',
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <section
        style={{
          width: 'clamp(30rem, 36vw + 8rem, 44rem)',
          maxWidth: '100%',
          paddingTop: 'clamp(5rem, 8vh, 8rem)',
          paddingBottom: 'clamp(3rem, 6vh, 5rem)',
          paddingLeft: '2rem',
          paddingRight: '2rem',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--display)',
            fontSize: 'clamp(1.6rem, 1.8vw + 0.6rem, 2.2rem)',
            fontStyle: 'italic',
            lineHeight: 1.4,
            letterSpacing: '-0.01em',
            color: 'var(--fg)',
            margin: 0,
            fontVariantNumeric: 'oldstyle-nums proportional-nums',
            fontFeatureSettings: '"onum", "pnum"',
          }}
        >
          {body}
        </p>

        {ready && (panelCount > 0 || pursuitCount > 0 || weaveCount > 0) ? (
          <p className="loom-home-stats">
            {spellOrNumber(panelCount)} {panelCount === 1 ? 'panel' : 'panels'} held.{' '}
            {spellOrNumber(pursuitCount)} {pursuitCount === 1 ? 'pursuit' : 'pursuits'}.{' '}
            {spellOrNumber(weaveCount)} {weaveCount === 1 ? 'weave' : 'weaves'} drawn.
          </p>
        ) : null}

        {/* Fresh-user promises — only rendered on a completely quiet
            Home (no recent doc, no panels/pursuits/weaves yet). Once
            the user has any activity these disappear so they don't
            read as marketing on every return visit. Matches the
            numbered Cormorant promises in loom-entry.jsx:52-62. */}
        {!recent && panelCount === 0 && pursuitCount === 0 && weaveCount === 0 ? (
          <div style={{ marginTop: '3rem', maxWidth: '30rem' }}>
            <HomePromise
              n="i"
              title="Reading is the center."
              body="No dashboards. No feeds. A page of vellum, and your hand in the margin."
            />
            <HomePromise
              n="ii"
              title="The second weaver stays in the margin."
              body="Ask with ⌘E. An idea, drawn in pencil. Dismiss with Esc."
            />
            <HomePromise
              n="iii"
              title="What settles, settles."
              body="When a phrase returns three times, a panel is offered. You decide whether to keep it."
            />
          </div>
        ) : null}

        {subtitle ? (
          <p
            style={{
              fontFamily: 'var(--serif)',
              fontSize: '0.95rem',
              fontStyle: 'italic',
              color: 'var(--fg-secondary)',
              marginTop: '1rem',
              marginBottom: 0,
            }}
          >
            {subtitle}
          </p>
        ) : null}

        <div
          style={{
            marginTop: '3rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            alignItems: 'baseline',
          }}
        >
          {recent ? (
            <LiteraryAction onClick={() => handleReturn(recent.href)} label="Return to the passage" />
          ) : null}
          <LiteraryAction onClick={handleOpenSource} label="Open a source" />
          {recent ? (
            <LiteraryAction onClick={handleSetDown} label="Set it down for today" />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function LiteraryAction({ label, onClick }: { label: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid',
        borderBottomColor: hover ? 'var(--accent)' : 'transparent',
        padding: '0 0 2px 0',
        margin: 0,
        fontFamily: 'var(--serif)',
        fontStyle: 'italic',
        fontSize: '1rem',
        lineHeight: 1.4,
        color: hover ? 'var(--accent-text)' : 'var(--fg-secondary)',
        cursor: 'pointer',
        transition: 'color 160ms ease, border-bottom-color 160ms ease',
      }}
    >
      {label}
    </button>
  );
}

/**
 * A numbered promise in the fresh-user home-greeting stack. Matches
 * `loom-entry.jsx:129-150`'s `<Promise>` component: roman numeral in
 * bronze Cormorant-italic at oldstyle numerals, title in ink
 * Cormorant-italic, body in muted serif. The 40px numeral column
 * gives each promise a gutter that reads as the edge of a page.
 */
function HomePromise({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '40px 1fr',
      gap: '0.9rem',
      padding: '1rem 0',
      borderTop: '0.5px solid var(--mat-border, rgba(26,23,18,0.04))',
    }}>
      <div style={{
        fontFamily: 'var(--display)',
        fontStyle: 'italic',
        fontSize: '1.35rem',
        color: 'var(--accent)',
        fontVariantNumeric: 'oldstyle-nums',
        textAlign: 'right',
        paddingRight: '0.4rem',
      }}>
        {n}
      </div>
      <div>
        <div style={{
          fontFamily: 'var(--display)',
          fontSize: '1.2rem',
          fontStyle: 'italic',
          color: 'var(--fg)',
          lineHeight: 1.25,
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: 'var(--serif)',
          fontSize: '0.92rem',
          lineHeight: 1.55,
          color: 'var(--fg-secondary)',
          marginTop: '0.3rem',
        }}>
          {body}
        </div>
      </div>
    </div>
  );
}
