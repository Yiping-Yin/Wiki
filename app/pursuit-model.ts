// M9 — Pursuit model types.
//
// Shared by the pursuit surfaces and the native bridge contract. Kept as
// a bare module (no 'use client', no React) so it can be imported from
// both server and client code without dragging either boundary across.

export type PursuitSeason =
  | 'active'
  | 'waiting'
  | 'held'
  | 'retired'
  | 'contradicted';

export type PursuitWeight = 'primary' | 'secondary' | 'tertiary';

export type PursuitSourceItem = {
  docId: string;
  href: string;
  title: string;
};

export type PursuitPanelItem = {
  id: string;
  title: string;
};

export type Pursuit = {
  id: string;
  question: string;
  weight: PursuitWeight;
  sources: number;
  panels: number;
  season: PursuitSeason;
  sourceItems?: PursuitSourceItem[];
  panelItems?: PursuitPanelItem[];
  /** Unix ms. Optional — only the `active` set carries a recent touch. */
  at?: number;
  /** Unix ms — stamped by `LoomPursuitWriter.updateSeason` when the
   *  season becomes 'held' or 'retired'. Present only after the first
   *  settle; cleared when the pursuit lifts back into an unsettled
   *  season. The web side only sets it optimistically in
   *  `PursuitDetailClient` so the meta line can read "held for X"
   *  before the native projection refreshes. */
  settledAt?: number;
};

const DAY_MS = 86_400_000;

/** Rough natural-language duration ("3 days", "2 months"). */
export function formatPursuitDuration(atMs: number | undefined): string {
  if (!atMs) return 'a while';
  const delta = Math.max(0, Date.now() - atMs);
  const days = Math.round(delta / DAY_MS);
  if (days <= 1) return 'today';
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}

export function seasonLabel(season: PursuitSeason): string {
  return season; // literal — per "No Metaphor Feature Names" the copy is plain
}

// Rough "how long in this season" heuristic — when the native payload
// omits explicit timestamps we still want the UI to speak in calm,
// non-numeric durations rather than showing blanks.
export function pursuitSeasonFor(p: Pursuit): string {
  if (p.at) return formatPursuitDuration(p.at);
  switch (p.season) {
    case 'active':
      return 'a few weeks';
    case 'waiting':
      return 'a month';
    case 'held':
      return 'since autumn';
    case 'retired':
      return 'a year';
    case 'contradicted':
      return 'recently';
  }
}
