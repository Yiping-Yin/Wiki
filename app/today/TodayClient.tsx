'use client';
/**
 * /today — the daily free-thinking surface.
 *
 * §1, §6, §11 — Loom is not a productivity dashboard. The previous version
 * of this page mounted Apple-Fitness-style daily rings, fire-emoji streaks,
 * GitHub heatmaps, "weak spots" scoring, and three nested hero sections.
 * That entire framing — "close your rings, hit your goals" — is exactly
 * the gamified surveillance UX that §11 forbids and that ChatGPT-style
 * tools mistake for engagement.
 *
 * What /today actually IS: the entry point for today's thinking. Two
 * quiet questions — what was read today, and what is pinned for later —
 * set in Vellum literary type. A day is not a to-do list.
 */
import { useEffect, useState } from 'react';
import { subscribeLoomMirror } from '../../lib/loom-mirror-store';
import {
  RECENT_RECORDS_KEY,
  loadRecentRecords,
  type LoomRecentRecord,
} from '../../lib/loom-recent-records';

type Row = { href: string; title: string };

function greetingFor(hour: number): string {
  if (hour < 5) return 'Late.';
  if (hour < 12) return 'Morning.';
  if (hour < 18) return 'Afternoon.';
  if (hour < 22) return 'Evening.';
  return 'Late.';
}

function toMs(at: unknown): number {
  if (typeof at === 'number') return at;
  if (typeof at === 'string') { const n = Date.parse(at); return Number.isFinite(n) ? n : 0; }
  return 0;
}

function readJson(key: string): unknown[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function rowsReadToday(records: LoomRecentRecord[]): Row[] {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const threshold = start.getTime();
  const rows: Row[] = [];
  for (const r of records) {
    if (toMs(r.at) < threshold) continue;
    rows.push({ href: r.href, title: r.title });
    if (rows.length >= 5) break;
  }
  return rows;
}

async function loadToday(): Promise<Row[]> {
  return rowsReadToday(await loadRecentRecords());
}

function readPinned(): Row[] {
  const rows: Row[] = [];
  for (const entry of readJson('loom.pinned.v1')) {
    const r = entry as { href?: unknown; title?: unknown };
    if (typeof r?.href !== 'string' || typeof r?.title !== 'string') continue;
    rows.push({ href: r.href, title: r.title });
  }
  return rows;
}

export function TodayClient(_props: { totalDocs: number; docsLite: unknown[]; daily: unknown; recentCoworks?: unknown[]; embedded?: boolean }) {
  const { embedded = false } = _props;
  const [mounted, setMounted] = useState(false);
  const [greeting, setGreeting] = useState('Morning.');
  const [read, setRead] = useState<Row[]>([]);
  const [pinned, setPinned] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const rows = await loadToday();
      if (!cancelled) setRead(rows);
    };
    setGreeting(greetingFor(new Date().getHours()));
    void hydrate();
    setPinned(readPinned());
    setMounted(true);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const rows = await loadToday();
      if (!cancelled) setRead(rows);
    };
    const dispose = subscribeLoomMirror(RECENT_RECORDS_KEY, 'loom-recents-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  const Container = embedded ? 'section' : 'main';
  const className = embedded ? 'loom-today loom-today--embedded' : 'loom-today';

  if (!mounted) return <Container className={className} />;

  const go = (href: string) => { window.location.href = href; };
  const isQuiet = read.length === 0 && pinned.length === 0;

  return (
    <Container className={className}>
      <p className="loom-today-greeting">{greeting}</p>

      <Section label="What you have read today." rows={read} emptyLabel="Nothing yet." onGo={go} />
      <Section label="What you have pinned for later." rows={pinned} emptyLabel="A day is not a to-do list." onGo={go} />

      {/* Actions adapt to state. On a completely quiet day (fresh
          install or nothing read), only "Open a source" makes sense —
          "Return to the warp thread" implies prior work, "Set it down"
          implies something to set down. Showing all three on empty is
          dead chrome. Re-expand once the user has any reading or
          pinned material to warrant the other actions. */}
      <div className="loom-today-actions">
        {isQuiet ? (
          <LiteraryAction label="Open your first source →" onClick={() => go('/sources')} />
        ) : (
          <>
            <LiteraryAction label="Return to the warp thread →" onClick={() => go('/')} />
            <LiteraryAction label="Open a new book →" onClick={() => go('/sources')} />
            <LiteraryAction label="Set it down for today" onClick={() => go('/')} />
          </>
        )}
      </div>
    </Container>
  );
}

function Section({ label, rows, emptyLabel, onGo }: { label: string; rows: Row[]; emptyLabel: string; onGo: (href: string) => void }) {
  return (
    <section className="loom-today-section">
      <p className="loom-today-section-label">{label}</p>
      {rows.length === 0 ? (
        <p className="loom-today-empty">{emptyLabel}</p>
      ) : (
        <ul className="loom-today-list">
          {rows.map((r) => (
            <li key={r.href}>
              <a className="loom-today-item" href={r.href} onClick={(e) => { e.preventDefault(); onGo(r.href); }}>
                {r.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
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
